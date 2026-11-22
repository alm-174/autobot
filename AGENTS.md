# Hướng dẫn làm việc với dự án auto_tesla

## Mục đích

`auto_tesla` là đồ án sinh viên mô phỏng hệ thống Adaptive Cruise Control (ACC). Desktop làm bộ điều phối; web mô phỏng thế giới, cảm biến ảo và màn hình xe.

## Phạm vi hiện tại

Giai đoạn hiện tại **chỉ triển khai desktop + web**. Vòng dữ liệu cần khép kín như sau:

```text
desktop --kịch bản/lệnh--> web --message sensor--> desktop
   ^                                                   |
   |                                                   v
   +------- message ego <------- ECU giả lập ----------+
```

- ECU hiện tại là `desktop/server/acc-fallback.js`, gọi là **ECU giả lập**.
- MQTT và `embedded/wokwi/` thuộc **giai đoạn sau**: không implement trong giai đoạn hiện tại.
- Không import hoặc khởi tạo `desktop/server/mqtt.js` trong server/hub hiện tại.
- Giữ `mqtt.js`, giao thức MQTT và khung Wokwi để tích hợp sau, nhưng không đưa chúng vào vòng chạy hiện tại.

## Cấu trúc thư mục

- `shared/protocol.js`: tên message, topic và hằng số giao thức.
- `docs/`: tài liệu API và kiến trúc.
- `desktop/`: Electron, server điều phối, ECU giả lập, UI biên tập kịch bản.
- `desktop/scenarios/`: các kịch bản JSON mẫu.
- `web/`: mô phỏng thế giới, cảm biến ảo, cảnh 3D, HUD và bản đồ.
- `embedded/wokwi/`: khung dành cho giai đoạn MQTT + ESP32 sau này.
- `_old_prototype/`: prototype cũ chỉ để tham khảo, không tham gia ứng dụng mới.

## Lệnh chạy

```bash
cd desktop
npm install
npm start
```

Web master: <http://localhost:3000/?role=master>

## Định dạng kịch bản

```json
{
  "name": "Tên kịch bản",
  "description": "Mô tả",
  "ego": { "lane": 1, "speed": 60, "mode": "FOLLOW", "setSpeed": 80, "timeGap": 1.8 },
  "vehicles": [{ "id": "A", "lane": 2, "gap": 20, "speed": 65 }],
  "events": [{ "at": 5, "vehicle": "A", "action": "changeLane", "toLane": 1, "duration": 2 }]
}
```

`ego.mode` là `ACC` hoặc `FOLLOW`; `ego.timeGap` chỉ nhận `1.2`, `1.8`, `2.5`. Mọi file và message `scenario:load` phải qua `validateScenario()` dùng chung trong `desktop/ui/editor.js`.

## Quy tắc

1. Dùng JavaScript thuần; không TypeScript, React, Vue hoặc build tool.
2. Giữ code đơn giản nhất có thể và comment bằng tiếng Việt.
3. Không thêm thư viện nếu không thật sự cần.
4. Web chỉ mô phỏng thế giới, tạo sensor và hiển thị; web không tự quyết định tốc độ xe mình.
5. Trong giai đoạn hiện tại, ECU giả lập tại `desktop/server/acc-fallback.js` quyết định tốc độ xe mình.
6. `acc-fallback.js` nhận input đúng dạng message WebSocket `sensor` và trả output đúng dạng payload MQTT `<prefix>/control`. Nhờ vậy, khi thay ECU giả lập bằng ESP32 thì không phải sửa web.
7. Không implement MQTT/Wokwi và không import `mqtt.js` vào server/hub cho đến giai đoạn sau.
8. Khi sửa message, phải cập nhật đồng thời `shared/protocol.js` và `docs/api.md`.
9. Tối ưu cho máy không có GPU: `antialias: false`, không `shadowMap`, không post-processing (bloom/SSAO), không `MeshPhysicalMaterial`; chỉ dùng `MeshBasicMaterial`/`MeshMatcapMaterial`/`SpriteMaterial`; giới hạn 30 FPS và pixel ratio mặc định 1, tự giảm xuống 0,75 khi FPS trung bình 3 giây gần nhất < 22 (`?quality=high|low` để ép). Phải giữ ≥ 20 FPS khi Chrome chạy `--disable-gpu`.
10. Chỉ tab có `?role=master` được mô phỏng và gửi sensor; các tab khác chỉ xem.
11. Đơn vị chuẩn: tốc độ km/h, khoảng cách m, thời gian s, gia tốc m/s².
12. Kích thước xe chuẩn là `CAR_LENGTH = 4.5 m`, `CAR_WIDTH = 1.8 m`; `leadDistance` luôn đo từ đầu xe ego đến đuôi xe trước.
13. Xe đang đổi vào làn ego phải được báo `cutIn` trong phạm vi 40 m và được tính là xe trước ngay khi thân xe chạm vạch làn.
14. Khi hai hình chữ nhật xe chồng nhau, web phải dừng ở khung cuối chưa chồng hình, gửi `collision`, hiện `VA CHẠM` và desktop ghi kịch bản thất bại.
15. ECU giả lập có hai chế độ `ACC` và `FOLLOW`; quyết định điều khiển phải đi qua hàm thuần `decide()` trong `desktop/server/acc-fallback.js` và có test bằng `npm test`.

## Tiến độ

- [x] Tạo cấu trúc thư mục, tài liệu nền và bốn kịch bản mẫu.
- [x] 1. Hoàn thiện Express/WebSocket và hub điều phối.
- [x] 2. Hoàn thiện world và cảm biến ảo.
- [x] 3. Hoàn thiện ECU giả lập để tạo vòng desktop–web khép kín.
- [x] 4. Hoàn thiện Three.js, HUD và bản đồ Leaflet.
- [x] 5. Hoàn thiện editor kéo thả và timeline.
- [x] Sửa đo khoảng cách đầu–đuôi, phát hiện cut-in sớm và phát hiện va chạm.
- [x] Mở rộng ECU giả lập với FOLLOW, stop & go và lớp phanh an toàn chung.
- [ ] 6. Tích hợp AI sinh kịch bản.
- [ ] 7. Giai đoạn sau: tích hợp MQTT và ESP32 trên Wokwi.
- [ ] Kiểm thử end-to-end và tối ưu máy không GPU.
