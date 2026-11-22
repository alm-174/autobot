# Báo cáo kiểm thử desktop + web (giai đoạn hiện tại)

Ngày kiểm thử: 2026-11-22. Phạm vi: desktop tạo/xử lý tình huống (ECU giả lập) và web mô phỏng/hiển thị. **Không** kiểm tra MQTT, Wokwi, AI.
Không sửa mã dự án. Chỉ thêm `docs/test-report.md` và `docs/test-screenshots/`.

## 1. Cách kiểm thử

- Máy Windows 11, không GPU. Electron 33.4.11, Chrome thật chạy `--disable-gpu`, `playwright-core` (cài ngoài dự án, trong thư mục tạm).
- Chạy thật: `npm install`, `npm test`, `npm start` (Electron), điều khiển cửa sổ desktop qua CDP (Playwright), mở web `?role=master` và viewer bằng Chrome, ghi lại mọi message WebSocket bằng một client phụ.
- Hộp thoại Lưu/Mở file của Electron được giả lập (stub) trong tiến trình chính để bấm nút thật mà không cần chọn file bằng tay.
- **Lưu ý quan trọng:** vì `npm start` của dự án gốc bị crash (lỗi A1), mọi bước sau A1 được chạy trên **bản sao** của dự án trong thư mục tạm, chỉ thêm một file `package.json` chứa `{"type":"module"}` ở thư mục gốc bản sao. Dự án gốc không bị thay đổi. Hành vi từ A2 trở đi chính là hành vi sau khi sửa A1.
- Các ca "chen quá gần", "tắt ACC", "đổi cấu hình giữa chừng", "timeGap" dùng kịch bản tự tạo gửi qua `scenario:load`.

## 2. Bảng tổng

| Kết quả | Số mục |
|---|---|
| ĐẠT | 23 (14 ban đầu + 9 sau khi sửa) |
| LỖI | 0 (còn mở theo yêu cầu: L-7 tab viewer chỉ cập nhật HUD, đã ghi trong README) |
| CHƯA KIỂM TRA ĐƯỢC | 0 |

`npm test`: **22/22 pass** (nhưng không bắt được lỗi A1, xem mục 4).

| # | Mục | Kết quả |
|---|---|---|
| 1 | `npm install` + `npm start`, đúng PORT trong `.env` | ĐẠT (đã sửa L-1) |
| 2 | Master kết nối; master thứ 2 thành viên viewer | ĐẠT |
| 3 | Không có lỗi console / terminal | ĐẠT (đã sửa favicon) |
| 4 | Danh sách kịch bản đủ; file hỏng/null không làm mất danh sách | ĐẠT |
| 5 | Chọn kịch bản → web đúng vị trí; Play/Pause/Reset; Reset khôi phục cấu hình ECU | ĐẠT |
| 6 | Chạy lần 2 cho kết quả giống lần 1 | ĐẠT |
| 7 | Kéo xe, đổi làn/khoảng cách, sửa tốc độ, xoá xe | ĐẠT |
| 8 | Timeline thêm/sửa/xoá/kéo sự kiện; vạch đỏ | ĐẠT |
| 9 | Lưu → mở → giống hệt; validator tiếng Việt; cảnh báo chen làn | ĐẠT |
| 10 | Tạo mới → gửi sang web → Play | ĐẠT |
| 11 | ACC: trạng thái, không vượt setSpeed, timeGap | ĐẠT (đã sửa L-4) |
| 12 | FOLLOW: TRACKING, stop & go, LOST 3 s → ACC | ĐẠT |
| 13 | Chen làn: CUT_IN, chen xa/gần, VA CHẠM, Reset | ĐẠT (có rủi ro, xem L-9) |
| 14 | Tắt ACC: giữ tốc độ + FCW | ĐẠT |
| 15 | Đổi mode/setSpeed/timeGap giữa lúc chạy | ĐẠT (đã sửa L-5) |
| 16 | `distance` đo từ đầu xe mình đến đuôi xe trước | ĐẠT |
| 17 | 3D: làn, xe, đổi làn, đèn phanh, dải TTC | ĐẠT (đã sửa L-3) |
| 18 | HUD | ĐẠT |
| 19 | Bản đồ: không watermark, có ghi nguồn | ĐẠT (đã sửa L-2) |
| 20 | FPS ≥ 20 khi render bằng CPU | ĐẠT |
| 21 | F5 master, mở lại desktop, mất/nối lại kết nối | ĐẠT (đã sửa L-6) |
| 22 | Chạy 5 phút: bộ nhớ, log | ĐẠT (đã sửa L-10; bộ nhớ vốn ổn) |
| 23 | Tài liệu khớp hành vi | ĐẠT (đã sửa L-8) |

## 2b. Đã sửa L-1 … L-5 (2026-11-22)

Mỗi lỗi có test tái hiện chạy TRƯỚC khi sửa (fail), sau đó sửa cho pass. `npm test`: **28/28 pass** (trước khi sửa: 4 test mới fail).

| Lỗi | Sửa | Kiểm chứng |
|---|---|---|
| L-1 `npm start` crash | thêm `package.json` gốc `{"type":"module"}` | test `module-scope.test.js` (fail → pass); chạy thật `npm start` trên dự án gốc: `Server đang chạy tại http://localhost:3190`, desktop "Server đã kết nối" |
| L-2 bản đồ watermark | `web/js/map.js`: tile OpenStreetMap + CSS làm tối (`.dark-tiles`), bật lại ghi nguồn | 6/6 tile 200, 32–42 KB (không còn 2513 byte); hiện "Leaflet | © OpenStreetMap"; ảnh `L2-ban-do-sau-sua.png` |
| L-3 đèn phanh | `web/js/scene3d.js`: đèn nhô ra mặt sau (z = CAR_LENGTH/2 + 0,05, trước đây z=2,08 nằm lọt trong thân xe dài 4,5 m) + dải đèn trên nắp cốp | ảnh `L3-den-phanh-sau-sua.png`: đèn đỏ ở xe mình và xe trước khi phanh |
| L-4 thiếu DECEL | `acc-fallback.js`: ACC có xe trước và accel < −1 → `DECEL`; `protocol.js`, `docs/api.md`, HUD (chữ vàng) | 2 test (fail → pass); `lead-hard-brake.json`: chuỗi trạng thái `CRUISE → DECEL`; ảnh `L4-hud-decel.png` |
| L-5 phanh giật khi đổi cấu hình | ECU làm mượt `timeGap` (0,2 s mỗi giây); FOLLOW → ACC thủ công đặt `setSpeed` = tốc độ hiện tại (chỉ với `ecu:config` từ UI, không áp dụng khi nạp kịch bản) | accel nhỏ nhất: timeGap 1,8→2,5: **−4,28 → −0,70**; FOLLOW→ACC: **−3,26 → −0,31**; setSpeed 80→50 −1,66; ACC→FOLLOW −0,19 |

Các mục còn lại (L-6 … L-12) chưa sửa.

## 2c. Đã sửa lượt 2 (2026-11-22)

`npm test`: **41/41 pass** (sau lượt sửa 1 là 28; thêm 13 test, trong đó 6 test fail trước khi sửa). Kiểm chứng lại thật trên Electron + Chrome (`--disable-gpu`).

| Mục | Sửa | Kiểm chứng |
|---|---|---|
| **L-6** desktop nối lại | Hub gửi `scenario:load` (kèm `id`) + `sim:control` (play/pause) TRƯỚC `scenario:list`. UI chỉ tự chọn kịch bản khi hub chưa có kịch bản (`desktop/ui/ui.js`), đặt ô chọn theo `id`, hiện trạng thái play/pause (`#sim-state`). Editor có thay đổi chưa lưu thì hỏi `confirm` trước khi thay. | Test hub (fail → pass). Chạy thật: Play `follow-traffic`, ngắt WebSocket desktop 3 lần. (a) Không có nháp: ô chọn vẫn `follow-traffic.json`, "Mô phỏng: đang chạy", web **không reset** (t = 3,98 → 8,48 → 13,4 s). (b) Có nháp: hiện hộp thoại "Editor có thay đổi chưa lưu…", bấm Huỷ giữ nguyên nháp "Bản nháp đang soạn", lần chạy không bị reset. (c) Bấm OK: editor thay bằng kịch bản của hub. Ảnh `M1-desktop-sau-noi-lai.png`. |
| **L-10** log spam | Mặc định chỉ ghi CONNECT / DISCONNECT / ERROR và message đổi trạng thái (`scenario:*`, `sim:control`, `ecu:config`, `collision`); `LOG_VERBOSE=1` ghi tất cả (`hub.js`). | 2 test (fail → pass). Chạy thật ~1 phút: 22 dòng log, 0 dòng `sensor`/`ego` (trước: ~69 dòng/giây). |
| **L-11** favicon | `web/favicon.svg` + `<link rel="icon">`. | Test file tồn tại; chạy thật: không còn lỗi 404, console web không có lỗi. |
| **L-12** nhãn vai, FPS | Hub gửi `client:role`; web đổi nhãn theo vai thật. Bộ đếm FPS dời xuống dưới chip WebSocket. | Test (fail → pass). Tab master thứ hai hiện "WebSocket: đã kết nối (**viewer**)"; FPS `[835,73,897,103]` và chip `[705,16,910,46]` không giao nhau. Ảnh `M4-fps-vai-favicon.png`. |
| **L-8** tài liệu | `README.md`, `docs/architecture.md` viết lại đúng hiện trạng (MQTT/Wokwi/AI ghi "ngoài phạm vi, chưa làm"; README ghi "tab viewer chỉ cập nhật HUD"); `docs/api.md` bổ sung `error`, `ecu:config` hub → desktop, quy tắc FCW theo khoảng cách, `DECEL`, `client:role`, `id` của `scenario:load`, `LOG_VERBOSE`; `AGENTS.md` đánh lại số quy tắc (12 trùng → 15). | Đọc đối chiếu với mã. |
| **L-9** kịch bản mẫu | Xem bảng dưới. | Test headless 5 lần với nhịp khung hình khác nhau + chạy thật. |

Chưa sửa (theo yêu cầu): **L-7** tab viewer chỉ cập nhật HUD (3D, bản đồ đứng yên) — đã ghi rõ trong README. Hai mục nhỏ còn lại của L-12: cảnh báo chen làn nguy hiểm trong editor chỉ hiện khi Lưu/Gửi; Electron 33 có cảnh báo `npm audit` (devDependency).

### Kịch bản mẫu chạy thật (Electron + Chrome, thời gian thực)

Đổi ở lượt này: `cut-in.json` xe B từ gap 18 m lên 24 m (không sửa ECU); thêm `cut-in-collision.json`; đổi tên `scenario-moi.json` → `cut-in-side-blindspot.json` với mô tả "xe chen khi đang song song – ngoài tầm cảm biến phía trước, va chạm là giới hạn của ACC".

| Kịch bản | Mode ban đầu | Chuỗi trạng thái (@ t giây) | Khoảng cách nhỏ nhất (m) | Va chạm |
|---|---|---|---|---|
| `cut-in.json` | ACC | CRUISE → DECEL@4,3 → BRAKE@5,05 → CUT_IN@6,8 → CRUISE@7,0 → DECEL@9,6 → CRUISE@13,2 | **7,15** | không |
| `cut-in-collision.json` | ACC | CRUISE → BRAKE@1,05 → CRUISE@1,43 | 0,92 | **có**, t = 1,52 s, ego 81,3 km/h (cố ý) |
| `cut-in-side-blindspot.json` | ACC | CRUISE (cảm biến không thấy cut-in) | — | **có**, t = 6,02 s, ego 79,8 km/h (giới hạn của ACC) |
| `editor-cut-in-follow.json` | FOLLOW | LOST/FOLLOW → CRUISE/ACC@2,9 (đúng 3 s) → BRAKE@5,1 → CUT_IN@5,9 → CRUISE@7,1 → DECEL@9,4 → CRUISE@12,6 | 10,0 | không |
| `follow-traffic.json` | FOLLOW | TRACKING → STOP@23,9 → TRACKING@25,15 | 6,48 | không |
| `lead-hard-brake.json` | ACC | CRUISE → DECEL@5,2 → CRUISE@9,5 | 11,94 | không |
| `lead-leaves-lane.json` | ACC | DECEL@0,08 → CRUISE@1,2 | 29,2 | không |
| `stop-and-go.json` | ACC | CRUISE → DECEL@4,55 → CRUISE@9,55 → DECEL@21,3 → CRUISE@24,9 | 7,22 | không |

`cut-in.json` chạy 5 lần thật liên tiếp: khoảng cách nhỏ nhất **7,15 / 7,15 / 7,13 / 7,27 / 7,22 m** (≥ 5 m, ổn định), cùng chuỗi trạng thái; trước khi chỉnh là 1,0–1,23 m. Test headless `sample-scenarios.test.js` chạy mỗi kịch bản 5 lần với nhịp khung hình khác nhau: sáu kịch bản không va chạm đều có khoảng cách nhỏ nhất ≥ 5 m; hai kịch bản va chạm đều va chạm ở cả 5 lần; `cut-in-side-blindspot` không bao giờ thấy cut-in trước khi va chạm. Ảnh `M2-cut-in-collision.png`, `M2-side-blindspot.png`.

## 3. Lỗi, xếp theo ảnh hưởng tới buổi DEMO

### L-1. `npm start` crash ngay khi khởi động (mục 1) — Nghiêm trọng

- **Tái hiện:** `cd desktop && npm start`. Cửa sổ không mở. Terminal:
  `SyntaxError: Named export 'CAR_LENGTH' not found. The requested module '../../shared/protocol.js' is a CommonJS module` (tại `desktop/ui/editor.js:3`).
- **Nguyên nhân:** `shared/protocol.js` dùng `export` nhưng không nằm dưới `package.json` nào có `"type":"module"` (`package.json` gốc đã bị xoá khi chuyển prototype sang `_old_prototype/`). Electron 33 dùng Node 20 nên không tự nhận ra ESM. `npm test` vẫn pass vì Node 24 trên máy tự nhận diện được.
- **File:** `shared/protocol.js`, `desktop/ui/editor.js:3`, `web/js/world.js`, `web/js/sensor.js`.
- **Đề xuất:** thêm `package.json` chứa `{ "type": "module" }` vào `shared/` (hoặc ở thư mục gốc). Một file, vài dòng.
- Bằng chứng: `docs/test-screenshots` không có ảnh (cửa sổ không mở); log: xem mục 1 ở trên. Sau khi thêm `{"type":"module"}` trong bản sao: server lên đúng cổng `PORT=3111` đọc từ `desktop/.env` (`Server đang chạy tại http://localhost:3111`), ảnh `A1-desktop-khoi-dong.png`.

### L-2. Bản đồ hiện watermark "API KEY REQUIRED" và không ghi nguồn (mục 19) — Nên sửa (thấy ngay khi demo)

- **Tái hiện:** mở web master. 6/6 tile từ `basemaps.cartocdn.com/dark_all` đều có kích thước 2513 byte (ảnh cảnh báo). `.leaflet-control-attribution` không tồn tại.
- **File:** `web/js/map.js` (`attributionControl: false`, URL tile CARTO).
- **Đề xuất:** dùng tile OpenStreetMap + CSS đảo màu (hoặc khoá CARTO), bật lại `attributionControl`.
- Ảnh: `E19-ban-do.png`, `A2-web-master.png`.

### L-3. Đèn phanh không nhìn thấy (mục 17) — Nên sửa

- **Tái hiện:** chạy `lead-hard-brake.json`; khi `ego.braking=true` (accel −4,44 m/s²) vẫn không thấy đèn đỏ ở đuôi xe mình hay xe trước. Ảnh `E17-den-phanh-ego.png`, `D13-chen-qua-gan.png`.
- **Nguyên nhân (suy ra từ mã):** đèn là hộp nhỏ dày 0,08 m đặt sát mặt sau xe (`web/js/scene3d.js:31-33`, z = 2,08), camera nhìn từ trên cao xuống nên gần như chỉ thấy nóc xe.
- **Đề xuất:** đặt đèn cao hơn/nhô ra hơn, hoặc thêm một thanh đỏ trên nắp sau xe khi phanh.
- Các phần khác của 3D đạt: 3 làn, xe đúng làn, đổi làn mượt (`D17-3d-doi-lan.png`), dải xanh (`D12-follow-tracking.png`) và đỏ (`D14-acc-off-fcw.png`), xe dừng cách nhau 0,3 m, không chồng hình (`D13-chen-qua-gan.png`). Dải **vàng** (TTC < 5 s) chưa chụp được ảnh.

### L-4. ACC không có trạng thái giảm tốc; HUD báo "CRUISE" khi đang phanh mạnh (mục 11) — Nên sửa

- **Tái hiện:** `lead-hard-brake.json`: ego từ 74 xuống 12 km/h, accel nhỏ nhất −5,39 m/s², nhưng chuỗi trạng thái chỉ là `CRUISE/ACC`. `stop-and-go.json` (ACC): ego giảm tới 2,6 km/h nhưng vẫn `CRUISE`.
- Danh sách yêu cầu có `DECEL` nhưng mã/docs không có trạng thái này (`state` chỉ có CRUISE, TRACKING, CUT_IN, STOP, LOST, BRAKE, OFF; `STOP` chỉ ở FOLLOW).
- **File:** `desktop/server/acc-fallback.js` (`decide()`), `web/js/hud.js`.
- **Đề xuất:** thêm `DECEL` khi ACC có xe trước và `accel < -1` mà chưa vào BRAKE; cập nhật `shared/protocol.js` + `docs/api.md` + màu trên HUD.
- Phần còn lại của mục 11 đạt: timeGap 1,2/1,8/2,5 cho khoảng cách ổn định 24,96 / 34,97 / 46,64 m (lý thuyết 25,0 / 35,0 / 46,7); tốc độ tối đa 59,94 km/h khi setSpeed = 60.

### L-5. Đổi cấu hình giữa lúc chạy gây phanh mạnh (mục 15) — Nên sửa

Số liệu (`d2-results`, ACC, xe trước 60 km/h):

| Thao tác | accel nhỏ nhất | Nhận xét |
|---|---|---|
| timeGap 1,8 → 2,5 s (@8 s) | **−4,28** m/s² | tốc độ 61,4 → 55,7 km/h, giật mạnh chỉ vì đổi tuỳ chọn |
| setSpeed 80 → 50 (@16 s) | −1,87 | mượt |
| ACC → FOLLOW (@24 s) | −0,17 | mượt |
| FOLLOW → ACC + timeGap 1,2 (@32 s) | **−3,26** | ACC quay về `setSpeed=50` cũ trong khi xe đang ~65–71 km/h |

- **File:** `desktop/server/acc-fallback.js` (`decide`, `createSimulatedEcu.setConfig`).
- **Đề xuất:** giới hạn tốc độ thay đổi gia tốc (jerk ~3 m/s³) hoặc cho ACC bám khoảng cách mượt hơn; khi người dùng đổi FOLLOW → ACC thủ công thì đặt `setSpeed` = tốc độ hiện tại (như đường LOST → ACC đã làm).

### L-6. Desktop UI nối lại kết nối làm mất lần chạy và bản nháp (mục 21) — Nên sửa — ĐÃ SỬA

- **Tái hiện:** chạy `stop-and-go.json` ở t=4,2 s; trong editor có "Bản nháp đang soạn". Ngắt WebSocket của cửa sổ desktop (hoặc F5 cửa sổ). Sau ~2 s: web đổi sang "Xe chen làn rồi phanh gấp" (kịch bản đầu danh sách) và t về 0; ô tên trong editor bị ghi đè bằng tên kịch bản đó. Ô chọn kịch bản không phản ánh kịch bản hub đang chạy.
- **File:** `desktop/ui/ui.js` (`showScenarioList` luôn gọi `selectScenario`; nhận `scenario:load` luôn ghi đè editor).
- **Đề xuất:** chỉ tự chọn khi hub chưa có kịch bản; không ghi đè editor khi đang có thay đổi chưa lưu; hoặc lưu nháp vào `localStorage`.
- Phần đạt của mục 21: F5 tab master giữa lúc chạy và master mất rồi nối lại: web quay về t=0 ở trạng thái PAUSE, ECU về tốc độ ban đầu (40 km/h = 40 km/h), không lệch (`F21a-sau-F5-master.png`). Tắt hẳn ứng dụng desktop rồi mở lại: tab master hiện "mất kết nối", sau khi mở lại tự kết nối và nhận kịch bản.

### L-7. Tab viewer không thấy xe chạy (phát hiện thêm, liên quan mục 2 và 21) — Nên sửa

- **Tái hiện:** mở thêm `?role=viewer&debug=1`, Play `lead-hard-brake.json`. Master `t = 6.07 s`, viewer `t = 0 s`: 3D, bản đồ và xe trước của viewer đứng yên; chỉ số tốc độ HUD (từ message `ego`) vẫn nhảy. Ảnh `A2-web-viewer.png`.
- **File:** `web/js/app.js` (`world.update` chỉ chạy ở master; viewer bỏ qua `sensor`).
- **Đề xuất:** master gửi thêm trạng thái thế giới (vị trí xe) 10 Hz cho viewer, hoặc ghi rõ trong tài liệu: viewer chỉ xem HUD.
- Liên quan: tab master thứ hai bị hạ thành viewer nhưng nhãn vẫn ghi `WebSocket: đã kết nối (master)` (`web/js/socket.js`) — gây hiểu nhầm (Nhỏ).

### L-8. Tài liệu không khớp hành vi (mục 23) — Nên sửa — ĐÃ SỬA

- `README.md`: vẫn ghi "repository mới ở giai đoạn khung dự án… chỉ có comment, hàm rỗng và TODO"; mô tả desktop "kết nối MQTT… ACC dự phòng", `embedded` là ECU đang chạy; liệt kê 4 kịch bản (thực tế có 7 file, gồm `follow-traffic`, `editor-cut-in-follow`, `scenario-moi`).
- `docs/architecture.md`: sơ đồ và "Trách nhiệm" coi luồng MQTT/ESP32, "ACC dự phòng khi ESP32 mất > 2 s", gọi LLM là đang chạy.
- `docs/api.md`: thiếu message `error` (`{type:"error",data:{message}}`), thiếu hướng hub → desktop của `ecu:config`, thiếu quy tắc `FCW` theo khoảng cách (`leadDistance < v(m/s) + 3`), thiếu nói `ttc` có thể là `null` khi đang không lại gần.
- `AGENTS.md`: đánh số quy tắc trùng ("12." xuất hiện hai lần); lệnh chạy `cd desktop && npm start` hiện bị crash (L-1).
- Phần khớp: `CUT_IN`, `collision`, `leadDistance` đầu–đuôi, định dạng sensor/ego/kịch bản khớp mã.

### L-9. Kịch bản mẫu sát va chạm (mục 13, ghi chú rủi ro) — Nên sửa — ĐÃ SỬA

- `cut-in.json`: ECU không va chạm nhưng khoảng cách nhỏ nhất chỉ **1,00 m** (lần 1) và **1,23 m** (lần 2), 22 mẫu FCW, phanh −6 m/s². Biên 0,2 m này có thể thành "VA CHẠM" ở lần chạy khác (thời gian thực nên không giống hệt từng khung).
- `scenario-moi.json` (do bạn lưu từ editor): luôn **VA CHẠM tại t=6,02 s** (ego 79,8 km/h): xe V1 đang song song ở làn bên khi chen vào nên cảm biến không thấy cut-in (`cutIn.detected=false` suốt). Editor đã cảnh báo kiểu này khi Lưu/Gửi.
- Đề xuất: chọn lại thông số `cut-in.json` (xe B xa hơn hoặc chậm hơn) để có biên an toàn ≥ 5 m; đặt mô tả/tên rõ cho kịch bản va chạm cố ý.

### L-10. Log terminal spam (mục 22) — Nhỏ — ĐÃ SỬA

- Chạy 5 phút: 21 495 dòng, ≈ 69 dòng/giây, ≈ 1 MB/phút (hub ghi log từng message `sensor`/`ego`). `desktop/server/hub.js` (`send`, hàm `log`).
- Bộ nhớ ổn: heap web 8,1–8,7 MB, heap desktop 9,5 MB, RSS Electron 459 → 354 MB, Chrome 530 → 448 MB, không tăng. FPS 21–23. Mô phỏng chạy đúng thời gian thực (t=310 s sau 309 s), 0 va chạm ngoài ý muốn.
- Đề xuất: không log `sensor`/`ego`.

### L-11. Console trình duyệt có 1 lỗi 404 mỗi lần tải (mục 3) — Nhỏ — ĐÃ SỬA

- `GET /favicon.ico` → 404 (đã kiểm: HTTP 404). Terminal và console của cửa sổ desktop không có lỗi.
- Đề xuất: thêm `<link rel="icon" href="data:,">` vào `web/index.html`.

### L-12. Nhỏ khác

- Bộ đếm FPS ở góc phải trên bị chip "WebSocket…" che một phần (ảnh `A2-web-master.png`).
- Cảnh báo chen làn nguy hiểm trong editor chỉ hiện khi bấm Lưu/Gửi, không hiện ngay khi mở file hay chỉnh (`CẢNH BÁO: Xe B chen ở ~0 m khi bạn chạy 90 km/h…`, ảnh `C9-canh-bao-chen-lan.png`).
- `npm audit`: Electron 33 có nhiều cảnh báo (mức high), chỉ là devDependency.
- Bản nháp trong editor không được lưu khi tắt app (thiết kế hiện tại).
- Tại thời điểm kiểm thử, `desktop/`, `web/`, `shared/`, `docs/` vẫn chưa nằm trong git (chưa commit).

## 4. Chi tiết số liệu từng kịch bản (mục 11–16)

Chuỗi trạng thái (`trạng thái/mode @ t(s)`), khoảng cách nhỏ nhất (m, đầu xe mình → đuôi xe trước):

| Kịch bản | Chuỗi trạng thái | Khoảng cách nhỏ nhất | Kết quả |
|---|---|---|---|
| `cut-in.json` (lần 1 / lần 2) | CRUISE → BRAKE@5,1 → CRUISE@7,3 / CRUISE → BRAKE@5,0 → CRUISE@7,2 | 1,00 / 1,23 | không va chạm; chuỗi giống nhau, số liệu lệch ≤ 0,23 m |
| `lead-hard-brake.json` | CRUISE (accel min −5,39) | 11,94 | không va chạm, không FCW |
| `stop-and-go.json` | CRUISE (tốc độ min 2,6 km/h) | 7,21 | không va chạm |
| `lead-leaves-lane.json` | CRUISE; tăng lại 79,94 km/h (≤ setSpeed 80) | 29,23 | đúng |
| `follow-traffic.json` (FOLLOW) | TRACKING → STOP@23,95 → TRACKING@25,17 | 6,46 | tự dừng, tự chạy lại |
| `editor-cut-in-follow.json` | LOST@0,07 → CRUISE/ACC@2,98 (đúng ~3 s) → BRAKE@5,07 → CUT_IN@5,88 → CRUISE@7,08 | 10,84 | không va chạm |
| `scenario-moi.json` | CRUISE; không phát hiện cut-in | — | VA CHẠM t=6,02, banner, hub ghi "THẤT BẠI" |
| tự tạo: chen xa (B gap 70, 70 km/h, ego 80) | CRUISE → CUT_IN@4,25 (cách 38 m) → CRUISE | 37,73 | không va chạm |
| tự tạo: chen quá gần (ego 90, B gap 30, 20 km/h, chen sau 0,5 s) | CRUISE → BRAKE@0,62 (cách 13 m, accel −6) | 0,25 | VA CHẠM t=1,38, mô phỏng dừng, banner đỏ; Reset: banner mất, t về 0, Play chạy lại |
| tự tạo: tắt ACC (xe trước 30 km/h) | OFF, tốc độ giữ 60, 33 mẫu FCW | 0,09 | VA CHẠM t=6,67 (đúng vì ACC tắt) |

- Mục 16: `cut-in.json` t=0, xe A gap 75 → `leadDistance` = **70,5** (= 75 − 4,5). Va chạm kích hoạt đúng khi khoảng cách chạm 0.
- Mục 5: Reset khôi phục ECU: đổi (setSpeed 50, FOLLOW, 2,5 s) → sau Reset về (80, ACC, 1,8 s), thời gian web về 0.
- Mục 4: thư mục có 7 kịch bản hợp lệ + `zz-broken.json` (JSON hỏng) + `zz-null.json` (`vehicles:[null]`): ô chọn hiện đủ 7, hai file hỏng bị bỏ qua.
- Mục 7–10: kéo-thả xe vào làn 2/gap 60 chính xác; kéo sang làn 0/gap 20; sửa tay; xoá. Timeline: thêm 3 sự kiện, sửa, kéo khối sang ~50% trục (at=15), xoá; vạch đỏ 14,1% → 24,1% khi Play, về 0% sau Reset. Lưu → Mở → Lưu cho 2 file giống hệt (549 byte). Validator: `Làn xe mình phải là số nguyên từ 0 đến 2. • Tốc độ xe mình phải lớn hơn hoặc bằng 0.`; file JSON hỏng: `Không thể mở file: Expected property name…`; file có null: `Xe thứ 1 phải là một object. • Sự kiện thứ 1 phải là một object.`

## 5. Ảnh chụp

Thư mục `docs/test-screenshots/`: `A1-desktop-khoi-dong`, `A2-web-master`, `A2-desktop-co-master`, `A2-web-viewer`, `B4-danh-sach-kich-ban`, `B5-web-nap-cut-in`, `B5-desktop-sau-reset`, `C7-editor-keo-tha`, `C8-timeline`, `C9-validator-loi`, `C9-canh-bao-chen-lan`, `C10-web-chay-kich-ban-moi`, `C10-desktop-chay`, `D12-follow-tracking`, `D12-follow-stop`, `D13-va-cham-web`, `D13-va-cham-desktop`, `D13-sau-va-cham`, `D13-chen-qua-gan`, `D14-acc-off-fcw`, `D17-3d-doi-lan`, `D18-hud-brake-fcw`, `E17-den-phanh-ego`, `E19-ban-do`, `E20-fps-follow-traffic`, `F21a-sau-F5-master`, `F21c-desktop-sau-reconnect`, `F22-sau-5-phut` (đuôi `.png`).

## 6. Giới hạn của lần kiểm thử

- FPS đo bằng Chrome headless `--disable-gpu` (render phần mềm) ở 1280×720: 21–23 FPS, chỉ vừa qua ngưỡng 20; máy yếu hơn có thể dưới ngưỡng.
- Hộp thoại Lưu/Mở của Electron được giả lập, không thao tác bằng hộp thoại hệ điều hành thật.
- Dải màu vàng của dải TTC chưa chụp được ảnh.
- Các kết quả từ mục 2 trở đi chạy trên bản sao đã thêm `{"type":"module"}`.
