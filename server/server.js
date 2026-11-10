// import "dotenv/config";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { createServer } from "node:http";
import bcrypt from "bcrypt";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";

dotenv.config();

const requiredEnvironment = [
  "DB_HOST",
  "DB_USER",
  "DB_NAME",
  "JWT_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM",
];
const missingEnvironment = requiredEnvironment.filter(
  (key) => !process.env[key],
);
if (missingEnvironment.length) {
  throw new Error(
    `Missing required environment variables: ${missingEnvironment.join(", ")}`,
  );
}

const port = Number(process.env.PORT || 5000);
const jwtSecret = process.env.JWT_SECRET;
const siteUrl = process.env.SITE_URL || "http://localhost:5173";
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [siteUrl, "http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PATCH"],
  },
});
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
});
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
});
const onlineUsers = new Map();
const authAttempts = new Map();

app.use(
  cors({
    origin: [siteUrl, "http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PATCH"],
  }),
);
app.use(express.json({ limit: "12kb" }));

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

function limitAuthRequests(req, res, next) {
  const now = Date.now();
  const current = authAttempts.get(req.ip);
  if (!current || current.resetAt <= now) {
    authAttempts.set(req.ip, { count: 1, resetAt: now + 15 * 60_000 });
    return next();
  }
  if (current.count >= 20)
    return res.status(429).json({
      error: "Too many authentication attempts. Please try again later.",
    });
  current.count += 1;
  return next();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function issueToken(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, {
    expiresIn: "7d",
    issuer: "meetly",
  });
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function hashOtp(email, code) {
  return crypto
    .createHmac("sha256", jwtSecret)
    .update(`${email}:${code}`)
    .digest("hex");
}

function htmlEscape(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

async function sendOtp(email, name, purpose, passwordHash = null) {
  const [existing] = await db.execute(
    "SELECT last_sent_at FROM otp_challenges WHERE email = ?",
    [email],
  );
  if (
    existing.length &&
    Date.now() - new Date(existing[0].last_sent_at).getTime() < 60_000
  ) {
    const error = new Error(
      "Please wait a minute before requesting another code.",
    );
    error.status = 429;
    throw error;
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashOtp(email, code);
  await db.execute(
    `INSERT INTO otp_challenges (email, purpose, name, password_hash, code_hash, expires_at, last_sent_at, attempts)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), UTC_TIMESTAMP(), 0)
     ON DUPLICATE KEY UPDATE purpose = VALUES(purpose), name = VALUES(name),
       password_hash = VALUES(password_hash), code_hash = VALUES(code_hash),
       expires_at = VALUES(expires_at), last_sent_at = VALUES(last_sent_at), attempts = 0`,
    [email, purpose, name, passwordHash, codeHash],
  );

  try {
    await mailer.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `${code} is your Meetify verification code`,
      text: `Hi ${name},\n\nYour Meetify verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Hi ${htmlEscape(name)},</p><p>Your Meetify verification code is <strong style="font-size:24px;letter-spacing:5px">${code}</strong>.</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    });
  } catch (error) {
    await db.execute(
      "DELETE FROM otp_challenges WHERE email = ? AND code_hash = ?",
      [email, codeHash],
    );
    throw new Error(
      "We could not send the verification email. Please try again later.",
      { cause: error },
    );
  }
}

async function getValidOtp(connection, email, code, purpose) {
  const [rows] = await connection.execute(
    "SELECT purpose, name, password_hash, code_hash, expires_at, attempts FROM otp_challenges WHERE email = ? FOR UPDATE",
    [email],
  );
  const challenge = rows[0];
  if (
    !challenge ||
    challenge.purpose !== purpose ||
    new Date(challenge.expires_at).getTime() <= Date.now()
  ) {
    const error = new Error("That verification code is invalid or expired.");
    error.status = 400;
    throw error;
  }
  if (challenge.attempts >= 5) {
    await connection.execute("DELETE FROM otp_challenges WHERE email = ?", [
      email,
    ]);
    const error = new Error(
      "Too many incorrect codes. Request a new verification email.",
    );
    error.status = 429;
    error.persist = true;
    throw error;
  }
  if (!safeEqual(hashOtp(email, code), challenge.code_hash)) {
    await connection.execute(
      "UPDATE otp_challenges SET attempts = attempts + 1 WHERE email = ?",
      [email],
    );
    const error = new Error("That verification code is invalid or expired.");
    error.status = 400;
    error.persist = true;
    throw error;
  }
  return challenge;
}

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!token)
    return res.status(401).json({ error: "Please sign in to continue." });
  try {
    const claims = jwt.verify(token, jwtSecret, { issuer: "meetly" });
    const [rows] = await db.execute(
      "SELECT id, name, email FROM users WHERE id = ?",
      [claims.sub],
    );
    if (!rows[0])
      return res.status(401).json({
        error: "Your session is no longer valid. Please sign in again.",
      });
    req.user = rows[0];
    return next();
  } catch (error) {
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
      return res
        .status(401)
        .json({ error: "Your session has expired. Please sign in again." });
    }
    return next(error);
  }
}

function sortedPair(first, second) {
  return first < second ? [first, second] : [second, first];
}

async function findConversation(first, second) {
  const [low, high] = sortedPair(first, second);
  const [rows] = await db.execute(
    "SELECT id FROM conversations WHERE user_low = ? AND user_high = ?",
    [low, high],
  );
  if (rows[0]) return rows[0].id;
  const id = uuid();
  try {
    await db.execute(
      "INSERT INTO conversations (id, user_low, user_high) VALUES (?, ?, ?)",
      [id, low, high],
    );
    return id;
  } catch (error) {
    if (error.code !== "ER_DUP_ENTRY") throw error;
    const [existing] = await db.execute(
      "SELECT id FROM conversations WHERE user_low = ? AND user_high = ?",
      [low, high],
    );
    return existing[0].id;
  }
}

async function initializeDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(100) NOT NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS otp_challenges (
      email VARCHAR(254) NOT NULL PRIMARY KEY,
      purpose VARCHAR(16) NOT NULL,
      name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(100) NULL,
      code_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      last_sent_at DATETIME NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id CHAR(36) NOT NULL PRIMARY KEY,
      user_low CHAR(36) NOT NULL,
      user_high CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_conversation (user_low, user_high),
      CONSTRAINT conversation_low_user FOREIGN KEY (user_low) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT conversation_high_user FOREIGN KEY (user_high) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id CHAR(36) NOT NULL PRIMARY KEY,
      conversation_id CHAR(36) NOT NULL,
      sender_id CHAR(36) NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX conversation_messages (conversation_id, created_at),
      CONSTRAINT message_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT message_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id CHAR(36) NOT NULL PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      host_id CHAR(36) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT meeting_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS meeting_requests (
      id CHAR(36) NOT NULL PRIMARY KEY,
      meeting_id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'waiting',
      requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at DATETIME NULL,
      UNIQUE KEY unique_meeting_request (meeting_id, user_id),
      INDEX meeting_waiting_requests (meeting_id, status),
      CONSTRAINT request_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
      CONSTRAINT request_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.post(
  "/api/auth/register/request-otp",
  limitAuthRequests,
  asyncRoute(async (req, res) => {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = normalizeEmail(req.body.email);
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (
      name.length < 2 ||
      name.length > 100 ||
      !validEmail(email) ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        error:
          "Enter your name, a valid email address, and a password of at least 8 characters.",
      });
    }
    const [users] = await db.execute("SELECT id FROM users WHERE email = ?", [
      email,
    ]);
    if (users.length)
      return res
        .status(409)
        .json({ error: "An account already exists for that email." });
    await sendOtp(email, name, "register", await bcrypt.hash(password, 12));
    return res.json({
      message: "A verification code has been sent to your email.",
    });
  }),
);

app.post(
  "/api/auth/register/verify",
  limitAuthRequests,
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
    if (!validEmail(email) || !/^\d{6}$/.test(code))
      return res
        .status(400)
        .json({ error: "Enter the email address and 6-digit code." });
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const challenge = await getValidOtp(connection, email, code, "register");
      const user = { id: uuid(), name: challenge.name, email };
      await connection.execute(
        "INSERT INTO users (id, name, email, password_hash, email_verified) VALUES (?, ?, ?, ?, 1)",
        [user.id, user.name, email, challenge.password_hash],
      );
      await connection.execute("DELETE FROM otp_challenges WHERE email = ?", [
        email,
      ]);
      await connection.commit();
      return res
        .status(201)
        .json({ token: issueToken(user), user: publicUser(user) });
    } catch (error) {
      if (error.persist) await connection.commit();
      else await connection.rollback();
      if (error.code === "ER_DUP_ENTRY")
        return res
          .status(409)
          .json({ error: "An account already exists for that email." });
      throw error;
    } finally {
      connection.release();
    }
  }),
);

app.post(
  "/api/auth/login/request-otp",
  limitAuthRequests,
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (!validEmail(email) || !password)
      return res
        .status(400)
        .json({ error: "Enter a valid email address and password." });
    const [users] = await db.execute(
      "SELECT id, name, email, password_hash FROM users WHERE email = ? AND email_verified = 1",
      [email],
    );
    if (
      !users[0] ||
      !(await bcrypt.compare(password, users[0].password_hash))
    ) {
      return res
        .status(401)
        .json({ error: "The email or password is incorrect." });
    }
    await sendOtp(email, users[0].name, "login");
    return res.json({ message: "A sign-in code has been sent to your email." });
  }),
);

app.post(
  "/api/auth/login/verify",
  limitAuthRequests,
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
    if (!validEmail(email) || !/^\d{6}$/.test(code))
      return res
        .status(400)
        .json({ error: "Enter the email address and 6-digit code." });
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const challenge = await getValidOtp(connection, email, code, "login");
      const [users] = await connection.execute(
        "SELECT id, name, email FROM users WHERE email = ? AND email_verified = 1",
        [email],
      );
      if (!users[0]) {
        await connection.execute("DELETE FROM otp_challenges WHERE email = ?", [
          email,
        ]);
        await connection.commit();
        return res.status(401).json({
          error: "This account could not be verified. Please sign in again.",
        });
      }
      await connection.execute("DELETE FROM otp_challenges WHERE email = ?", [
        email,
      ]);
      await connection.commit();
      return res.json({
        token: issueToken(users[0]),
        user: publicUser(users[0]),
      });
    } catch (error) {
      if (error.persist) await connection.commit();
      else await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

app.get("/api/auth/me", authenticate, (req, res) =>
  res.json({ user: publicUser(req.user) }),
);

app.get(
  "/api/users",
  authenticate,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      "SELECT id, name, email FROM users WHERE id <> ? AND email_verified = 1 ORDER BY name",
      [req.user.id],
    );
    return res.json({
      users: rows.map((user) => ({
        ...publicUser(user),
        online: onlineUsers.has(user.id),
      })),
    });
  }),
);

app.get(
  "/api/chats",
  authenticate,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT c.id AS conversationId, u.id AS userId, u.name, u.email,
       m.id AS lastMessageId, m.sender_id AS lastSenderId, m.body AS lastMessage, m.created_at AS lastMessageAt
     FROM conversations c
     JOIN users u ON u.id = IF(c.user_low = ?, c.user_high, c.user_low)
     LEFT JOIN messages m ON m.id = (
       SELECT latest.id FROM messages latest
       WHERE latest.conversation_id = c.id ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
     )
     WHERE c.user_low = ? OR c.user_high = ?
     ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [req.user.id, req.user.id, req.user.id],
    );
    return res.json({
      chats: rows.map((row) => ({
        conversationId: row.conversationId,
        user: {
          id: row.userId,
          name: row.name,
          email: row.email,
          online: onlineUsers.has(row.userId),
        },
        lastMessage: row.lastMessageId
          ? {
              id: row.lastMessageId,
              senderId: row.lastSenderId,
              text: row.lastMessage,
              createdAt: row.lastMessageAt,
            }
          : null,
      })),
    });
  }),
);

app.get(
  "/api/chats/:userId/messages",
  authenticate,
  asyncRoute(async (req, res) => {
    if (req.params.userId === req.user.id)
      return res
        .status(400)
        .json({ error: "You cannot start a conversation with yourself." });
    const [recipients] = await db.execute(
      "SELECT id FROM users WHERE id = ? AND email_verified = 1",
      [req.params.userId],
    );
    if (!recipients[0])
      return res.status(404).json({ error: "That user could not be found." });
    const conversationId = await findConversation(
      req.user.id,
      req.params.userId,
    );
    const [rows] = await db.execute(
      "SELECT id, sender_id AS senderId, body AS text, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at, id LIMIT 200",
      [conversationId],
    );
    return res.json({ messages: rows });
  }),
);

app.post(
  "/api/chats/:userId/messages",
  authenticate,
  asyncRoute(async (req, res) => {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 4000)
      return res.status(400).json({
        error: "Messages must contain between 1 and 4,000 characters.",
      });
    if (req.params.userId === req.user.id)
      return res.status(400).json({ error: "You cannot message yourself." });
    const [recipient] = await db.execute(
      "SELECT id FROM users WHERE id = ? AND email_verified = 1",
      [req.params.userId],
    );
    if (!recipient[0])
      return res.status(404).json({ error: "That user could not be found." });
    const conversationId = await findConversation(
      req.user.id,
      req.params.userId,
    );
    const message = {
      id: uuid(),
      senderId: req.user.id,
      text,
      createdAt: new Date().toISOString(),
    };
    await db.execute(
      "INSERT INTO messages (id, conversation_id, sender_id, body) VALUES (?, ?, ?, ?)",
      [message.id, conversationId, req.user.id, text],
    );
    io.to(`user:${req.user.id}`)
      .to(`user:${req.params.userId}`)
      .emit("chat:message", { ...message, conversationId });
    return res.status(201).json({ message });
  }),
);

app.get(
  "/api/meetings",
  authenticate,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT m.id, m.title, m.host_id AS hostId, m.created_at AS createdAt, h.name AS hostName,
       (SELECT COUNT(*) FROM meeting_requests accepted WHERE accepted.meeting_id = m.id AND accepted.status = 'accepted') AS attendeeCount,
       (SELECT own.status FROM meeting_requests own WHERE own.meeting_id = m.id AND own.user_id = ? LIMIT 1) AS requestStatus
     FROM meetings m JOIN users h ON h.id = m.host_id
     WHERE m.status = 'active'
     ORDER BY m.created_at DESC`,
      [req.user.id],
    );
    return res.json({ meetings: rows });
  }),
);

app.post(
  "/api/meetings",
  authenticate,
  asyncRoute(async (req, res) => {
    const title =
      typeof req.body.title === "string" ? req.body.title.trim() : "";
    if (!title || title.length > 120)
      return res.status(400).json({
        error: "Meeting names must contain between 1 and 120 characters.",
      });
    const meeting = {
      id: uuid(),
      title,
      hostId: req.user.id,
      hostName: req.user.name,
      createdAt: new Date().toISOString(),
      attendeeCount: 0,
    };
    await db.execute(
      "INSERT INTO meetings (id, title, host_id) VALUES (?, ?, ?)",
      [meeting.id, title, req.user.id],
    );
    return res.status(201).json({ meeting });
  }),
);

app.post(
  "/api/meetings/:meetingId/requests",
  authenticate,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      "SELECT id, title, host_id AS hostId, status FROM meetings WHERE id = ?",
      [req.params.meetingId],
    );
    const meeting = rows[0];
    if (!meeting || meeting.status !== "active")
      return res
        .status(404)
        .json({ error: "This meeting is no longer available." });
    if (meeting.hostId === req.user.id)
      return res
        .status(400)
        .json({ error: "You are already the host of this meeting." });
    const request = {
      id: uuid(),
      meetingId: meeting.id,
      userId: req.user.id,
      name: req.user.name,
      status: "waiting",
    };
    await db.execute(
      `INSERT INTO meeting_requests (id, meeting_id, user_id, status, requested_at, responded_at)
     VALUES (?, ?, ?, 'waiting', UTC_TIMESTAMP(), NULL)
     ON DUPLICATE KEY UPDATE id = VALUES(id), status = 'waiting', requested_at = UTC_TIMESTAMP(), responded_at = NULL`,
      [request.id, meeting.id, req.user.id],
    );
    const [saved] = await db.execute(
      "SELECT id FROM meeting_requests WHERE meeting_id = ? AND user_id = ?",
      [meeting.id, req.user.id],
    );
    request.id = saved[0].id;
    io.to(`user:${meeting.hostId}`).emit("meeting:request", { request });
    return res.status(201).json({ request });
  }),
);

app.get(
  "/api/meetings/:meetingId/requests",
  authenticate,
  asyncRoute(async (req, res) => {
    const [meetingRows] = await db.execute(
      "SELECT host_id FROM meetings WHERE id = ?",
      [req.params.meetingId],
    );
    if (!meetingRows[0])
      return res.status(404).json({ error: "Meeting not found." });
    if (meetingRows[0].host_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the host can view join requests." });
    const [rows] = await db.execute(
      `SELECT r.id, r.user_id AS userId, u.name, r.status, r.requested_at AS requestedAt
     FROM meeting_requests r JOIN users u ON u.id = r.user_id
     WHERE r.meeting_id = ? AND r.status = 'waiting' ORDER BY r.requested_at`,
      [req.params.meetingId],
    );
    return res.json({ requests: rows });
  }),
);

app.patch(
  "/api/meetings/:meetingId/requests/:requestId",
  authenticate,
  asyncRoute(async (req, res) => {
    const status = req.body.status;
    if (!["accepted", "declined"].includes(status))
      return res
        .status(400)
        .json({ error: "Choose whether to accept or decline this request." });
    const [rows] = await db.execute(
      `SELECT r.id, r.user_id AS userId, u.name, m.host_id AS hostId
     FROM meeting_requests r JOIN meetings m ON m.id = r.meeting_id
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ? AND r.meeting_id = ? AND r.status = 'waiting' AND m.status = 'active'`,
      [req.params.requestId, req.params.meetingId],
    );
    const request = rows[0];
    if (!request)
      return res
        .status(404)
        .json({ error: "This join request is no longer waiting." });
    if (request.hostId !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the host can respond to join requests." });
    await db.execute(
      "UPDATE meeting_requests SET status = ?, responded_at = UTC_TIMESTAMP() WHERE id = ? AND status = ?",
      [status, request.id, "waiting"],
    );
    io.to(`user:${request.userId}`).emit("meeting:request-status", {
      meetingId: req.params.meetingId,
      status,
    });
    return res.json({ request: { ...request, status } });
  }),
);

app.get(
  "/api/meetings/:meetingId/access",
  authenticate,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT m.id, m.title, m.host_id AS hostId, h.name AS hostName, m.status AS meetingStatus,
       r.status AS requestStatus
     FROM meetings m JOIN users h ON h.id = m.host_id
     LEFT JOIN meeting_requests r ON r.meeting_id = m.id AND r.user_id = ?
     WHERE m.id = ?`,
      [req.user.id, req.params.meetingId],
    );
    const meeting = rows[0];
    if (!meeting || meeting.meetingStatus !== "active")
      return res
        .status(404)
        .json({ error: "This meeting is no longer available." });
    return res.json({ meeting, isHost: meeting.hostId === req.user.id });
  }),
);

app.post(
  "/api/meetings/:meetingId/end",
  authenticate,
  asyncRoute(async (req, res) => {
    const [rows] = await db.execute(
      "SELECT host_id FROM meetings WHERE id = ? AND status = ?",
      [req.params.meetingId, "active"],
    );
    if (!rows[0])
      return res
        .status(404)
        .json({ error: "This meeting is no longer active." });
    if (rows[0].host_id !== req.user.id)
      return res
        .status(403)
        .json({ error: "Only the host can end this meeting." });
    await db.execute("UPDATE meetings SET status = ? WHERE id = ?", [
      "ended",
      req.params.meetingId,
    ]);
    io.to(`meeting:${req.params.meetingId}`).emit("meeting:ended");
    return res.json({ message: "Meeting ended." });
  }),
);

app.use("/api", authenticate, (req, res) =>
  res.status(404).json({ error: "API route not found." }),
);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500)
    console.error(
      "Request failed:",
      error.code || error.name || "UnknownError",
    );
  return res.status(status).json({
    error:
      status >= 500 ? "Something went wrong. Please try again." : error.message,
  });
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required."));
    const claims = jwt.verify(token, jwtSecret, { issuer: "meetly" });
    const [rows] = await db.execute(
      "SELECT id, name FROM users WHERE id = ? AND email_verified = 1",
      [claims.sub],
    );
    if (!rows[0]) return next(new Error("Authentication required."));
    socket.data.user = rows[0];
    return next();
  } catch {
    return next(new Error("Authentication required."));
  }
});

io.on("connection", (socket) => {
  const { id: userId, name } = socket.data.user;
  socket.join(`user:${userId}`);
  onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);
  io.emit("presence:update", { userId, online: true });

  socket.on("meeting:join", async (meetingId, acknowledge = () => {}) => {
    try {
      const [rows] = await db.execute(
        `SELECT m.host_id AS hostId, r.status AS requestStatus FROM meetings m
         LEFT JOIN meeting_requests r ON r.meeting_id = m.id AND r.user_id = ?
         WHERE m.id = ? AND m.status = 'active'`,
        [userId, meetingId],
      );
      const meeting = rows[0];
      if (
        !meeting ||
        (meeting.hostId !== userId && meeting.requestStatus !== "accepted")
      ) {
        return acknowledge({
          error: "The host has not admitted you to this meeting.",
        });
      }
      const roomName = `meeting:${meetingId}`;
      const existingSockets = await io.in(roomName).fetchSockets();
      socket.join(roomName);
      socket.data.meetings ??= new Set();
      socket.data.meetings.add(meetingId);
      socket.to(roomName).emit("meeting:peer-joined", { userId, name });
      return acknowledge({
        ok: true,
        peers: existingSockets.map((peer) => ({
          id: peer.data.user.id,
          name: peer.data.user.name,
        })),
      });
    } catch (error) {
      console.error(
        "Meeting join failed:",
        error.code || error.name || "UnknownError",
      );
      return acknowledge({ error: "Could not join this meeting." });
    }
  });

  socket.on("meeting:leave", (meetingId) => {
    if (!socket.data.meetings?.has(meetingId)) return;
    socket.leave(`meeting:${meetingId}`);
    socket.data.meetings.delete(meetingId);
    socket.to(`meeting:${meetingId}`).emit("meeting:peer-left", { userId });
  });

  socket.on(
    "meeting:signal",
    async ({ meetingId, to, signal } = {}, acknowledge = () => {}) => {
      try {
        if (
          !socket.data.meetings?.has(meetingId) ||
          typeof to !== "string" ||
          !signal ||
          typeof signal !== "object"
        ) {
          return acknowledge({ error: "Invalid meeting signal." });
        }
        const roomName = `meeting:${meetingId}`;
        const peers = await io.in(roomName).fetchSockets();
        const target = peers.find((peer) => peer.data.user.id === to);
        if (!target)
          return acknowledge({
            error: "That participant is not in this meeting.",
          });
        target.emit("meeting:signal", { from: userId, signal });
        return acknowledge({ ok: true });
      } catch (error) {
        console.error(
          "Meeting signal failed:",
          error.code || error.name || "UnknownError",
        );
        return acknowledge({ error: "Could not send meeting signal." });
      }
    },
  );

  socket.on("chat:typing", async ({ to, typing } = {}) => {
    if (typeof to !== "string" || typeof typing !== "boolean") return;
    const [rows] = await db.execute("SELECT id FROM users WHERE id = ?", [to]);
    if (rows[0])
      io.to(`user:${to}`).emit("chat:typing", { userId, name, typing });
  });

  socket.on("disconnect", () => {
    const count = (onlineUsers.get(userId) || 1) - 1;
    if (count > 0) onlineUsers.set(userId, count);
    else {
      onlineUsers.delete(userId);
      io.emit("presence:update", { userId, online: false });
    }
  });
});

await initializeDatabase();
httpServer.listen(port, () => {
  console.log(`Meetify API listening on port ${port}`);
});
