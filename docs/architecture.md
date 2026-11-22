# Kiến trúc hệ thống (giai đoạn hiện tại: desktop + web)

## Sơ đồ luồng dữ liệu

```text
┌──────────────────── Desktop / Electron ────────────────────┐
│ UI: soạn kịch bản, Play/Pause/Reset, cấu hình ECU          │
│            │ WebSocket (?role=desktop)                     │
│            ▼                                               │
│   Hub (Express + ws) ──► ECU giả lập (acc-fallback.js)     │
│            ▲   decide(): ACC / FOLLOW / CUT_IN / BRAKE     │
└────────────┼───────────────────────────────────────────────┘
             │ WebSocket (?role=master / viewer)
             ▼
┌────────────────────────── Web ─────────────────────────────┐
│ master: mô phỏng xe xung quanh → cảm biến ảo (sensor 10 Hz)│
│ master + viewer: cảnh 3D, HUD, bản đồ (viewer chỉ HUD)     │
│ Xe mình chạy theo message ego từ ECU, web không tự quyết   │
└─────────────────────────────────────────────────────────────┘
```

Luồng chính: `desktop (kịch bản, lệnh) → web master → sensor → hub → ECU giả lập → ego → web + desktop`.

## Trách nhiệm

### Desktop

- Phục vụ `web/` (và thư viện Three.js, Leaflet từ `node_modules`) trên cổng 3000, quản lý kết nối WebSocket.
- **Tạo tình huống:** nạp danh sách kịch bản trong `desktop/scenarios/`, trình soạn kéo thả + timeline, mở/lưu JSON, kiểm tra bằng `validateScenario()`.
- **Xử lý tình huống:** hub nhận `sensor` từ web master, chạy ECU giả lập mỗi lần nhận một gói, gửi `ego` về web và desktop. ECU có hai chế độ `ACC` và `FOLLOW`, trạng thái `CRUISE`, `DECEL`, `TRACKING`, `CUT_IN`, `STOP`, `LOST`, `BRAKE`, `OFF`; phanh khẩn cấp ưu tiên trong cả hai chế độ.
- Giữ trạng thái chung: kịch bản hiện tại, play/pause. Khi desktop hoặc tab web nối lại, hub gửi lại kịch bản và trạng thái play/pause.
- Ghi log kết nối và các message đổi trạng thái (`LOG_VERBOSE=1` ghi tất cả).

### Web

- Tab `?role=master` mô phỏng xe xung quanh theo kịch bản, tạo sensor 10 Hz, phát hiện va chạm và gửi `collision`. Chỉ có **một** master; tab master thứ hai bị hạ thành viewer.
- Tab viewer chỉ nhận message để cập nhật HUD; cảnh 3D và bản đồ của viewer không chuyển động.
- Không quyết định tốc độ xe mình. Render tối đa 30 FPS, không dùng hiệu ứng nặng GPU.

## Ngoài phạm vi, chưa làm

- **MQTT** (`desktop/server/mqtt.js`) và **ESP32 trên Wokwi** (`embedded/wokwi/`): chỉ là khung, không nằm trong vòng chạy hiện tại. Khi làm, ESP32 sẽ thay ECU giả lập: nhận sensor và trả payload `control` đã mô tả trong `docs/api.md`, không cần sửa web.
- **AI sinh kịch bản** (`desktop/server/ai.js`): chưa làm.
