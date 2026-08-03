import http from "node:http";
import { Server } from "socket.io";
import { RoomStore } from "./room-store.mjs";

const port = Number(process.env.PORT || 8787);
const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || "https://mira-official.miranomiraishi.chatgpt.site,http://localhost:8787,http://127.0.0.1:8787")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean),
);
const limits = new Map();

function originAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.has(String(origin).replace(/\/$/, ""));
}

function clientIp(socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || socket.handshake.address || "unknown")
    .split(",")[0]
    .trim();
}

function withinLimit(key, maximum, windowMs) {
  const now = Date.now();
  const current = limits.get(key);
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= maximum;
}

const server = http.createServer((request, response) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  response.setHeader("Access-Control-Allow-Origin", originAllowed(request.headers.origin) ? (request.headers.origin || "*") : "null");
  response.setHeader("Vary", "Origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");

  if (path === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true, service: "mira-sugoroku-online", rooms: rooms?.rooms?.size || 0 }));
    return;
  }
  if (path === "/") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ service: "ミラのすごろくクエスト ONLINE", status: "online" }));
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not Found" }));
});

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      callback(originAllowed(origin) ? null : new Error("Origin not allowed"), originAllowed(origin));
    },
    methods: ["GET", "POST"],
  },
  allowRequest(request, callback) {
    callback(null, originAllowed(request.headers.origin));
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 60_000,
    skipMiddlewares: true,
  },
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
});
const rooms = new RoomStore(io);

const handle = (socket, event, fn, { maximum = 180, windowMs = 60_000 } = {}) => {
  socket.on(event, (payload, ack = () => {}) => {
    const key = `${clientIp(socket)}:${event}`;
    if (!withinLimit(key, maximum, windowMs)) {
      ack({ ok: false, error: "操作が多すぎます。少し待ってから再試行してください" });
      return;
    }
    try {
      ack(fn(payload));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event, socketId: socket.id, message: error?.message || String(error) }));
      ack({ ok: false, error: "サーバー処理でエラーが発生しました" });
    }
  });
};

io.on("connection", (socket) => {
  const ip = clientIp(socket);
  if (!withinLimit(`${ip}:connections`, 30, 60_000)) {
    socket.disconnect(true);
    return;
  }
  handle(socket, "room:create", (payload) => rooms.create(socket, payload), { maximum: 8, windowMs: 10 * 60_000 });
  handle(socket, "room:join", (payload) => rooms.join(socket, payload), { maximum: 30, windowMs: 10 * 60_000 });
  handle(socket, "room:resume", (payload) => rooms.resume(socket, payload?.token));
  handle(socket, "room:leave", () => rooms.leave(socket));
  handle(socket, "room:ready", (payload) => rooms.setReady(socket, payload?.ready));
  handle(socket, "room:cpu:add", () => rooms.addCpu(socket));
  handle(socket, "room:cpu:remove", (payload) => rooms.removeCpu(socket, payload?.cpuId));
  handle(socket, "room:start", () => rooms.start(socket));
  handle(socket, "game:roll", () => rooms.roll(socket));
  handle(socket, "game:branch", (payload) => rooms.chooseBranch(socket, payload?.index));
  handle(socket, "game:event", (payload) => rooms.eventChoice(socket, payload?.index));
  handle(socket, "game:shop", (payload) => rooms.shop(socket, payload?.item));
  handle(socket, "game:item", (payload) => rooms.useItem(socket, payload));
  handle(socket, "battle:choose", (payload) => rooms.battleChoose(socket, payload?.cardId));
  socket.on("disconnect", () => rooms.disconnect(socket.id));
});

server.listen(port, "0.0.0.0", () => {
  const address = server.address();
  console.log(JSON.stringify({ level: "info", message: "mira-sugoroku-online started", port: address.port, origins: [...allowedOrigins] }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ level: "info", message: "shutdown", signal }));
  rooms.close();
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 25_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

export { io, rooms, server };
