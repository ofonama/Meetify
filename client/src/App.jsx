import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useNavigate, useParams } from "react-router-dom";
import api from "./api";
import AuthScreen from "./AuthScreen";
import "./App.css";

const avatarColors = ["coral", "blue", "violet", "gold", "green"];

function colorFor(person) {
  if (person.color) return person.color;
  const index = [...(person.id || person.name || "user")].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return avatarColors[index % avatarColors.length];
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderMessageText(text) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

const Icon = ({ name, size = 18, ...props }) => {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props,
  };
  const shapes = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="3" />
        <path d="m16 10 5-3v10l-5-3z" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
      </>
    ),
    phone: (
      <path d="M7 3H4a1 1 0 0 0-1 1 17 17 0 0 0 17 17 1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-8-8l2-2-1-4Z" />
    ),
    message: (
      <>
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.9m-1-11.9a4 4 0 0 1 0 7.8" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path
          d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z"
          transform="translate(-1 -1) scale(1.08)"
        />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    attach: (
      <path d="m21.4 11.1-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    ),
    smile: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: (
      <>
        <path d="m18 6-12 12M6 6l12 12" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    ),
    camera: (
      <>
        <path d="M14 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        <path d="m18 10 4-3v10l-4-3" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" />
        <path d="m19 14 1.2 2.8L23 18l-2.8 1.1L19 22l-1.1-2.9L15 18l2.9-1.2L19 14Z" />
      </>
    ),
  };
  return (
    <svg aria-hidden="true" {...common}>
      {shapes[name] ?? shapes.sparkles}
    </svg>
  );
};

function Avatar({ person, size = "", showStatus = false }) {
  const color = colorFor(person);
  return (
    <span className={`avatar avatar-${color} ${size ? `avatar-${size}` : ""}`}>
      {person.initials ??
        person.name
          .split(" ")
          .map((part) => part[0])
          .join("")}
      {showStatus && (
        <i className={`presence ${person.online ? "is-online" : ""}`} />
      )}
    </span>
  );
}

function App() {
  const navigate = useNavigate();
  const { meetingId } = useParams();
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(() =>
    Boolean(localStorage.getItem("meetly-token")),
  );

  useEffect(() => {
    const token = localStorage.getItem("meetly-token");
    if (!token) return;
    api
      .get("/auth/me")
      .then(({ data }) => setSession({ token, user: data.user }))
      .catch(() => {
        localStorage.removeItem("meetly-token");
        localStorage.removeItem("meetly-user");
      })
      .finally(() => setCheckingSession(false));
  }, []);

  const handleAuthenticated = (data) => {
    localStorage.setItem("meetly-token", data.token);
    localStorage.setItem("meetly-user", JSON.stringify(data.user));
    setSession(data);
    navigate(meetingId ? `/meeting/${meetingId}` : "/");
  };

  const logout = () => {
    localStorage.removeItem("meetly-token");
    localStorage.removeItem("meetly-user");
    setSession(null);
    navigate("/login");
  };

  if (checkingSession)
    return <div className="app-loading">Opening your workspace…</div>;
  if (!session) return <AuthScreen onAuthenticated={handleAuthenticated} />;
  return (
    <Workspace token={session.token} user={session.user} onLogout={logout} />
  );
}

function Workspace({ token, user, onLogout }) {
  const navigate = useNavigate();
  const { meetingId } = useParams();
  const [activeSection, setActiveSection] = useState("Chats");
  const [people, setPeople] = useState([]);
  const [chats, setChats] = useState([]);
  const [activePersonId, setActivePersonId] = useState("");
  const [messages, setMessages] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("Quick catch-up");
  const [showRoom, setShowRoom] = useState(false);
  const [room, setRoom] = useState(null);
  const [requests, setRequests] = useState([]);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [typing, setTyping] = useState(false);
  const socketRef = useRef(null);
  const activePersonIdRef = useRef(activePersonId);
  const peopleRef = useRef(people);
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const roomRef = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  const activePerson = people.find((person) => person.id === activePersonId) ??
    people[0] ?? { id: "", name: "Your team", color: "green", online: false };
  const visiblePeople = useMemo(
    () =>
      people.filter((person) => {
        const lastMessage =
          chats.find((chat) => chat.user.id === person.id)?.lastMessage?.text ??
          "";
        return `${person.name} ${lastMessage}`
          .toLowerCase()
          .includes(search.toLowerCase());
      }),
    [people, chats, search],
  );

  const notify = useCallback((text) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2800);
  }, []);

  const createPeerConnection = useCallback((peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    localStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, localStreamRef.current);
    });
    connection.onicecandidate = ({ candidate }) => {
      if (candidate && roomRef.current?.id) {
        socketRef.current?.emit("meeting:signal", {
          meetingId: roomRef.current.id,
          to: peerId,
          signal: { candidate },
        });
      }
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStreams((current) => ({
        ...current,
        [peerId]: { ...current[peerId], stream },
      }));
    };
    peerConnectionsRef.current.set(peerId, connection);
    return connection;
  }, []);

  useEffect(() => {
    activePersonIdRef.current = activePersonId;
    peopleRef.current = people;
  }, [activePersonId, people]);

  useEffect(() => {
    let active = true;
    Promise.all([api.get("/users"), api.get("/chats"), api.get("/meetings")])
      .then(([usersResponse, chatsResponse, meetingsResponse]) => {
        if (!active) return;
        setPeople(usersResponse.data.users);
        setChats(chatsResponse.data.chats);
        setMeetings(meetingsResponse.data.meetings);
        setActivePersonId(
          (current) => current || usersResponse.data.users[0]?.id || "",
        );
      })
      .catch((error) =>
        notify(error.response?.data?.error || "Could not load your workspace."),
      );
    return () => {
      active = false;
    };
  }, [notify, user.id]);

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      auth: { token },
    });
    socketRef.current = socket;
    socket.on("connect_error", () =>
      notify(
        "Live connection unavailable. Check that the Meetify server is running.",
      ),
    );
    socket.on("chat:message", (message) => {
      if (
        message.senderId !== user.id &&
        message.senderId === activePersonIdRef.current
      ) {
        setMessages((current) => [...current, message]);
      }
      setChats((current) => {
        const peerId =
          message.senderId === user.id
            ? activePersonIdRef.current
            : message.senderId;
        const peer = peopleRef.current.find((person) => person.id === peerId);
        if (!peer) return current;
        const existing = current.filter((chat) => chat.user.id !== peerId);
        return [
          {
            user: peer,
            conversationId: message.conversationId,
            lastMessage: message,
          },
          ...existing,
        ];
      });
    });
    socket.on("presence:update", ({ userId, online }) => {
      setPeople((current) =>
        current.map((person) =>
          person.id === userId ? { ...person, online } : person,
        ),
      );
    });
    socket.on("chat:typing", ({ userId, typing: isTyping }) => {
      if (userId === activePersonIdRef.current) setTyping(isTyping);
    });
    socket.on("meeting:request", ({ request }) => {
      if (roomRef.current?.id === request.meetingId)
        setRequests((current) => [
          ...current.filter((item) => item.id !== request.id),
          request,
        ]);
      notify(`${request.name} is asking to join your meeting.`);
    });
    socket.on(
      "meeting:request-status",
      ({ meetingId: requestedMeetingId, status }) => {
        if (roomRef.current?.id !== requestedMeetingId) return;
        if (status === "accepted")
          setRoom((current) =>
            current ? { ...current, waiting: false } : current,
          );
        else {
          notify("The host declined your request to join.");
          setShowRoom(false);
          setRoom(null);
          navigate("/");
        }
      },
    );
    socket.on("meeting:ended", () => {
      notify("The host ended this meeting.");
      setShowRoom(false);
      setRoom(null);
      navigate("/");
    });
    socket.on("meeting:peer-joined", ({ userId, name }) => {
      setRemoteStreams((current) => ({
        ...current,
        [userId]: { name, stream: null },
      }));
    });
    socket.on("meeting:peer-left", ({ userId }) => {
      peerConnectionsRef.current.get(userId)?.close();
      peerConnectionsRef.current.delete(userId);
      setRemoteStreams((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
    });
    socket.on("meeting:signal", async ({ from, signal }) => {
      const peer =
        peerConnectionsRef.current.get(from) ?? createPeerConnection(from);
      try {
        if (signal.description) {
          await peer.setRemoteDescription(signal.description);
          if (signal.description.type === "offer") {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socket.emit("meeting:signal", {
              meetingId: roomRef.current?.id,
              to: from,
              signal: { description: peer.localDescription },
            });
          }
          for (const candidate of peer.pendingCandidates ?? [])
            await peer.addIceCandidate(candidate);
          peer.pendingCandidates = [];
        } else if (signal.candidate) {
          if (peer.remoteDescription)
            await peer.addIceCandidate(signal.candidate);
          else (peer.pendingCandidates ??= []).push(signal.candidate);
        }
      } catch {
        notify(
          "A video connection could not be established. Please reconnect to the meeting.",
        );
      }
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [createPeerConnection, navigate, notify, token, user.id]);

  useEffect(() => {
    if (!activePersonId) return;
    let active = true;
    api
      .get(`/chats/${activePersonId}/messages`)
      .then(({ data }) => {
        if (active) setMessages(data.messages);
      })
      .catch((error) =>
        notify(
          error.response?.data?.error || "Could not load this conversation.",
        ),
      );
    return () => {
      active = false;
    };
  }, [activePersonId, notify]);

  useEffect(() => {
    if (!meetingId || room?.id === meetingId) return;
    let active = true;
    api
      .get(`/meetings/${meetingId}/access`)
      .then(async ({ data }) => {
        if (!active) return;
        const waiting =
          !data.isHost && data.meeting.requestStatus !== "accepted";
        if (waiting && data.meeting.requestStatus !== "waiting") {
          await api.post(`/meetings/${meetingId}/requests`);
        }
        if (!active) return;
        setRoom({
          id: meetingId,
          title: data.meeting.title,
          owner: data.meeting.hostName,
          hostId: data.meeting.hostId,
          waiting,
          isHost: data.isHost,
        });
        setShowRoom(true);
        setActiveSection("Meetings");
      })
      .catch((error) => {
        notify(error.response?.data?.error || "Could not open this meeting.");
        navigate("/");
      });
    return () => {
      active = false;
    };
  }, [meetingId, navigate, notify, room?.id]);

  useEffect(() => {
    if (!room?.id || !room.isHost || !showRoom) return;
    api
      .get(`/meetings/${room.id}/requests`)
      .then(({ data }) => setRequests(data.requests))
      .catch((error) =>
        notify(
          error.response?.data?.error || "Could not load meeting requests.",
        ),
      );
  }, [notify, room?.id, room?.isHost, showRoom]);

  useEffect(() => {
    roomRef.current = room;
    if (!room?.id || room.waiting) return;
    let active = true;
    let socket = socketRef.current;
    const peerConnections = peerConnectionsRef.current;
    const joinRoom = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch {
        notify(
          "Camera or microphone permission was denied. You can still join and listen.",
        );
      }
      if (!socket || !active) return;
      socket.emit("meeting:join", room.id, async (result) => {
        if (result?.error) {
          notify(result.error);
          setShowRoom(false);
          return;
        }
        for (const peer of result.peers) {
          const connection = createPeerConnection(peer.id);
          try {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            socket.emit("meeting:signal", {
              meetingId: room.id,
              to: peer.id,
              signal: { description: connection.localDescription },
            });
          } catch {
            notify(`Could not connect to ${peer.name}.`);
          }
        }
      });
    };
    joinRoom();
    return () => {
      active = false;
      socket?.emit("meeting:leave", room.id);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      peerConnections.forEach((connection) => connection.close());
      peerConnections.clear();
      setRemoteStreams({});
    };
  }, [room, showRoom, notify, createPeerConnection]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activePersonId) return;
    try {
      const { data } = await api.post(`/chats/${activePersonId}/messages`, {
        text,
      });
      setMessages((current) => [...current, data.message]);
      setChats((current) => {
        const existing = current.filter(
          (chat) => chat.user.id !== activePersonId,
        );
        return [{ user: activePerson, lastMessage: data.message }, ...existing];
      });
      setDraft("");
      socketRef.current?.emit("chat:typing", {
        to: activePersonId,
        typing: false,
      });
    } catch (error) {
      notify(error.response?.data?.error || "Message could not be sent.");
    }
  };

  const openChat = (person) => {
    setMessages([]);
    setTyping(false);
    setActivePersonId(person.id);
    setActiveSection("Chats");
    setShowNewChat(false);
    setSearch("");
  };

  const startMeeting = async () => {
    try {
      const { data } = await api.post("/meetings", {
        title: meetingTitle.trim() || "Quick catch-up",
      });
      setRoom({ ...data.meeting, isHost: true, waiting: false });
      setMeetings((current) => [data.meeting, ...current]);
      setRequests([]);
      setShowNewMeeting(false);
      setMeetingTitle("Quick catch-up");
      setShowRoom(true);
      setActiveSection("Meetings");
      navigate(`/meeting/${data.meeting.id}`);
      if (activeSection === "Chats" && activePersonId) {
        const invite = `${window.location.origin}/meeting/${data.meeting.id}`;
        try {
          const messageResponse = await api.post(
            `/chats/${activePersonId}/messages`,
            { text: `I started a meeting. Join me here: ${invite}` },
          );
          setMessages((current) => [...current, messageResponse.data.message]);
          setChats((current) => [
            { user: activePerson, lastMessage: messageResponse.data.message },
            ...current.filter((chat) => chat.user.id !== activePersonId),
          ]);
        } catch {
          notify("The room is ready, but the meeting link could not be sent in chat.");
        }
      }
    } catch (error) {
      notify(error.response?.data?.error || "Could not create the meeting.");
    }
  };

  const joinMeeting = async (meeting) => {
    if (meeting.hostId === user.id || meeting.requestStatus === "accepted") {
      navigate(`/meeting/${meeting.id}`);
      return;
    }
    if (meeting.requestStatus === "waiting") {
      setRoom({
        id: meeting.id,
        title: meeting.title,
        owner: meeting.hostName,
        hostId: meeting.hostId,
        waiting: true,
      });
      setShowRoom(true);
      navigate(`/meeting/${meeting.id}`);
      return;
    }
    try {
      await api.post(`/meetings/${meeting.id}/requests`);
      setMeetings((current) =>
        current.map((item) =>
          item.id === meeting.id ? { ...item, requestStatus: "waiting" } : item,
        ),
      );
      setRoom({
        id: meeting.id,
        title: meeting.title,
        owner: meeting.hostName,
        hostId: meeting.hostId,
        waiting: true,
      });
      setShowRoom(true);
      setRequests([]);
      navigate(`/meeting/${meeting.id}`);
    } catch (error) {
      notify(
        error.response?.data?.error ||
          "Could not request to join this meeting.",
      );
    }
  };

  const handleRequest = async (id, status) => {
    const requester = requests.find((request) => request.id === id);
    try {
      await api.patch(`/meetings/${room.id}/requests/${id}`, { status });
      setRequests((current) => current.filter((request) => request.id !== id));
      if (requester)
        notify(
          `${requester.name} ${status === "accepted" ? "was admitted" : "was declined"}.`,
        );
    } catch (error) {
      notify(
        error.response?.data?.error || "Could not update this join request.",
      );
    }
  };

  const toggleMicrophone = () => {
    const enabled = !micEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setMicEnabled(enabled);
  };

  const toggleCamera = () => {
    const enabled = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setCameraEnabled(enabled);
  };

  const leaveMeeting = async () => {
    if (room?.isHost) {
      try {
        await api.post(`/meetings/${room.id}/end`);
      } catch (error) {
        notify(error.response?.data?.error || "Could not end the meeting.");
      }
    } else if (room?.id) {
      socketRef.current?.emit("meeting:leave", room.id);
    }
    setShowRoom(false);
    setRoom(null);
    navigate("/");
  };

  const copyMeetingLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/meeting/${room?.id}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notify(
        "Could not copy the meeting link. Please copy it from the address bar.",
      );
    }
  };

  return (
    <div className="app-shell">
      <aside className="rail">
        <button
          className="brand-mark"
          aria-label="Meetify home"
          onClick={() => setActiveSection("Chats")}
        >
          <Icon name="sparkles" size={23} />
        </button>
        <div className="rail-links">
          <button
            className={`rail-button ${activeSection === "Chats" ? "selected" : ""}`}
            onClick={() => setActiveSection("Chats")}
            aria-label="Chats"
          >
            <Icon name="message" size={20} />
            <span>Chats</span>
            <i className="rail-dot" />
          </button>
          <button
            className={`rail-button ${activeSection === "Meetings" ? "selected" : ""}`}
            onClick={() => setActiveSection("Meetings")}
            aria-label="Meetings"
          >
            <Icon name="video" size={20} />
            <span>Meetings</span>
          </button>
          <button
            className={`rail-button ${activeSection === "Contacts" ? "selected" : ""}`}
            onClick={() => setActiveSection("Contacts")}
            aria-label="Contacts"
          >
            <Icon name="users" size={20} />
            <span>Contacts</span>
          </button>
        </div>
        <div className="rail-bottom">
          <button
            className="rail-button"
            aria-label="Settings"
            onClick={() => notify("Settings are coming soon.")}
          >
            <Icon name="settings" size={20} />
            <span>Settings</span>
          </button>
          <Avatar person={{ ...user, color: "green" }} />
        </div>
      </aside>

      <aside className="conversation-panel">
        <div className="panel-top">
          <div className="wordmark">
            <span className="wordmark-icon">
              <Icon name="sparkles" size={15} />
            </span>{" "}
            meetify
          </div>
          <button
            className="icon-button notification-button"
            aria-label="Notifications"
            onClick={() => notify("You’re all caught up!")}
          >
            <Icon name="bell" size={19} />
            <i />
          </button>
        </div>
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>{activeSection === "Chats" ? "Messages" : activeSection}</h1>
          </div>
          <button
            className="icon-button add-button"
            aria-label={
              activeSection === "Meetings"
                ? "Create meeting"
                : "New conversation"
            }
            onClick={() =>
              activeSection === "Meetings"
                ? setShowNewMeeting(true)
                : setShowNewChat(true)
            }
          >
            <Icon name="plus" size={19} />
          </button>
        </div>

        {activeSection === "Chats" && (
          <>
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations"
              />
              <kbd>⌘ K</kbd>
            </label>
            <div className="section-label">
              <span>PINNED</span>
              <Icon name="more" size={18} />
            </div>
            <button
              className="pinned-card"
              onClick={() => setActiveSection("Meetings")}
            >
              <span className="pinned-icon">
                <Icon name="video" size={18} />
              </span>
              <span>
                <strong>Start a new meeting</strong>
                <small>Create a private room and invite people</small>
              </span>
              <Icon name="plus" size={17} />
            </button>
            <div className="section-label conversation-label">
              <span>PEOPLE</span>
              <button
                aria-label="Open contacts"
                onClick={() => setActiveSection("Contacts")}
              >
                <Icon name="more" size={18} />
              </button>
            </div>
            <div className="conversation-list">
              {visiblePeople.map((person) => {
                const lastMessage = chats.find(
                  (chat) => chat.user.id === person.id,
                )?.lastMessage;
                return (
                  <button
                    key={person.id}
                    className={`conversation-item ${person.id === activePersonId ? "active" : ""}`}
                    onClick={() => openChat(person)}
                  >
                    <Avatar person={person} showStatus />
                    <span className="conversation-copy">
                      <span className="conversation-name">{person.name}</span>
                      <span className="conversation-preview">
                        {lastMessage?.text ?? "Start a conversation"}
                      </span>
                    </span>
                    <span className="conversation-meta">
                      {formatTime(lastMessage?.createdAt)}
                    </span>
                  </button>
                );
              })}
              {visiblePeople.length === 0 && (
                <p className="empty-search">No conversations found.</p>
              )}
            </div>
            <div className="panel-tip">
              <span className="tip-icon">
                <Icon name="sparkles" size={16} />
              </span>
              <span>
                <strong>A little more connected</strong>
                <small>Start a call anytime, right from your chat.</small>
              </span>
            </div>
          </>
        )}

        {activeSection === "Meetings" && (
          <div className="meetings-list-panel">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a meeting"
              />
            </label>
            <button className="start-meeting-card" onClick={startMeeting}>
              <span className="start-icon">
                <Icon name="video" size={18} />
              </span>
              <span>
                <strong>Start an instant meeting</strong>
                <small>Your room, your call</small>
              </span>
              <Icon name="chevron" size={17} />
            </button>
            <div className="section-label">
              <span>ACTIVE ROOMS</span>
            </div>
            {meetings
              .filter((meeting) =>
                `${meeting.title} ${meeting.hostName}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((meeting) => (
                <button
                  className="meeting-side-item"
                  key={meeting.id}
                  onClick={() => joinMeeting(meeting)}
                >
                  <span className="meeting-date-icon">
                    <Icon name="calendar" size={17} />
                  </span>
                  <span>
                    <strong>{meeting.title}</strong>
                    <small>Hosted by {meeting.hostName}</small>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            <div className="approval-tip">
              <Icon name="shield" size={17} />
              <span>
                Every room is private. Hosts approve each person before they
                join.
              </span>
            </div>
          </div>
        )}

        {activeSection === "Contacts" && (
          <div className="contact-list-panel">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find people"
              />
            </label>
            <div className="section-label">
              <span>YOUR TEAM</span>
            </div>
            {people
              .filter((person) =>
                person.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((person) => (
                <button
                  key={person.id}
                  className="contact-item"
                  onClick={() => openChat(person)}
                >
                  <Avatar person={person} showStatus />
                  <span>
                    <strong>{person.name}</strong>
                    <small>{person.email}</small>
                  </span>
                  <Icon name="message" size={17} />
                </button>
              ))}
          </div>
        )}

        <button
          className="workspace-switcher"
          onClick={onLogout}
          aria-label="Sign out"
        >
          <span className="workspace-avatar">{user.name[0]}</span>
          <span>
            <strong>{user.name}</strong>
            <small>Sign out</small>
          </span>
          <Icon name="more" size={18} />
        </button>
      </aside>

      <main className="main-panel">
        {activeSection === "Chats" ? (
          activePersonId ? (
            <>
              <header className="chat-header">
                <div className="chat-person">
                  <Avatar person={activePerson} showStatus />
                  <div>
                    <h2>{activePerson.name}</h2>
                    <p>
                      <span
                        className={`status-dot ${activePerson.online ? "online" : ""}`}
                      />
                      {activePerson.online ? "Active now" : "Offline"}
                    </p>
                  </div>
                </div>
                <div className="chat-actions">
                  <button
                    className="icon-button call-action"
                    aria-label="Start video call"
                    onClick={startMeeting}
                  >
                    <Icon name="video" size={19} />
                  </button>
                  <button
                    className="icon-button call-action"
                    aria-label="Start audio call"
                    onClick={startMeeting}
                  >
                    <Icon name="phone" size={18} />
                  </button>
                  <span className="action-divider" />
                  <button
                    className="icon-button"
                    aria-label="More chat options"
                    onClick={() =>
                      notify("Chat details are shown on the right.")
                    }
                  >
                    <Icon name="more" size={20} />
                  </button>
                </div>
              </header>

              <div className="chat-content">
                <div className="date-divider">
                  <span>
                    {new Date().toLocaleDateString([], {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="messages">
                  {messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const mine = message.senderId === user.id;
                    const showAvatar =
                      !mine && previous?.senderId !== message.senderId;
                    return (
                      <div
                        className={`message-row ${mine ? "mine" : ""}`}
                        key={message.id}
                      >
                        {!mine &&
                          (showAvatar ? (
                            <Avatar person={activePerson} size="small" />
                          ) : (
                            <span className="avatar-spacer" />
                          ))}
                        <div className="message-stack">
                          {showAvatar && (
                            <span className="message-author">
                              {activePerson.name}
                            </span>
                          )}
                          <div className="message-bubble">
                            {renderMessageText(message.text)}
                          </div>
                          <span className="message-time">
                            {formatTime(message.createdAt)}
                            {mine && <Icon name="check" size={13} />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {typing && (
                  <div className="typing-indicator">
                    {activePerson.name} is typing…
                  </div>
                )}
                <div className="inline-meeting-card">
                  <span className="inline-meeting-icon">
                    <Icon name="video" size={19} />
                  </span>
                  <span className="inline-meeting-copy">
                    <strong>Want to talk it through?</strong>
                    <small>
                      Start a private video meeting with{" "}
                      {activePerson.name.split(" ")[0]}.
                    </small>
                  </span>
                  <button onClick={startMeeting}>
                    Start a call <Icon name="chevron" size={15} />
                  </button>
                </div>
              </div>
              <form className="message-composer" onSubmit={sendMessage}>
                <button
                  className="composer-icon"
                  type="button"
                  aria-label="Attach a file"
                  onClick={() => notify("File attachments are coming soon.")}
                >
                  <Icon name="attach" size={19} />
                </button>
                <input
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    socketRef.current?.emit("chat:typing", {
                      to: activePersonId,
                      typing: Boolean(event.target.value),
                    });
                  }}
                  placeholder={`Message ${activePerson.name.split(" ")[0]}...`}
                  aria-label="Write a message"
                />
                <button
                  className="composer-icon emoji-button"
                  type="button"
                  aria-label="Add emoji"
                  onClick={() => setDraft((current) => `${current}😊`)}
                >
                  <Icon name="smile" size={19} />
                </button>
                <button
                  className={`send-button ${draft.trim() ? "ready" : ""}`}
                  type="submit"
                  aria-label="Send message"
                  disabled={!draft.trim()}
                >
                  <Icon name="send" size={17} />
                </button>
              </form>
            </>
          ) : (
            <div className="empty-chat">
              <Avatar person={{ ...user, color: "green" }} size="large" />
              <h2>Your conversations start here.</h2>
              <p>
                Choose someone from your team to send a message or start a
                meeting.
              </p>
              <button
                className="primary-button"
                onClick={() => setActiveSection("Contacts")}
              >
                <Icon name="users" size={16} />
                Browse people
              </button>
            </div>
          )
        ) : activeSection === "Meetings" ? (
          <div className="meeting-home">
            <div className="meeting-home-heading">
              <span className="hero-icon">
                <Icon name="video" size={21} />
              </span>
              <p className="eyebrow">A BETTER WAY TO GET TOGETHER</p>
              <h2>
                Make room for
                <br />
                good conversations.
              </h2>
              <p>
                Bring your team together in a private video room.
                <br />
                You’re always in control of who gets in.
              </p>
              <button className="primary-button" onClick={startMeeting}>
                <Icon name="video" size={17} />
                Start an instant meeting
              </button>
            </div>
            <div className="upcoming-section">
              <div className="upcoming-heading">
                <div>
                  <p className="eyebrow">OPEN MEETING ROOMS</p>
                  <h3>Meetings to join</h3>
                </div>
                <button
                  className="text-button"
                  onClick={() => setShowNewMeeting(true)}
                >
                  <Icon name="plus" size={16} />
                  Create a room
                </button>
              </div>
              <div className="meeting-cards">
                {meetings.map((meeting) => {
                  const host = people.find(
                    (person) => person.id === meeting.hostId,
                  ) ?? { id: meeting.hostId, name: meeting.hostName };
                  const ownMeeting = meeting.hostId === user.id;
                  const buttonText =
                    ownMeeting || meeting.requestStatus === "accepted"
                      ? "Open room"
                      : meeting.requestStatus === "waiting"
                        ? "Request sent"
                        : "Ask to join";
                  return (
                    <article className="meeting-card" key={meeting.id}>
                      <div className="meeting-card-top">
                        <span className="meeting-art art-green">
                          <Icon name="video" size={20} />
                        </span>
                        <span className="meeting-when">
                          <Icon name="clock" size={14} />
                          {formatTime(meeting.createdAt)}
                        </span>
                      </div>
                      <h4>{meeting.title}</h4>
                      <div className="meeting-host">
                        <Avatar person={host} size="small" />
                        Hosted by {meeting.hostName}
                      </div>
                      <div className="meeting-card-bottom">
                        <span className="attendee-count">
                          <Icon name="users" size={15} />
                          {meeting.attendeeCount} joined
                        </span>
                        <button
                          className="join-button"
                          onClick={() => joinMeeting(meeting)}
                        >
                          {buttonText} <Icon name="chevron" size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="privacy-note">
              <Icon name="shield" size={16} />
              <span>Private by design</span>
              <span>Every guest waits until the host lets them in.</span>
            </div>
          </div>
        ) : (
          <div className="contacts-home">
            <span className="hero-icon">
              <Icon name="users" size={21} />
            </span>
            <p className="eyebrow">YOUR PEOPLE</p>
            <h2>
              Good work starts
              <br />
              with good people.
            </h2>
            <p>Pick someone to start a conversation or jump on a call.</p>
            <div className="contacts-grid">
              {people.map((person) => (
                <button
                  key={person.id}
                  className="contact-card"
                  onClick={() => openChat(person)}
                >
                  <Avatar person={person} size="large" showStatus />
                  <strong>{person.name}</strong>
                  <small>{person.email}</small>
                  <span className="contact-message">
                    <Icon name="message" size={15} /> Message
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <aside className="details-panel">
        {activeSection === "Chats" ? (
          <>
            <div className="details-heading">
              <span>ABOUT THIS CHAT</span>
              <button className="icon-button" aria-label="More details">
                <Icon name="more" size={19} />
              </button>
            </div>
            <div className="profile-card">
              <Avatar person={activePerson} size="large" showStatus />
              <h3>{activePerson.name}</h3>
              <span>{activePerson.email}</span>
              <p>
                <i
                  className={`status-dot ${activePerson.online ? "online" : ""}`}
                />
                {activePerson.online ? "Online" : "Offline"}
              </p>
              <div className="profile-actions">
                <button onClick={startMeeting}>
                  <Icon name="video" size={17} />
                  Call
                </button>
                <button onClick={() => setActiveSection("Contacts")}>
                  <Icon name="users" size={17} />
                  Contacts
                </button>
              </div>
            </div>
            <div className="details-section">
              <div className="details-section-title">
                <span>SHARED MEETINGS</span>
                <button onClick={() => setActiveSection("Meetings")}>
                  See all
                </button>
              </div>
              {meetings.length > 0 ? (
                <button
                  className="shared-meeting"
                  onClick={() => joinMeeting(meetings[0])}
                >
                  <span className="shared-meeting-icon">
                    <Icon name="calendar" size={17} />
                  </span>
                  <span>
                    <strong>{meetings[0].title}</strong>
                    <small>Hosted by {meetings[0].hostName}</small>
                  </span>
                  <Icon name="chevron" size={15} />
                </button>
              ) : (
                <p className="empty-detail">Meetings will appear here.</p>
              )}
            </div>
            <div className="details-section shared-files">
              <div className="details-section-title">
                <span>SHARED FILES</span>
                <button onClick={() => notify("No shared files yet.")}>
                  See all
                </button>
              </div>
              <div className="files-empty">
                <span>
                  <Icon name="grid" size={20} />
                </span>
                <p>Files and links shared in this chat will show up here.</p>
              </div>
            </div>
            <div className="encryption-note">
              <Icon name="shield" size={16} />
              <span>
                Conversations are private between you and{" "}
                {activePerson.name.split(" ")[0]}.
              </span>
            </div>
          </>
        ) : (
          <div className="meeting-aside">
            <div className="details-heading">
              <span>MEETING ROOMS</span>
              <Icon name="shield" size={17} />
            </div>
            <div className="room-illustration">
              <div className="room-orbit orbit-one" />
              <div className="room-orbit orbit-two" />
              <span>
                <Icon name="video" size={25} />
              </span>
            </div>
            <h3>Every room has a host.</h3>
            <p>
              Guests ask to join, and the host decides who comes in. Simple,
              private, and always up to you.
            </p>
            <div className="host-steps">
              <div>
                <span>1</span>
                <p>
                  <strong>Create your room</strong>
                  <small>Share a link with your people.</small>
                </p>
              </div>
              <div>
                <span>2</span>
                <p>
                  <strong>Welcome your guests</strong>
                  <small>Admit or decline each request.</small>
                </p>
              </div>
            </div>
            <button className="aside-start-button" onClick={startMeeting}>
              <Icon name="plus" size={16} />
              Create a room
            </button>
          </div>
        )}
      </aside>

      {notice && (
        <div className="toast">
          <span className="toast-check">
            <Icon name="check" size={14} />
          </span>
          {notice}
        </div>
      )}

      {showNewChat && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setShowNewChat(false)
          }
        >
          <div className="modal-card">
            <div className="modal-title">
              <div>
                <p className="eyebrow">SAY HELLO</p>
                <h3>Start a conversation</h3>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowNewChat(false)}
                aria-label="Close"
              >
                <Icon name="close" size={19} />
              </button>
            </div>
            <p className="modal-description">
              Choose someone from your team to get started.
            </p>
            <div className="modal-contact-list">
              {people.map((person) => (
                <button
                  key={person.id}
                  className="modal-contact"
                  onClick={() => openChat(person)}
                >
                  <Avatar person={person} />
                  <span>
                    <strong>{person.name}</strong>
                    <small>{person.role}</small>
                  </span>
                  <Icon name="chevron" size={17} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNewMeeting && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setShowNewMeeting(false)
          }
        >
          <div className="modal-card new-meeting-modal">
            <div className="modal-title">
              <div>
                <p className="eyebrow">MAKE SOME SPACE</p>
                <h3>Start a meeting</h3>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowNewMeeting(false)}
                aria-label="Close"
              >
                <Icon name="close" size={19} />
              </button>
            </div>
            <p className="modal-description">
              Create a private room and invite people to join.
            </p>
            <label className="meeting-title-input">
              Meeting name
              <input
                value={meetingTitle}
                onChange={(event) => setMeetingTitle(event.target.value)}
                maxLength={120}
              />
            </label>
            <div className="room-preview">
              <span>
                <Icon name="video" size={20} />
              </span>
              <div>
                <strong>{meetingTitle || "Quick catch-up"}</strong>
                <small>Instant meeting · Guests wait for your approval</small>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setShowNewMeeting(false)}
              >
                Not now
              </button>
              <button className="primary-button" onClick={startMeeting}>
                <Icon name="video" size={17} />
                Create room
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoom && room && (
        <div className="room-backdrop">
          <section className="meeting-room" aria-label="Video meeting room">
            <header className="room-header">
              <div className="room-brand">
                <span className="brand-mark mini">
                  <Icon name="sparkles" size={17} />
                </span>
                <span>
                  <strong>{room.title}</strong>
                  <small>
                    <span className="live-dot" />
                    {room.waiting
                      ? "Waiting for host approval"
                      : "Room is live"}
                  </small>
                </span>
              </div>
              <button
                className="icon-button room-close"
                onClick={leaveMeeting}
                aria-label="Leave meeting"
              >
                <Icon name="close" size={20} />
              </button>
            </header>
            <div className="room-stage">
              <div className="stage-glow" />
              {room.waiting ? (
                <div className="stage-content">
                  <span className="stage-avatar">
                    <Avatar person={user} size="large" />
                  </span>
                  <span className="stage-label">Waiting room</span>
                  <p>You’re in the waiting room</p>
                  <small>The host will let you in when they’re ready.</small>
                </div>
              ) : (
                <div className="video-grid">
                  <div className="video-tile local-video-tile">
                    <video
                      ref={localVideoRef}
                      style={{
                        visibility: cameraEnabled ? "visible" : "hidden",
                      }}
                      autoPlay
                      muted
                      playsInline
                    />
                    <span>
                      {user.name} · You{!cameraEnabled ? " · Camera off" : ""}
                    </span>
                    {!cameraEnabled && (
                      <div className="video-avatar">
                        <Avatar person={user} size="large" />
                      </div>
                    )}
                  </div>
                  {Object.entries(remoteStreams).map(([peerId, peer]) => (
                    <div className="video-tile" key={peerId}>
                      {peer.stream ? (
                        <video
                          autoPlay
                          playsInline
                          ref={(element) => {
                            if (element && element.srcObject !== peer.stream)
                              element.srcObject = peer.stream;
                          }}
                        />
                      ) : (
                        <div className="video-avatar">
                          <Avatar
                            person={{ name: peer.name || "Guest", id: peerId }}
                            size="large"
                          />
                        </div>
                      )}
                      <span>{peer.name || "Connecting…"}</span>
                    </div>
                  ))}
                  {remoteStreams && Object.keys(remoteStreams).length === 0 && (
                    <div className="room-invite-hint">
                      <Icon name="link" size={18} />
                      <span>
                        Share the invite link to bring someone into your room.
                      </span>
                    </div>
                  )}
                </div>
              )}
              {!room.waiting && (
                <div className="room-self-view">
                  <span className="self-view-avatar">{user.name[0]}</span>
                  <span>You · {micEnabled ? "Mic on" : "Mic off"}</span>
                </div>
              )}
              {requests.filter((request) => request.status === "waiting")
                .length > 0 && (
                <div className="join-requests">
                  <div className="requests-heading">
                    <span className="request-pulse" />
                    Waiting to join{" "}
                    <strong>
                      {
                        requests.filter(
                          (request) => request.status === "waiting",
                        ).length
                      }
                    </strong>
                  </div>
                  {requests
                    .filter((request) => request.status === "waiting")
                    .map((request) => (
                      <div className="request-row" key={request.id}>
                        <Avatar person={request} />
                        <span>
                          <strong>{request.name}</strong>
                          <small>Wants to join your meeting</small>
                        </span>
                        <button
                          className="decline-button"
                          onClick={() => handleRequest(request.id, "declined")}
                          aria-label={`Decline ${request.name}`}
                        >
                          <Icon name="close" size={16} />
                        </button>
                        <button
                          className="admit-button"
                          onClick={() => handleRequest(request.id, "accepted")}
                        >
                          <Icon name="check" size={15} />
                          Admit
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <footer className="room-controls">
              <span className="room-duration">
                <span className="live-dot" />
                {room.waiting ? "Waiting for host" : "Meeting in progress"}
              </span>
              <div className="control-buttons">
                <button
                  className={`control-button ${micEnabled ? "" : "muted"}`}
                  onClick={toggleMicrophone}
                  aria-label="Toggle microphone"
                >
                  <Icon name="mic" size={19} />
                  <small>{micEnabled ? "Mic" : "Muted"}</small>
                </button>
                <button
                  className={`control-button ${cameraEnabled ? "" : "muted"}`}
                  onClick={toggleCamera}
                  aria-label="Toggle camera"
                >
                  <Icon name="camera" size={19} />
                  <small>{cameraEnabled ? "Camera" : "Camera off"}</small>
                </button>
                <button
                  className="control-button"
                  onClick={copyMeetingLink}
                  aria-label="Copy meeting link"
                >
                  <Icon name="link" size={19} />
                  <small>{copied ? "Copied!" : "Invite"}</small>
                </button>
                <button
                  className="end-call-button"
                  onClick={leaveMeeting}
                  aria-label={room.isHost ? "End meeting" : "Leave call"}
                >
                  <Icon name="phone" size={19} />
                </button>
              </div>
              <button
                className="room-more"
                onClick={copyMeetingLink}
                aria-label="Copy meeting link"
              >
                <Icon name="more" size={19} />
              </button>
            </footer>
            {!room.waiting && (
              <div className="room-link-strip">
                <Icon name="shield" size={15} />
                <span>Only people you admit can join.</span>
                <button onClick={copyMeetingLink}>
                  {copied ? "Copied!" : "Copy invite link"}{" "}
                  <Icon name="link" size={14} />
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
