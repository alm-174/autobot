# auto_tesla

Đồ án sinh viên mô phỏng hệ thống **Adaptive Cruise Control (ACC)**. Giai đoạn hiện tại chỉ gồm **desktop** và **web**.

## Hiện trạng

| Phần | Việc đã làm |
|---|---|
| `desktop/` (Electron) | Tạo tình huống (trình soạn kéo thả + timeline, mở/lưu JSON, kịch bản mẫu) và **xử lý tình huống**: hub WebSocket điều phối, **ECU giả lập** `desktop/server/acc-fallback.js` (chế độ `ACC` và `FOLLOW`, `CUT_IN`, phanh khẩn cấp, FCW) quyết định tốc độ xe mình. |
| `web/` | **Mô phỏng thế giới** (xe xung quanh theo kịch bản, đổi làn, va chạm), cảm biến ảo phía trước, **hiển thị**: cảnh 3D Three.js, HUD, bản đồ Leaflet. Chỉ tab `?role=master` mô phỏng và gửi sensor. **Tab viewer chỉ cập nhật HUD** (tốc độ, trạng thái ECU); 3D và bản đồ của viewer không chuyển động. |
| `shared/` | Tên message và hằng số giao thức dùng chung. |

Vòng dữ liệu khép kín: `desktop --kịch bản/lệnh--> web --sensor--> desktop (ECU giả lập) --ego--> web`.

**Ngoài phạm vi, chưa làm:** MQTT, ESP32/Wokwi (`embedded/wokwi/` chỉ là khung), AI sinh kịch bản (`desktop/server/ai.js`, `mqtt.js` chỉ là khung rỗng, không được import).

## Chạy

Yêu cầu Node.js 20 trở lên.

```bash
cd desktop
npm install
npm start
```

Cửa sổ desktop mở ra và server chạy cổng 3000. Mở web master: <http://localhost:3000/?role=master>

Thử nhanh: chọn kịch bản trong desktop, bấm **Play**. Kiểm thử tự động:

```bash
cd desktop
npm test
```

Cấu hình (tuỳ chọn): sao chép `desktop/.env.example` thành `desktop/.env`. Hiện chỉ `PORT` được dùng; các biến MQTT/AI để dành cho giai đoạn sau. `LOG_VERBOSE=1` ghi log mọi message (mặc định chỉ ghi kết nối và các message đổi trạng thái).

## Giao diện desktop

Bố cục: thanh công cụ trên (Play/Pause/Reset, tên kịch bản, trạng thái server/master/ECU), trái là danh sách kịch bản, giữa là trình soạn kéo thả, phải là thuộc tính xe đang chọn + thông số trực tiếp + biểu đồ 30 s + cấu hình ECU, dưới là timeline (mỗi xe một hàng).

| Phím | Việc |
|---|---|
| Space | Play / Pause |
| Delete | xoá xe hoặc sự kiện đang chọn |
| Ctrl+S / Ctrl+O | lưu / mở file kịch bản |
| Shift khi kéo xe | bắt dính khoảng cách theo bước 5 m (mặc định 1 m); xe luôn bắt dính vào giữa làn |

Thông báo dùng toast và hộp thoại trong giao diện (không dùng alert/confirm). Màu, khoảng cách (lưới 8 px), bo góc nằm ở design tokens đầu `desktop/ui/style.css`; canvas editor và biểu đồ đọc cùng các token đó. Font Inter (`@fontsource/inter`) và icon Lucide (sprite SVG inline trong `desktop/ui/index.html`, nguồn `lucide-static`) đều dùng file local, không cần mạng. Ảnh trước/sau: `docs/ui-screenshots/`.

## Kịch bản mẫu (`desktop/scenarios/`)

| File | Mô tả | Kết quả mong đợi |
|---|---|---|
| `lead-hard-brake.json` | xe trước phanh gấp | không va chạm |
| `cut-in.json` | xe làn phải chen vào rồi phanh gấp | không va chạm, khoảng cách nhỏ nhất ≈ 7 m |
| `cut-in-collision.json` | chen quá gần, **cố ý va chạm** để demo giới hạn hệ thống | va chạm |
| `cut-in-side-blindspot.json` | xe chen khi đang song song, ngoài tầm cảm biến phía trước | va chạm (giới hạn của ACC) |
| `stop-and-go.json` | giao thông dừng và chạy lại (ACC) | không va chạm |
| `follow-traffic.json` | chế độ `FOLLOW`: bám xe, dừng, tự chạy lại | không va chạm |
| `lead-leaves-lane.json` | xe trước rời làn | không va chạm |
| `editor-cut-in-follow.json` | kịch bản tạo từ editor: `FOLLOW` mất xe → `ACC`, rồi có xe chen | không va chạm |

Định dạng kịch bản và message: [docs/api.md](docs/api.md). Luồng dữ liệu: [docs/architecture.md](docs/architecture.md). Kết quả kiểm thử: [docs/test-report.md](docs/test-report.md).
