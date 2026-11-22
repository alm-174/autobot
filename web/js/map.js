// Bản đồ Leaflet tối và tuyến đường mẫu quanh hồ Hoàn Kiếm, Hà Nội.

import * as L from "/vendor/leaflet/leaflet-src.esm.js";

const ROUTE = [
  [21.02855, 105.85235],
  [21.02955, 105.85415],
  [21.03125, 105.85535],
  [21.03335, 105.85435],
  [21.03435, 105.85175],
  [21.03275, 105.84915],
  [21.02975, 105.84955],
  [21.02855, 105.85235],
];

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitude1 = toRadians(a[0]);
  const latitude2 = toRadians(b[0]);
  const deltaLatitude = toRadians(b[0] - a[0]);
  const deltaLongitude = toRadians(b[1] - a[1]);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const SEGMENTS = ROUTE.slice(0, -1).map((point, index) => ({
  from: point,
  to: ROUTE[index + 1],
  length: distanceMeters(point, ROUTE[index + 1]),
}));
const ROUTE_LENGTH = SEGMENTS.reduce((sum, segment) => sum + segment.length, 0);

function positionOnRoute(distanceTravelled) {
  let remaining = ((distanceTravelled % ROUTE_LENGTH) + ROUTE_LENGTH) % ROUTE_LENGTH;

  for (const segment of SEGMENTS) {
    if (remaining <= segment.length) {
      const progress = remaining / segment.length;
      return [
        segment.from[0] + (segment.to[0] - segment.from[0]) * progress,
        segment.from[1] + (segment.to[1] - segment.from[1]) * progress,
      ];
    }
    remaining -= segment.length;
  }

  return ROUTE[0];
}

export function createMap(container) {
  const map = L.map(container, {
    zoomControl: false,
    preferCanvas: true,
  }).setView(ROUTE[0], 15);

  // CARTO dark_all hiện trả ảnh "API KEY REQUIRED" nếu không có khoá, nên dùng tile OpenStreetMap
  // và làm tối bằng CSS (class dark-tiles). Giữ ghi nguồn theo điều khoản OSM.
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    className: "dark-tiles",
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  L.polyline(ROUTE, { color: "#3ea6ff", weight: 4, opacity: 0.8 }).addTo(map);
  const vehicleMarker = L.circleMarker(ROUTE[0], {
    radius: 7,
    color: "#ffffff",
    weight: 2,
    fillColor: "#3ea6ff",
    fillOpacity: 1,
  }).addTo(map);

  function update(distanceTravelled) {
    const position = positionOnRoute(distanceTravelled || 0);
    vehicleMarker.setLatLng(position);
    map.panTo(position, { animate: false });
  }

  window.setTimeout(() => map.invalidateSize(), 0);
  return { update, map };
}
