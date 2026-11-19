// =====================================================================
//  sim.js  -  BỘ GIẢ LẬP XE (dùng chung cho server Node.js và trình duyệt)
//
//  Vì sao dùng chung 1 file?
//   - Server import file này để tự chạy giả lập khi chưa có thiết bị thật.
//   - Trình duyệt import file này để chạy giả lập khi mất kết nối WebSocket.
//   => Chỉ viết 1 lần, hai nơi cho kết quả giống hệt nhau.
//
//  Đơn vị: tốc độ km/h (trạng thái xuất ra) | khoảng cách m | gia tốc m/s²
//          bên trong bộ giả lập dùng m/s cho tính toán vật lý.
// =====================================================================

// ---------------------------------------------------------------------
// 1) Các hằng số cấu hình
// ---------------------------------------------------------------------
const SET_SPEED_KMH = 60;      // tốc độ cài của ACC
const TIME_GAP_S = 1.8;        // khoảng cách an toàn = D0 + 1,8 s * v
const STANDSTILL_GAP_M = 5;    // D0 = 5 m
const A_MIN = -7;              // giới hạn phanh tối đa (m/s²)
const A_MAX = 2.5;             // giới hạn tăng tốc tối đa (m/s²)
const FCW_TTC_S = 2.5;         // TTC < 2,5 s  => cảnh báo va chạm
const BRAKE_ACCEL = -3;        // gia tốc < -3 m/s² => coi là phanh mạnh
const SENSOR_RANGE_M = 140;    // tầm phát hiện xe phía trước
const GAP_CLAMP_M = 150;       // giữ xe trước không bay quá xa (để demo liên tục)

// ---------------------------------------------------------------------
// 2) Tuyến đường mẫu ở Hà Nội (vòng khép kín, 7 điểm)
//    "limit" là giới hạn tốc độ (km/h) của đoạn đi từ điểm này đến điểm kế tiếp.
// ---------------------------------------------------------------------
export const ROUTE = [
  { lat: 21.0285, lng: 105.8520, limit: 40 }, // khu Hồ Gươm
  { lat: 21.0210, lng: 105.8560, limit: 50 },
  { lat: 21.0130, lng: 105.8540, limit: 60 },
  { lat: 21.0070, lng: 105.8470, limit: 60 },
  { lat: 21.0110, lng: 105.8380, limit: 50 },
  { lat: 21.0200, lng: 105.8350, limit: 40 },
  { lat: 21.0270, lng: 105.8410, limit: 50 },
];

// Đổi độ -> mét (xấp xỉ phẳng, đủ chính xác cho vài km)
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos((21.02 * Math.PI) / 180);

// Tiền xử lý: tính độ dài và hướng (bearing) của từng đoạn
const SEGMENTS = ROUTE.map((p, i) => {
  const q = ROUTE[(i + 1) % ROUTE.length];
  const dx = (q.lng - p.lng) * M_PER_DEG_LNG; // mét hướng Đông
  const dy = (q.lat - p.lat) * M_PER_DEG_LAT; // mét hướng Bắc
  return {
    length: Math.hypot(dx, dy),
    bearing: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360, // 0° = Bắc
  };
});

// ---------------------------------------------------------------------
// 3) Hàm tiện ích
// ---------------------------------------------------------------------
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const round = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;
// Hiệu góc ngắn nhất (-180..180)
const angleDiff = (to, from) => ((to - from + 540) % 360) - 180;

/** TTC (s) = khoảng cách / (v xe mình - v xe trước). null nếu không đang tiến lại gần. */
export function deriveTtc(s) {
  if (!s?.lead?.detected) return null;
  const closing = (s.speed - s.lead.speed) / 3.6; // m/s, dương = đang lại gần
  if (closing <= 0.1) return null;
  return round(s.lead.distance / closing, 2);
}

/** Cảnh báo: "FCW" (ưu tiên cao nhất) | "BRAKE" | "NONE" */
export function deriveWarning(s) {
  if (s.ttc != null && s.ttc < FCW_TTC_S) return "FCW";
  if (s.accel < BRAKE_ACCEL) return "BRAKE";
  return "NONE";
}

// ---------------------------------------------------------------------
// 4) Lớp Simulator
// ---------------------------------------------------------------------
export class Simulator {
  constructor() {
    this.reset();
  }

  reset() {
    // --- Xe mình (m/s) ---
    this.v = 50 / 3.6;
    this.a = 0;
    // --- Xe phía trước ---
    this.leadV = 50 / 3.6;
    this.leadTarget = this.leadV;
    this.leadVSeen = this.leadV;
    this.leadA = 0;
    this.leadHardBrake = false;
    this.leadTimer = 4;        // đếm ngược đến lần đổi tốc độ kế tiếp
    this.gap = 35;             // khoảng cách (m) từ đầu xe mình đến đuôi xe trước
    // --- GPS ---
    this.seg = 0;              // đang ở đoạn nào của tuyến
    this.segPos = 0;           // đã đi bao nhiêu mét trên đoạn đó
    this.heading = SEGMENTS[0].bearing;
    // --- Khác ---
    this.fuel = 82;            // %
    this.odometer = 12345.6;   // km
    this.t = 0;
  }

  /** Bước 1: xe phía trước đổi tốc độ ngẫu nhiên */
  _updateLead(dt) {
    this.leadTimer -= dt;
    if (this.leadTimer <= 0) {
      if (Math.random() < 0.25) {
        // ~25%: phanh gấp về 0–15 km/h
        this.leadTarget = rand(0, 15) / 3.6;
        this.leadHardBrake = true;
        this.leadTimer = rand(4, 6);
      } else {
        this.leadTarget = rand(25, 70) / 3.6;
        this.leadHardBrake = false;
        this.leadTimer = rand(4, 9);
      }
    }
    // Gia tốc xe trước tỉ lệ với sai khác tốc độ, có giới hạn
    const err = this.leadTarget - this.leadV;
    const aLo = this.leadHardBrake ? -9 : -2.5;
    this.leadA = clamp(err * (this.leadHardBrake ? 3 : 0.8), aLo, 1.5);
    this.leadV = Math.max(0, this.leadV + this.leadA * dt);
    // Radar nhìn thấy tốc độ xe trước hơi trễ (lọc thông thấp ~1,2 s) -> ACC phản ứng không hoàn hảo
    this.leadVSeen += (this.leadV - this.leadVSeen) * Math.min(1, dt / 1.2);
  }

  /** Bước 2: bộ điều khiển ACC của xe mình */
  _updateEgoAcc(dt) {
    const vSet = SET_SPEED_KMH / 3.6;

    // (a) Gia tốc nếu đường trống: bám tốc độ cài
    let aCmd = 0.6 * (vSet - this.v);

    // (b) Gia tốc nếu có xe phía trước: giữ khoảng cách mong muốn
    if (this.gap <= SENSOR_RANGE_M) {
      const desired = STANDSTILL_GAP_M + TIME_GAP_S * this.v;
      const aFollow = 0.18 * (this.gap - desired) + 0.6 * (this.leadVSeen - this.v);
      aCmd = Math.min(aCmd, aFollow); // lấy giá trị an toàn hơn
    }

    // (c) Giới hạn gia tốc, và giới hạn "giật" (jerk) để xe đi êm
    aCmd = clamp(aCmd, A_MIN, A_MAX);
    const maxDown = 10 * dt;  // giảm gia tốc (phanh) nhanh hơn
    const maxUp = 3 * dt;
    this.a += clamp(aCmd - this.a, -maxDown, maxUp);

    this.v += this.a * dt;
    if (this.v < 0) {
      this.v = 0;
      this.a = Math.max(0, this.a);
    }
  }

  /** Bước 3: khoảng cách giữa hai xe */
  _updateGap(dt) {
    this.gap += (this.leadV - this.v) * dt;
    if (this.gap < 2) {
      // Không cho xuyên qua nhau (chỉ để mô hình không bị lỗi)
      this.gap = 2;
      this.v = Math.min(this.v, this.leadV);
    }
    if (this.gap > GAP_CLAMP_M) this.gap = GAP_CLAMP_M;
  }

  /** Bước 4: di chuyển dọc tuyến GPS, quay hướng, trừ nhiên liệu */
  _updateGps(dt) {
    const dist = this.v * dt;
    this.segPos += dist;
    while (this.segPos >= SEGMENTS[this.seg].length) {
      this.segPos -= SEGMENTS[this.seg].length;
      this.seg = (this.seg + 1) % SEGMENTS.length;
    }
    // Hướng xe quay mượt về hướng của đoạn đường hiện tại
    const target = SEGMENTS[this.seg].bearing;
    this.heading = (this.heading + angleDiff(target, this.heading) * Math.min(1, dt * 1.5) + 360) % 360;

    this.odometer += dist / 1000;
    this.fuel -= dist * 0.00033; // ~1% mỗi 3 km (để demo thấy được)
    if (this.fuel < 5) this.fuel = 100; // "đổ xăng" để demo chạy mãi
  }

  /** Gọi mỗi bước thời gian dt (giây) */
  step(dt) {
    this.t += dt;
    this._updateLead(dt);
    this._updateEgoAcc(dt);
    this._updateGap(dt);
    this._updateGps(dt);
  }

  /** Xuất trạng thái theo đúng định dạng JSON của đồ án */
  getState() {
    const p = ROUTE[this.seg];
    const q = ROUTE[(this.seg + 1) % ROUTE.length];
    const f = this.segPos / SEGMENTS[this.seg].length;
    const detected = this.gap <= SENSOR_RANGE_M;

    const s = {
      source: "sim",
      speed: round(this.v * 3.6),
      setSpeed: SET_SPEED_KMH,
      speedLimit: p.limit,
      accel: round(this.a, 2),
      gear: "D",
      fuel: round(this.fuel),
      range: round(this.fuel * 5.2, 0),
      temp: round(24 + 2 * Math.sin(this.t / 60)),
      odometer: round(this.odometer),
      gps: {
        lat: round(p.lat + (q.lat - p.lat) * f, 6),
        lng: round(p.lng + (q.lng - p.lng) * f, 6),
        heading: round(this.heading, 0),
      },
      lead: {
        detected,
        distance: round(this.gap),
        speed: round(this.leadV * 3.6),
        braking: this.leadA < -1.5,
      },
      acc: { active: true, braking: this.a < -1 },
      ttc: null,
      warning: "NONE",
      ts: Date.now(),
    };
    s.ttc = deriveTtc(s);
    s.warning = deriveWarning(s);
    return s;
  }
}
