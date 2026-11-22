# Giao thức dữ liệu

Đơn vị dùng trong toàn hệ thống: tốc độ `km/h`, khoảng cách `m`, thời gian `s`, gia tốc `m/s²`.

## WebSocket

### Desktop → web

Nạp kịch bản:

```json
{ "type": "scenario:load", "data": { "name": "...", "ego": { "lane": 1, "speed": 60, "mode": "FOLLOW", "setSpeed": 80, "timeGap": 1.8 }, "vehicles": [], "events": [] } }
```

Khi nạp từ thư mục `desktop/scenarios/`, hub thêm trường `id` (tên file) vào message `scenario:load` (không có `id` nếu kịch bản được gửi từ editor):

```json
{ "type": "scenario:load", "id": "cut-in.json", "data": { "name": "..." } }
```

Khi một client **vừa kết nối** (desktop, master hoặc viewer) và hub đã có kịch bản, hub gửi lại `scenario:load`, rồi `sim:control` với `action` là `play` hoặc `pause` đúng trạng thái hiện tại, rồi (với desktop) `scenario:list` và `ecu:config`. Nhờ vậy UI desktop nối lại **không** tự chọn kịch bản mới và không làm reset lần chạy.

UI desktop nhận danh sách file và yêu cầu server nạp một file bằng hai message nội bộ:

```json
{ "type": "scenario:list", "data": [{ "id": "cut-in.json", "name": "Xe chen làn rồi phanh gấp" }] }
```

```json
{ "type": "scenario:select", "data": { "id": "cut-in.json" } }
```

Điều khiển mô phỏng:

```json
{ "type": "sim:control", "action": "play" }
```

`action` nhận một trong: `play`, `pause`, `reset`.

Trạng thái xe mình:

```json
{
  "type": "ego",
  "data": {
    "speed": 60,
    "accel": 0,
    "braking": false,
    "warning": "NONE",
    "accOn": true,
    "setSpeed": 70,
    "mode": "FOLLOW",
    "timeGap": 1.8,
    "state": "TRACKING",
    "ecu": "sim"
  }
}
```

`mode` là `ACC` hoặc `FOLLOW`. `timeGap` nhận `1.2`, `1.8` hoặc `2.5` giây. `state` nhận `CRUISE`, `DECEL` (ACC đang bám xe trước và giảm tốc quá `-1 m/s²` nhưng chưa phanh khẩn cấp), `TRACKING`, `CUT_IN`, `STOP`, `LOST`, `BRAKE` hoặc `OFF`. `CUT_IN` chủ động giảm `-2.5 m/s²`; `BRAKE` vẫn ưu tiên khi TTC dưới 2.5 s. `warning` là `NONE` hoặc `FCW`. Trong giai đoạn hiện tại, `ecu` là `sim`; giai đoạn sau có thể là `esp32`.

UI desktop cấu hình ECU giả lập bằng:

```json
{ "type": "ecu:config", "data": { "setSpeed": 80, "accOn": true, "mode": "FOLLOW", "timeGap": 1.8 } }
```

Hub áp dụng cấu hình rồi **gửi lại `ecu:config` cùng định dạng (hub → desktop)** chứa cấu hình ECU hiện tại. Hub cũng gửi message này khi nạp hoặc reset kịch bản và khi desktop vừa kết nối, nên UI luôn hiển thị đúng cấu hình thật. Khi người dùng chuyển FOLLOW → ACC bằng tay, ECU đặt `setSpeed` bằng tốc độ hiện tại. Khi đổi `timeGap`, khoảng cách mong muốn trượt dần 0,2 s mỗi giây để xe không phanh giật.

### Hub → client: lỗi và vai

Lỗi (gửi cho client gây ra lỗi):

```json
{ "type": "error", "data": { "message": "Kịch bản không hợp lệ: ..." } }
```

Vai thật của tab web, gửi ngay khi kết nối. Tab mở bằng `?role=master` nhưng đã có master khác sẽ bị hạ thành `viewer`:

```json
{ "type": "client:role", "data": { "role": "viewer" } }
```

### Web → desktop

```json
{
  "type": "sensor",
  "data": {
    "t": 5.2,
    "egoSpeed": 60,
    "leadDetected": true,
    "leadId": "A",
    "leadDistance": 35,
    "leadSpeed": 50,
    "relSpeed": 10,
    "ttc": 12.6,
    "egoLane": 1,
    "cutIn": { "detected": true, "distance": 30, "speed": 50 }
  }
}
```

Chỉ tab có `?role=master` gửi message `sensor`, với tần suất 10 lần/giây.

`warning: "FCW"` được ECU đặt khi **một trong hai** điều kiện đúng: TTC nhỏ hơn 2,5 s, hoặc khoảng cách tới xe trước nhỏ hơn `tốc độ xe mình (m/s) + 3 m` (khoảng 1 giây hành trình). Khi FCW, ECU phanh `-6 m/s²` và `state` là `BRAKE`. `ttc` là `null` khi không có xe trước hoặc xe mình không đang tiến lại gần xe trước.

`leadDistance` là khoảng trống thực từ đầu xe mình đến đuôi xe trước, không phải khoảng cách tâm–tâm. Cả hai xe dùng `CAR_LENGTH = 4.5 m`, `CAR_WIDTH = 1.8 m` từ `shared/protocol.js`.

`cutIn` báo sớm xe làn bên đang đổi vào làn ego trong phạm vi 40 m. Xe được tính là xe trước ngay khi thân xe chạm vạch làn ego. Khi không có cut-in, giá trị là `{ "detected": false, "distance": null, "speed": null }`.

`leadId` dùng để quan sát xe đang được cảm biến chọn. Khi không có xe trong tầm 150 m, `leadDetected` là `false` và các trường thông tin xe trước là `null`.

### Web master → hub: va chạm

```json
{ "type": "collision", "data": { "t": 5.4, "vehicleId": "B", "egoSpeed": 48 } }
```

Web dừng mô phỏng ở khung cuối chưa chồng hình, hiện banner `VA CHẠM`; hub chuyển tiếp cho desktop và ghi log kịch bản thất bại.

### Hub → desktop UI

Mặc định hub chỉ ghi log CONNECT/DISCONNECT/ERROR và các message đổi trạng thái (`scenario:*`, `sim:control`, `ecu:config`, `collision`). Đặt `LOG_VERBOSE=1` để ghi mọi message, kể cả `sensor` và `ego` 10 Hz.

Hub gửi trạng thái mỗi khi web master hoặc viewer kết nối/ngắt kết nối:

```json
{
  "type": "hub:status",
  "data": {
    "webClients": 2,
    "masterConnected": true
  }
}
```

- `webClients`: tổng số tab web master và viewer đang kết nối.
- `masterConnected`: có ít nhất một tab `?role=master` hay không.

## MQTT

Tiền tố lấy từ `MQTT_PREFIX`, mặc định `autobot_nhom5`.

### `<prefix>/sensor` — desktop → ESP32

Payload giống trường `data` của message WebSocket `sensor`.

### `<prefix>/control` — ESP32 → desktop

```json
{
  "speed": 55,
  "accel": -1.5,
  "braking": true,
  "warning": "NONE",
  "accOn": true,
  "setSpeed": 70,
  "mode": "FOLLOW",
  "timeGap": 1.8,
  "state": "TRACKING"
}
```

ECU giả lập ở giai đoạn hiện tại trả đúng payload này. Ở `FOLLOW`, `setSpeed` không điều khiển xe; giới hạn tốc độ là 120 km/h. Nếu mất xe trước, ECU giữ tốc độ 3 giây ở trạng thái `LOST`, sau đó chuyển sang `ACC` với `setSpeed` bằng tốc độ hiện tại. Hub chỉ bổ sung `ecu: "sim"` khi bọc payload trong message WebSocket `ego` gửi về web.

ESP32 publish 10 lần/giây. Nếu desktop không nhận control trong 2 giây, desktop chuyển sang ACC dự phòng.

### `<prefix>/status` — ESP32 → desktop

```json
{ "online": true, "uptime": 42 }
```

ESP32 publish heartbeat 1 lần/giây.

## Định dạng kịch bản

```json
{
  "name": "Tên kịch bản",
  "description": "Mô tả",
  "ego": { "lane": 1, "speed": 60, "mode": "FOLLOW", "setSpeed": 80, "timeGap": 1.8 },
  "vehicles": [
    { "id": "A", "lane": 1, "gap": 40, "speed": 55 }
  ],
  "events": [
    { "at": 5, "vehicle": "A", "action": "brake", "toSpeed": 10, "decel": 6 }
  ]
}
```

- `lane`: `0` trái, `1` giữa, `2` phải.
- `ego.mode`: `ACC` hoặc `FOLLOW`; `ego.setSpeed` từ 0–120 km/h; `ego.timeGap` là `1.2`, `1.8` hoặc `2.5` giây. Các giá trị này được áp dụng khi nạp kịch bản.
- `gap`: vị trí ban đầu so với xe mình; dương ở phía trước, âm ở phía sau.
- `action`: `changeLane`, `brake` hoặc `setSpeed`.
- `duration`: thời gian chuyển làn mượt.
- `decel` và `accel` là độ lớn gia tốc, dùng đơn vị m/s².
- Desktop nhận thời gian mô phỏng từ trường `t` của message `sensor` và dùng nó để chạy playhead màu đỏ trên timeline.

