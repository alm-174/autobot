// =====================================================================
//  mapview.js  -  BẢN ĐỒ (Leaflet + nền tối CARTO dark_all)
//  - Vẽ tuyến đường mẫu
//  - Điểm đánh dấu xe xoay theo heading
//  - Luôn giữ xe ở giữa màn hình
//  Cập nhật 2 Hz (tách khỏi vòng vẽ 3D).
// =====================================================================
import { ROUTE } from "./sim.js";

/* global L */ // L là biến toàn cục do leaflet.js tạo ra

// Mũi tên xe: SVG hướng lên trên (Bắc); xoay bằng CSS transform theo heading
const CAR_SVG = `
<svg width="38" height="38" viewBox="0 0 38 38">
  <circle cx="19" cy="19" r="17" fill="rgba(62,166,255,.18)" stroke="rgba(62,166,255,.5)" stroke-width="1"/>
  <path d="M19 6 L28 29 L19 24 L10 29 Z" fill="#3ea6ff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

export function createMap(elementId) {
  const map = L.map(elementId, {
    zoomControl: false,
    zoomAnimation: false,
    fadeAnimation: false,
    inertia: false,
  });

  // Nền bản đồ tối (cần mạng; mất mạng thì chỉ thấy nền đen + tuyến đường).
  //
  // LƯU Ý: máy chủ CARTO dark_all hiện trả ảnh "API KEY REQUIRED" cho mọi tile nếu không có khoá,
  // nên mặc định dùng tile OpenStreetMap + bộ lọc CSS đảo màu (class "dark-tiles" trong style.css)
  // để có nền tối mà không cần khoá. Nếu bạn có khoá CARTO, đổi USE_CARTO = true và điền khoá.
  const USE_CARTO = false;
  const CARTO_KEY = ""; // điền khoá CARTO nếu có
  const layer = USE_CARTO
    ? L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${CARTO_KEY}`, {
        subdomains: "abcd", maxZoom: 19, attribution: "&copy; OpenStreetMap &copy; CARTO",
      })
    : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, className: "dark-tiles", attribution: "&copy; OpenStreetMap",
      });
  layer.addTo(map);

  // Tuyến đường: vòng khép kín
  const latlngs = ROUTE.map((p) => [p.lat, p.lng]);
  L.polyline([...latlngs, latlngs[0]], { color: "#3ea6ff", weight: 5, opacity: 0.8 }).addTo(map);

  // Điểm đánh dấu xe
  const icon = L.divIcon({ className: "car-marker", html: CAR_SVG, iconSize: [38, 38], iconAnchor: [19, 19] });
  const marker = L.marker(latlngs[0], { icon, interactive: false, keyboard: false }).addTo(map);
  const svgEl = () => marker.getElement()?.querySelector("svg");

  map.setView(latlngs[0], 16);
  new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById(elementId));

  let rot = 0;
  return {
    /** Gọi 2 lần/giây */
    update(gps) {
      if (!gps) return;
      const pos = [gps.lat, gps.lng];
      marker.setLatLng(pos);
      map.panTo(pos, { animate: true, duration: 0.5, easeLinearity: 1 }); // giữ xe ở giữa

      // Xoay theo đường ngắn nhất (tránh quay vòng 360° khi qua mốc 0/360)
      const diff = ((gps.heading - rot + 540) % 360) - 180;
      rot += diff;
      const el = svgEl();
      if (el) el.style.transform = `rotate(${rot}deg)`;
    },
  };
}
