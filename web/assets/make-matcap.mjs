// Tạo matcap-soft.png (128x128): "quả cầu" sáng kiểu studio mềm, trung tính để vật liệu tự nhuộm màu.
// Chạy lại: node web/assets/make-matcap.mjs   (tác phẩm riêng của dự án, tuỳ dùng như CC0)
import fs from "node:fs";
import zlib from "node:zlib";

const SIZE = 128;
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const KEY = norm([-0.45, 0.75, 0.6]);   // đèn chính từ trên-trái-trước
const FILL = norm([0.8, 0.1, 0.45]);    // đèn phụ yếu từ bên phải
const VIEW = [0, 0, 1];
const HALF = norm([KEY[0] + VIEW[0], KEY[1] + VIEW[1], KEY[2] + VIEW[2]]);

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 3 + 1)] = 0; // filter: None
  for (let x = 0; x < SIZE; x += 1) {
    const nx = ((x + 0.5) / SIZE) * 2 - 1;
    const ny = -(((y + 0.5) / SIZE) * 2 - 1);
    const r2 = nx * nx + ny * ny;
    const nz = Math.sqrt(Math.max(0, 1 - r2));
    const normal = r2 <= 1 ? [nx, ny, nz] : norm([nx, ny, 0.001]); // ngoài đĩa: lấy màu mép
    const key = Math.max(0, dot(normal, KEY)) * 0.6;
    const fill = Math.max(0, dot(normal, FILL)) * 0.14;
    const spec = Math.pow(Math.max(0, dot(normal, HALF)), 28) * 0.4;
    const rim = Math.pow(1 - Math.max(0, normal[2]), 3) * 0.3;
    const base = 0.36 + key + fill; // 0.36 = ánh sáng nền
    const color = [base + spec + rim * 0.85, base + spec + rim * 0.95, base + spec + rim * 1.05];
    for (let c = 0; c < 3; c += 1) {
      const linear = Math.min(1, Math.max(0, color[c]));
      raw[y * (SIZE * 3 + 1) + 1 + x * 3 + c] = Math.round(Math.pow(linear, 1 / 2.2) * 255); // sRGB
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
fs.writeFileSync(new URL("./matcap-soft.png", import.meta.url), png);
console.log("matcap-soft.png", png.length, "byte");
