// =====================================================================
//  server.js  -  BACKEND ĐƠN GIẢN
//   1. Phục vụ file tĩnh trong public/ (và thư viện từ node_modules)
//   2. WebSocket đẩy trạng thái xe xuống trình duyệt 10 lần/giây
//   3. POST /api/telemetry : nhận dữ liệu từ phần nhúng (merge sâu)
//   4. GET  /api/state     : cho mobile/desktop lấy trạng thái hiện tại
//   5. 2 giây không có dữ liệu thật -> tự chạy giả lập
// =====================================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";
import { Simulator, deriveTtc, deriveWarning } from "./public/sim.js";

const PORT = process.env.PORT || 3000;
const TICK_MS = 100;            // 10 lần/giây
const DEVICE_TIMEOUT_MS = 2000; // quá 2 s không có dữ liệu thật -> giả lập

const ROOT = import.meta.dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

// Thư viện lấy thẳng từ node_modules (không dùng CDN)
// URL  /vendor/three/...   -> node_modules/three/build/...
// URL  /vendor/leaflet/... -> node_modules/leaflet/dist/...
const VENDOR = {
  "/vendor/three/": path.join(ROOT, "node_modules", "three", "build"),
  "/vendor/leaflet/": path.join(ROOT, "node_modules", "leaflet", "dist"),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

// ---------------------------------------------------------------------
// Trạng thái xe + bộ giả lập
// ---------------------------------------------------------------------
const sim = new Simulator();
let state = sim.getState();     // trạng thái hiện tại gửi cho mọi client
let lastDeviceTs = 0;           // thời điểm nhận dữ liệu thật gần nhất

/** Merge sâu: chỉ ghi đè các trường có trong patch. Chặn __proto__ để an toàn. */
function deepMerge(target, patch) {
  for (const key of Object.keys(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const v = patch[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], v);
    } else {
      target[key] = v;
    }
  }
  return target;
}

const isDeviceActive = () => Date.now() - lastDeviceTs < DEVICE_TIMEOUT_MS;

/** Mỗi 100 ms: nếu không có thiết bị thật thì tiến giả lập 1 bước */
function tick() {
  if (!isDeviceActive()) {
    sim.step(TICK_MS / 1000);
    state = sim.getState();
  }
  broadcast();
}

// ---------------------------------------------------------------------
// HTTP: file tĩnh + API
// ---------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(obj));
}

/** Gửi 1 file, có chặn truy cập ra ngoài thư mục gốc (path traversal) */
function serveFile(res, baseDir, relPath) {
  const filePath = path.normalize(path.join(baseDir, relPath));
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(data);
  });
}

/** Đọc body JSON (giới hạn 64 KB) */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("Body quá lớn"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("JSON không hợp lệ"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS).end();
    return;
  }

  // --- API: nhận dữ liệu từ phần nhúng ---
  if (pathname === "/api/telemetry" && req.method === "POST") {
    try {
      const patch = await readJson(req);
      if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
        throw new Error("Cần gửi một object JSON");
      }
      deepMerge(state, patch);
      state.source = "device";
      state.ts = Date.now();
      lastDeviceTs = Date.now();
      // Nếu nhóm nhúng không gửi ttc / warning thì server tự tính
      if (patch.ttc === undefined) state.ttc = deriveTtc(state);
      if (patch.warning === undefined) state.warning = deriveWarning(state);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // --- API: lấy trạng thái hiện tại ---
  if (pathname === "/api/state" && req.method === "GET") {
    sendJson(res, 200, state);
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  // --- Thư viện từ node_modules ---
  for (const [prefix, dir] of Object.entries(VENDOR)) {
    if (pathname.startsWith(prefix)) {
      serveFile(res, dir, pathname.slice(prefix.length));
      return;
    }
  }

  // --- File tĩnh trong public/ ---
  serveFile(res, PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
});

// ---------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(state)); // gửi ngay khi vừa kết nối
});

function broadcast() {
  if (wss.clients.size === 0) return;
  const msg = JSON.stringify(state);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}

setInterval(tick, TICK_MS);

server.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
  console.log(`  WebSocket : ws://localhost:${PORT}`);
  console.log(`  POST      : http://localhost:${PORT}/api/telemetry`);
  console.log(`  GET       : http://localhost:${PORT}/api/state`);
});
