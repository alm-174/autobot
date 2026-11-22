# ECU ESP32 trên Wokwi

Đây là khung mô phỏng ECU cho hệ thống ACC.

## Cách chạy

1. Mở thư mục này trên <https://wokwi.com>.
2. Kiểm tra `MQTT_PREFIX` trong sketch trùng với `desktop/.env`.
3. Chạy mô phỏng với WiFi `Wokwi-GUEST`.

## Phần cứng dự kiến

- Biến trở: đặt tốc độ từ 30 đến 120 km/h.
- Nút nhấn: bật/tắt ACC.
- LED xanh: ACC đang bật.
- LED đỏ và buzzer: cảnh báo khi TTC nhỏ hơn 2,5 giây.
- Servo: biểu diễn mức phanh.

`diagram.json` hiện chỉ là khung; chân GPIO và linh kiện sẽ được bổ sung ở bước triển khai ECU.
