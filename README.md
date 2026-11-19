# Màn hình xe kiểu Tesla – Phần WEB (đồ án "Lập trình ô tô và phát triển ứng dụng")

Một trang web hiển thị trạng thái xe theo thời gian thực: cảnh 3D xe mình + xe phía trước, tốc độ, ACC,
cảnh báo va chạm (FCW), bản đồ GPS. Dữ liệu đến từ phần **nhúng** (ESP32/Raspberry Pi) qua HTTP;
nếu chưa có thiết bị thì web **tự chạy giả lập**.

## 1. Cách chạy

Yêu cầu: Node.js ≥ 20.

```bash
npm install
npm start
```

Mở trình duyệt: <http://localhost:3000>

- Không cần GPU: cảnh 3D đã được tối ưu để chạy bằng CPU (xem mục 5).
- Chỉ **nền bản đồ** cần Internet. Máy chủ CARTO `dark_all` hiện trả ảnh "API KEY REQUIRED" nếu không có khoá, nên mặc định dùng tile OpenStreetMap + bộ lọc CSS làm tối (xem `mapview.js`; có khoá CARTO thì đặt `USE_CARTO = true`). Mọi thư viện khác (Three.js, Leaflet) được server phục vụ từ `node_modules`.
- Đổi cổng: `set PORT=8080 && npm start` (Windows CMD) hoặc `$env:PORT=8080; npm start` (PowerShell).

## 2. Kiến trúc

```
 ┌──────────────┐  POST /api/telemetry (JSON, chỉ cần trường thay đổi)
 │ Phần nhúng   │ ───────────────────────────────┐
 │ ESP32 / RPi  │                                ▼
 └──────────────┘                        ┌───────────────┐   WebSocket 10 Hz    ┌────────────────┐
                                         │  server.js    │ ───────────────────► │ Trình duyệt    │
 ┌──────────────┐   GET /api/state       │  (Node + ws)  │                      │ index.html     │
 │ Mobile/Desktop│ ◄──────────────────── │  state (RAM)  │ ◄── sim.js ──────────│ + sim.js dự    │
 └──────────────┘                        └───────────────┘   (giả lập)          │   phòng        │
                                                                                 └────────────────┘
```

| File | Vai trò |
|------|---------|
| `server.js` | HTTP + WebSocket. Giữ trạng thái xe trong RAM, merge sâu dữ liệu từ nhúng, tự giả lập khi 2 s không có dữ liệu. |
| `public/sim.js` | Bộ giả lập (xe trước, ACC, TTC, GPS, nhiên liệu). **Dùng chung** cho server và trình duyệt. |
| `public/app.js` | Kết nối WebSocket, tự chạy `sim.js` khi mất kết nối, cập nhật HUD 10 Hz, bản đồ 2 Hz. |
| `public/scene3d.js` | Cảnh 3D (Three.js): làn đường, xe, đèn phanh, dải màu TTC, 30 FPS. |
| `public/mapview.js` | Bản đồ Leaflet + nền tối CARTO, xe xoay theo heading, luôn ở giữa. |
| `public/index.html`, `style.css` | Giao diện tối 2 cột (58% / 42%). |

**Luồng dữ liệu:** nguồn (thiết bị thật hoặc giả lập) → `state` trên server → WebSocket → `app.js` →
(1) HUD, (2) bản đồ, (3) cảnh 3D. Ba phần cập nhật độc lập nhau nên bản đồ/HUD không làm chậm 3D.

**Chọn nguồn dữ liệu:** mỗi lần nhận POST, server ghi nhớ thời điểm và đặt `source: "device"`.
Quá 2 giây không có POST → server chạy giả lập (`source: "sim"`). Khi thiết bị gửi lại, web chuyển sang "Dữ liệu thật" ngay.

**Thuật toán chính (để bảo vệ đồ án):**
- Khoảng cách an toàn ACC: `d_mong_muốn = 5 m + 1,8 s × v`
- Gia tốc ACC = giá trị nhỏ hơn giữa "bám tốc độ cài" và "bám khoảng cách xe trước", giới hạn −7 … +2,5 m/s².
- TTC = `khoảng cách / (v_xe_mình − v_xe_trước)` (chỉ tính khi đang tiến lại gần).
- Cảnh báo: `TTC < 2,5 s` → `FCW`; ngược lại gia tốc `< −3 m/s²` → `BRAKE`; còn lại `NONE`.
- Dải màu giữa 2 xe: xanh (an toàn) / vàng (TTC < 5 s) / đỏ (TTC < 2,5 s).

## 3. Định dạng JSON cho nhóm nhúng

Gửi `POST /api/telemetry`, header `Content-Type: application/json`. **Chỉ cần gửi trường thay đổi**
(server merge sâu vào trạng thái hiện tại). Nên gửi 5–10 lần/giây.

Trạng thái đầy đủ:

```json
{
  "source": "device",
  "speed": 52.0,
  "setSpeed": 60,
  "speedLimit": 50,
  "accel": -0.8,
  "gear": "D",
  "fuel": 76.5,
  "range": 398,
  "temp": 25,
  "odometer": 12345.6,
  "gps":  { "lat": 21.0285, "lng": 105.8520, "heading": 154 },
  "lead": { "detected": true, "distance": 32.5, "speed": 45.0, "braking": false },
  "acc":  { "active": true, "braking": false },
  "ttc": 16.2,
  "warning": "NONE",
  "ts": 1731920000000
}
```

| Trường | Kiểu | Đơn vị / giá trị |
|--------|------|------------------|
| `speed` | số | km/h – tốc độ xe mình |
| `setSpeed` | số | km/h – tốc độ cài của ACC |
| `speedLimit` | số | km/h – giới hạn tốc độ đoạn đường |
| `accel` | số | m/s² (âm = phanh) |
| `gear` | chuỗi | `"P"`, `"R"`, `"N"`, `"D"` |
| `fuel` | số | % (0–100) |
| `range` | số | km còn đi được |
| `temp` | số | °C |
| `odometer` | số | km |
| `gps.lat`, `gps.lng` | số | độ |
| `gps.heading` | số | độ, 0 = Bắc, 90 = Đông |
| `lead.detected` | bool | cảm biến có thấy xe phía trước |
| `lead.distance` | số | m – khoảng cách **từ đầu xe mình đến đuôi xe trước** |
| `lead.speed` | số | km/h – tốc độ xe trước |
| `lead.braking` | bool | xe trước đang phanh (đèn phanh) |
| `acc.active` | bool | ACC đang bật |
| `acc.braking` | bool | ACC đang tự phanh |
| `ttc` | số hoặc `null` | giây. **Có thể bỏ qua**: server tự tính |
| `warning` | chuỗi | `"NONE"` / `"FCW"` / `"BRAKE"`. **Có thể bỏ qua**: server tự tính |
| `source` | chuỗi | server tự đặt `"device"` khi nhận POST, `"sim"` khi giả lập |
| `ts` | số | mili-giây (server tự đặt) |

Tối thiểu nhóm nhúng nên gửi: `speed`, `gps`, `lead` (`detected`, `distance`, `speed`), `acc`.

## 4. Ví dụ lệnh curl

Chỉ gửi tốc độ và xe phía trước (phần còn lại giữ nguyên):

```bash
curl -X POST http://localhost:3000/api/telemetry -H "Content-Type: application/json" -d '{"speed":48,"lead":{"detected":true,"distance":25,"speed":30}}'
```

Gửi GPS:

```bash
curl -X POST http://localhost:3000/api/telemetry -H "Content-Type: application/json" -d '{"gps":{"lat":21.0245,"lng":105.8412,"heading":90}}'
```

Mô phỏng phanh gấp (sẽ thấy FCW đỏ nhấp nháy vì TTC = 12 / ((60−10)/3,6) ≈ 0,9 s):

```bash
curl -X POST http://localhost:3000/api/telemetry -H "Content-Type: application/json" -d '{"speed":60,"accel":-5,"lead":{"detected":true,"distance":12,"speed":10,"braking":true}}'
```

Lấy trạng thái hiện tại (dành cho mobile/desktop, đã bật CORS):

```bash
curl http://localhost:3000/api/state
```

> Trên Windows CMD, dấu `'` không dùng được; dùng PowerShell hoặc Git Bash, hoặc đặt JSON trong `"..."` và escape `\"`.
> Ngừng gửi 2 giây thì web tự quay lại chế độ giả lập.

Ví dụ phía ESP32 (Arduino, thư viện `HTTPClient`):

```cpp
HTTPClient http;
http.begin("http://192.168.1.10:3000/api/telemetry");
http.addHeader("Content-Type", "application/json");
http.POST("{\"speed\":48,\"lead\":{\"detected\":true,\"distance\":25,\"speed\":30}}");
http.end();
```

## 5. Tối ưu cho máy không có GPU

- `antialias: false`, `setPixelRatio(1)`, tắt bóng đổ.
- Chỉ dùng `MeshBasicMaterial` và `MeshLambertMaterial`.
- Giới hạn 30 FPS; render ở 75% độ phân giải rồi CSS phóng lên (hằng `RENDER_SCALE` trong `scene3d.js`, đặt `1` nếu muốn nét hơn).
- Vạch lề đường dùng `InstancedMesh` (1 draw call) và trôi bằng cách dịch cả nhóm.
- `camera.far = 160` kèm sương mù để không vẽ phần xa.
- HUD cập nhật 10 Hz (chỉ ghi DOM khi giá trị đổi), bản đồ 2 Hz, tách khỏi vòng vẽ 3D.

Nếu vẫn chậm: giảm `RENDER_SCALE` xuống `0.6`, hoặc thu nhỏ cửa sổ trình duyệt.

## 6. Cấu trúc thư mục

```
auto_tesla/
├─ server.js
├─ package.json
├─ README.md
└─ public/
   ├─ index.html
   ├─ style.css
   ├─ app.js
   ├─ scene3d.js
   ├─ mapview.js
   └─ sim.js
```
