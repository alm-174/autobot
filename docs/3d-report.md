# Báo cáo nâng cấp hình ảnh 3D (web/js/scene3d.js)

Không đổi logic mô phỏng. Đo bằng Chrome thật `--disable-gpu` (render phần mềm), cửa sổ 1280×720, kịch bản `cut-in.json` (2 xe + xe mình), 25 giây, bỏ 3 giây đầu. Ảnh trước/sau: `docs/3d-screenshots/` (`before-*`, `after-*`: đầu kịch bản, chạy ổn định, chen làn, phanh gấp).

## FPS

| Cách đo | Trước | Sau (tự thích ứng) | Sau `quality=high` | Sau `quality=low` |
|---|---|---|---|---|
| Bộ giới hạn 30 FPS **cũ** (bản gốc) | 22,2 (21–23) | 22,1 (21–24) | 22,3 (21–24) | 22,1 (21–23) |
| Bộ giới hạn 30 FPS **đã sửa** (xem dưới) | 30,0 (30–30) | **29,6** (28–30) | 29,4 (27–30) | 30,0 (30–30) |
| Không giới hạn FPS (chỉ để so chi phí vẽ) | 59,9 (trần vsync) | 36,3 (31–39) | 40,2 (37–42) | 59,9 |

- Mọi cấu hình đều ≥ 20 FPS. Cảnh mới tốn hơn khoảng 1,5 lần (60 → 40 FPS khi không giới hạn) nhưng vẫn dư xa mức 30 FPS.
- **Bộ giới hạn khung (web/js/app.js):** rAF 60 Hz cách nhau 16,7 ms nên điều kiện `≥ 33,33 ms` hay bị lệch xuống 33,3 − ε và bỏ qua một nhịp, FPS tụt còn ~22 dù máy vẫn dư sức. Đã trừ 2 ms dung sai (một dòng) để đạt đúng 30 FPS; nếu không sửa, bộ tự thích ứng (ngưỡng 22) sẽ kích hoạt oan.
- **Tự thích ứng:** thử giới hạn CPU 6× bằng Chrome DevTools: sau 3 giây FPS < 22 thì tự giảm xuống 0,75× (bộ đếm hiện "· 0.75×", `data-quality="auto-reduced"`); `?quality=high` không bao giờ giảm.

## Những gì đã thêm

1. Model xe Kenney Car Kit 3.1 (CC0), `sedan.glb` 2 032 tam giác; `GLTFLoader`; một geometry dùng chung cho mọi xe; xe mình trắng, xe khác xám nhạt (đổi các texel sơn của palette lúc chạy).
2. `MeshMatcapMaterial` với matcap 128×128 local; `ACESFilmicToneMapping`, `SRGBColorSpace`.
3. Bóng giả: mặt phẳng gradient tròn mờ dưới mỗi xe.
4. Đèn hậu phát sáng + quầng sáng additive, sáng dần khi phanh (nhanh lên, chậm tắt).
5. Chuyển động: camera làm mượt theo xe mình (trượt ngang, lùi ra và mở rộng góc nhìn nhẹ khi nhanh); thân xe chúi/ngửa theo gia tốc; bánh quay theo tốc độ; nghiêng và xoay đầu khi chuyển làn; mặt đường và vạch đứt trôi theo tốc độ.
6. Môi trường: vân nhựa đường mờ (có vệt bánh xe), vạch làn phát sáng nhẹ (xanh khi ACC bật), mép đường, trời gradient, sương mù cùng màu chân trời.
7. Chất lượng tự thích ứng và `?quality=high|low`.

Không dùng: `shadowMap`, post-processing, `MeshPhysicalMaterial` (test `web-3d.test.js` kiểm tra mã nguồn).

## Giới hạn

- Kenney Car Kit là kiểu "đồ chơi" bo khối; thân xe được kéo dài theo trục dọc (≈1,77×) để khớp `CAR_LENGTH` = 4,5 m, bánh xe giữ tỉ lệ đều.
- Ở `0.75×` hình hơi mờ/răng cưa (không bật antialias theo yêu cầu máy không GPU).
- Chưa kiểm trên máy thật có GPU hay màn hình độ phân giải cao.
