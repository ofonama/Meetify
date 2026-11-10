# Meetify

Meetify is a team messaging and private video-meeting app with its own interface. Accounts are verified by email OTP; messages and meeting requests are stored in MySQL. A meeting guest stays in the waiting room until its host admits them.

## Run locally

1. Create a MySQL database (for example `meetify`) using phpMyAdmin.
2. Copy `server/.env.example` to `server/.env` and set the MySQL and SMTP values. The server creates its tables at startup.
3. In one terminal, run:

   ```powershell
   cd server
   npm install
   npm run dev
   ```

4. In another terminal, run:

   ```powershell
   cd client
   npm install
   npm run dev
   ```

The Vite development server proxies API and Socket.IO traffic to the backend port configured in `server/.env` (default `4100`).

## Environment

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM` are required for sending verification codes. Use an SMTP app password or provider credential; do not put credentials in frontend files or commit `.env`.

`JWT_SECRET` should be a long, random secret. `SITE_URL` should be the frontend origin. The video rooms use browser WebRTC with a public STUN server; production deployments that need reliable connections across restrictive networks should configure a TURN relay.

## Included flows

- Register and sign in with a password plus a single-use, expiring email OTP.
- Browse users, exchange persisted direct messages, and see online/typing updates.
- Create private meeting rooms, share room links, and request to join.
- Admit or decline waiting guests; only the host can make that decision, and the API/socket layer enforces it.
- Start browser audio/video and exchange WebRTC signaling with admitted participants.
