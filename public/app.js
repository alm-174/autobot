// =====================================================================
//  app.js  -  ĐIỀU PHỐI CHÍNH
//   1. Kết nối WebSocket tới server để nhận trạng thái xe (10 Hz)
//   2. Mất kết nối -> tự chạy sim.js ngay trong trình duyệt
//   3. Cập nhật HUD (chỉ số) 10 Hz, bản đồ 2 Hz, 3D tự vẽ riêng ở 30 FPS
// =====================================================================
import { Simulator } from "./sim.js";
import { createScene } from "./scene3d.js";
import { createMap } from "./mapview.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------
// 1) Khởi tạo 3D và bản đồ
// ---------------------------------------------------------------------
const scene3d = createScene($("c3d"));
const mapView = createMap("map");
scene3d.start((fps) => ($("fps").textContent = fps));

// ---------------------------------------------------------------------
// 2) Nguồn dữ liệu: WebSocket, hoặc giả lập cục bộ nếu mất kết nối
// ---------------------------------------------------------------------
let latest = null;         // gói trạng thái mới nhất
let localSim = null;       // bộ giả lập trong trình duyệt (null = không chạy)
let localTimer = null;
let ws = null;

/** Nhận 1 gói trạng thái (từ server hoặc từ giả lập cục bộ) */
function onState(s) {
  latest = s;
  scene3d.setState(s); // 3D chỉ lưu lại; vòng vẽ 30 FPS sẽ nội suy
}

function startLocalSim() {
  if (localTimer) return;
  localSim = localSim || new Simulator();
  localTimer = setInterval(() => {
    localSim.step(0.1);
    onState(localSim.getState());
  }, 100);
}
function stopLocalSim() {
  clearInterval(localTimer);
  localTimer = null;
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  try {
    ws = new WebSocket(`${proto}://${location.host}`);
  } catch {
    startLocalSim();
    setTimeout(connect, 3000);
    return;
  }
  ws.onopen = () => stopLocalSim(); // có server -> dừng giả lập cục bộ
  ws.onmessage = (e) => {
    try { onState(JSON.parse(e.data)); } catch { /* bỏ qua gói lỗi */ }
  };
  ws.onclose = () => {
    startLocalSim();                 // mất kết nối -> tự chạy giả lập
    setTimeout(connect, 3000);       // và thử nối lại sau 3 giây
  };
  ws.onerror = () => ws.close();
}

// Nếu sau 1,5 s vẫn chưa có dữ liệu nào thì chạy giả lập cục bộ trước
setTimeout(() => { if (!latest) startLocalSim(); }, 1500);
connect();

// ---------------------------------------------------------------------
// 3) HUD: cập nhật 10 Hz. Chỉ ghi DOM khi giá trị thay đổi (đỡ tốn CPU)
// ---------------------------------------------------------------------
const cache = {}; // lưu giá trị đã hiển thị
function setText(id, value) {
  if (cache[id] !== value) {
    cache[id] = value;
    $(id).textContent = value;
  }
}
function setClass(el, cls, on) {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

function updateHud() {
  const s = latest;
  if (!s) return;

  // --- Tốc độ + ACC ---
  setText("speed", Math.round(s.speed));
  setText("setSpeed", s.acc?.active ? Math.round(s.setSpeed) : "--");
  setClass($("accBadge"), "on", !!s.acc?.active);

  // --- Biển giới hạn tốc độ (nhấp nháy khi vượt quá) ---
  setText("limit", s.speedLimit);
  setClass($("limitSign"), "over", s.speed > s.speedLimit + 0.5);

  // --- Cần số P R N D ---
  for (const el of $("gears").children) setClass(el, "on", el.dataset.g === s.gear);

  // --- Xe phía trước ---
  const det = !!s.lead?.detected;
  setClass($("leadInfo"), "off", !det);
  setText("leadDist", det ? s.lead.distance.toFixed(1) : "--");
  setText("leadSpeed", det ? Math.round(s.lead.speed) : "--");

  // --- Banner cảnh báo ---
  const banner = $("banner");
  const warn = s.warning === "FCW" ? "fcw" : s.warning === "BRAKE" || s.acc?.braking ? "brake" : "";
  if (cache.warn !== warn) {
    cache.warn = warn;
    banner.hidden = !warn;
    banner.className = "banner " + warn;
    banner.textContent = warn === "fcw" ? "⚠ CẢNH BÁO VA CHẠM PHÍA TRƯỚC" : warn === "brake" ? "ACC đang giảm tốc" : "";
    setClass($("panel3d"), "fcw", warn === "fcw");
  }

  // --- Nhiên liệu ---
  const fuel = Math.max(0, Math.min(100, s.fuel));
  const fill = $("fuelFill");
  if (cache.fuel !== Math.round(fuel)) {
    cache.fuel = Math.round(fuel);
    fill.style.width = fuel + "%";
    setClass(fill, "low", fuel < 20);
  }
  setText("range", Math.round(s.range));

  // --- Nhiệt độ, giờ ---
  setText("temp", Math.round(s.temp) + "°C");
  const now = new Date();
  setText("clock", now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }));

  // --- Nguồn dữ liệu ---
  const real = s.source === "device";
  setClass($("source"), "device", real);
  setText("srcText", real ? "Dữ liệu thật" : "Giả lập");
}
// Chèn nhãn nguồn dữ liệu vào đúng thẻ <span> (id srcText) để setText dùng được
$("source").querySelector("span").id = "srcText";

setInterval(updateHud, 100);                          // chỉ số: 10 Hz
setInterval(() => latest && mapView.update(latest.gps), 500); // bản đồ: 2 Hz
