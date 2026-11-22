// Canvas biên tập kịch bản: ba làn, kéo thả xe và kiểm tra dữ liệu.

import { CAR_LENGTH } from "../../shared/protocol.js";

const MIN_GAP = -50;
const MAX_GAP = 150;
const clone = (value) => JSON.parse(JSON.stringify(value));
const isLane = (value) => Number.isInteger(value) && value >= 0 && value <= 2;

export function createEmptyScenario() {
  return {
    name: "Kịch bản mới",
    description: "Kịch bản tạo từ editor desktop.",
    ego: { lane: 1, speed: 60, mode: "ACC", setSpeed: 80, timeGap: 1.8 },
    vehicles: [],
    events: [],
  };
}

// Trả về một kết quả duy nhất để editor và AI ở bước sau dùng chung.
export function validateScenario(scenario) {
  const errors = [];
  const warnings = [];
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    return { valid: false, errors: ["Kịch bản phải là một object JSON."], warnings };
  }
  if (typeof scenario.name !== "string" || !scenario.name.trim()) errors.push("Tên kịch bản không được để trống.");
  if (!scenario.ego || !isLane(scenario.ego.lane)) errors.push("Làn xe mình phải là số nguyên từ 0 đến 2.");
  if (!Number.isFinite(scenario.ego?.speed) || scenario.ego.speed < 0) errors.push("Tốc độ xe mình phải lớn hơn hoặc bằng 0.");
  if (!scenario.ego || !["ACC", "FOLLOW"].includes(scenario.ego.mode)) errors.push("Mode khởi đầu của xe mình phải là ACC hoặc FOLLOW.");
  if (!Number.isFinite(scenario.ego?.setSpeed) || scenario.ego.setSpeed < 0 || scenario.ego.setSpeed > 120) errors.push("setSpeed của xe mình phải từ 0 đến 120 km/h.");
  if (![1.2, 1.8, 2.5].includes(scenario.ego?.timeGap)) errors.push("timeGap của xe mình phải là 1.2, 1.8 hoặc 2.5 giây.");
  if (!Array.isArray(scenario.vehicles)) errors.push("vehicles phải là một mảng.");
  if (!Array.isArray(scenario.events)) errors.push("events phải là một mảng.");

  const vehicleIds = new Set();
  // Dữ liệu từ file/WebSocket có thể sai kiểu: chỉ duyệt khi là mảng, và mỗi phần tử phải là object.
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  for (const [index, vehicle] of (Array.isArray(scenario.vehicles) ? scenario.vehicles : []).entries()) {
    const label = `Xe thứ ${index + 1}`;
    if (!isObject(vehicle)) {
      errors.push(`${label} phải là một object.`);
      continue;
    }
    if (typeof vehicle.id !== "string" || !vehicle.id.trim()) errors.push(`${label} thiếu id.`);
    if (vehicleIds.has(vehicle.id)) errors.push(`ID xe ${vehicle.id} bị trùng.`);
    vehicleIds.add(vehicle.id);
    if (!isLane(vehicle.lane)) errors.push(`${label}: làn phải từ 0 đến 2.`);
    if (!Number.isFinite(vehicle.gap) || vehicle.gap < MIN_GAP || vehicle.gap > MAX_GAP) errors.push(`${label}: khoảng cách phải từ ${MIN_GAP} đến ${MAX_GAP} m.`);
    if (!Number.isFinite(vehicle.speed) || vehicle.speed < 0) errors.push(`${label}: tốc độ phải lớn hơn hoặc bằng 0.`);
  }

  let previousTime = -Infinity;
  const actions = new Set(["changeLane", "brake", "setSpeed"]);
  for (const [index, event] of (Array.isArray(scenario.events) ? scenario.events : []).entries()) {
    const label = `Sự kiện thứ ${index + 1}`;
    if (!isObject(event)) {
      errors.push(`${label} phải là một object.`);
      continue;
    }
    if (!vehicleIds.has(event.vehicle)) errors.push(`${label}: xe ${event.vehicle || "?"} không tồn tại.`);
    if (!actions.has(event.action)) errors.push(`${label}: action không hợp lệ.`);
    if (!Number.isFinite(event.at) || event.at < 0) errors.push(`${label}: thời điểm phải lớn hơn hoặc bằng 0.`);
    if (Number.isFinite(event.at) && event.at < previousTime) errors.push("Các sự kiện phải được xếp theo thời gian tăng dần.");
    if (Number.isFinite(event.at)) previousTime = event.at;
    if (event.action === "changeLane") {
      if (!isLane(event.toLane)) errors.push(`${label}: toLane phải từ 0 đến 2.`);
      if (!Number.isFinite(event.duration) || event.duration <= 0) errors.push(`${label}: duration phải lớn hơn 0.`);
    }
    if (event.action === "brake" || event.action === "setSpeed") {
      if (!Number.isFinite(event.toSpeed) || event.toSpeed < 0) errors.push(`${label}: toSpeed phải lớn hơn hoặc bằng 0.`);
    }
    if (event.action === "brake" && (!Number.isFinite(event.decel) || event.decel <= 0)) errors.push(`${label}: decel phải lớn hơn 0.`);
    if (event.action === "setSpeed" && (!Number.isFinite(event.accel) || event.accel <= 0)) errors.push(`${label}: accel phải lớn hơn 0.`);
  }

  // Chỉ cảnh báo: kịch bản nguy hiểm vẫn được phép lưu để phục vụ demo va chạm.
  const laneByVehicle = new Map((Array.isArray(scenario.vehicles) ? scenario.vehicles : [])
    .filter(isObject)
    .map((vehicle) => [vehicle.id, vehicle.lane]));
  for (const event of (Array.isArray(scenario.events) ? scenario.events : [])) {
    if (!isObject(event) || event.action !== "changeLane") continue;
    const vehicle = (Array.isArray(scenario.vehicles) ? scenario.vehicles : []).find((item) => isObject(item) && item.id === event.vehicle);
    const fromLane = laneByVehicle.get(event.vehicle);
    if (vehicle && fromLane !== scenario.ego?.lane && event.toLane === scenario.ego?.lane && Number.isFinite(event.at)) {
      const relativeTravel = ((vehicle.speed - scenario.ego.speed) / 3.6) * event.at;
      const estimatedDistance = vehicle.gap + relativeTravel - CAR_LENGTH;
      const brakingDistance = (scenario.ego.speed / 3.6) ** 2 / (2 * 6) + 5;
      if (estimatedDistance < brakingDistance) {
        warnings.push(`Xe ${vehicle.id} chen ở ~${Math.max(0, Math.round(estimatedDistance))} m khi bạn chạy ${Math.round(scenario.ego.speed)} km/h – cần ≥ ${Math.round(brakingDistance)} m để phanh kịp, kịch bản này sẽ va chạm.`);
      }
    }
    if (event.toLane !== undefined) laneByVehicle.set(event.vehicle, event.toLane);
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function createScenarioEditor(canvas, { onChange = () => {}, onSelect = () => {} } = {}) {
  const context = canvas.getContext("2d");
  let scenario = createEmptyScenario();
  let selectedId = null;
  let draggingId = null;
  // Màu lấy từ design tokens (style.css) để canvas cùng tông với giao diện.
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const colors = {
    bg: token("--bg-0"), road: token("--bg-1"), panel: token("--bg-3"), line: token("--line"), lineStrong: token("--line-strong"),
    text: token("--text"), muted: token("--text-muted"), dim: token("--text-dim"),
    accent: token("--accent"), accentInk: token("--accent-ink"), vehicle: token("--warning"),
  };
  const FONT = '600 11px Inter, "Segoe UI", sans-serif';
  const CAR_W = 40; // kích thước vẽ minh hoạ (không theo tỉ lệ thật), nhìn từ trên xuống
  const CAR_H = 68;
  const PAD = 32;
  const LANE_NAMES = ["trái", "giữa", "phải"];
  let hoverId = null;
  let frameRequest = 0; // gom nhiều pointermove thành một lần vẽ mỗi khung hình (đỡ nặng khi render bằng CPU)
  const scheduleRender = () => {
    if (frameRequest) return;
    frameRequest = requestAnimationFrame(() => { frameRequest = 0; render(); });
  };
  let dragInfo = null; // { lane, gap } khi đang kéo: dùng vẽ làn đích, đường bắt dính và tooltip

  const roadLeft = () => Math.max(56, canvas.width * 0.14);
  const roadWidth = () => canvas.width - roadLeft() - Math.max(16, canvas.width * 0.04);
  const laneCenter = (lane) => roadLeft() + roadWidth() * ((lane + 0.5) / 3);
  const gapToY = (gap) => PAD + ((MAX_GAP - gap) / (MAX_GAP - MIN_GAP)) * (canvas.height - PAD * 2);

  // step = bước bắt dính khoảng cách (m): 1 m, hoặc 5 m khi giữ Shift. Làn luôn bắt dính vào giữa làn.
  function pointToPosition(clientX, clientY, step = 1) {
    const bounds = canvas.getBoundingClientRect();
    const x = (clientX - bounds.left) * canvas.width / bounds.width;
    const y = (clientY - bounds.top) * canvas.height / bounds.height;
    const lane = Math.max(0, Math.min(2, Math.floor((x - roadLeft()) / (roadWidth() / 3))));
    const ratio = Math.max(0, Math.min(1, (y - PAD) / (canvas.height - PAD * 2)));
    const raw = MAX_GAP - ratio * (MAX_GAP - MIN_GAP);
    const gap = Math.max(MIN_GAP, Math.min(MAX_GAP, Math.round(raw / step) * step));
    return { lane, gap, x, y };
  }

  function vehicleAt(clientX, clientY) {
    const point = pointToPosition(clientX, clientY);
    return scenario.vehicles.findLast((vehicle) => (
      Math.abs(point.x - laneCenter(vehicle.lane)) <= CAR_W / 2 + 6
      && Math.abs(point.y - gapToY(vehicle.gap)) <= CAR_H / 2 + 4
    ));
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }

  // Xe nhìn từ trên xuống: thân bo tròn, kính trước/sau, bánh, đèn pha (trên) và đèn hậu (dưới).
  function drawCar(centerX, centerY, { fill, label, ink, selected = false, hovered = false }) {
    const x = centerX - CAR_W / 2;
    const y = centerY - CAR_H / 2;
    if (selected) {
      context.strokeStyle = colors.accent;
      context.lineWidth = 3;
      roundRect(x - 5, y - 5, CAR_W + 10, CAR_H + 10, 16);
      context.stroke();
    }
    context.fillStyle = "#0b0d10"; // bánh xe
    for (const wheelY of [y + 9, y + CAR_H - 23]) {
      roundRect(x - 3, wheelY, 6, 14, 2); context.fill();
      roundRect(x + CAR_W - 3, wheelY, 6, 14, 2); context.fill();
    }
    context.save();
    context.shadowColor = "rgb(0 0 0 / 50%)";
    context.shadowBlur = 10;
    context.shadowOffsetY = 3;
    context.fillStyle = fill;
    roundRect(x, y, CAR_W, CAR_H, 12);
    context.fill();
    context.restore();
    context.fillStyle = "rgb(8 10 13 / 78%)"; // kính chắn gió và kính sau
    roundRect(x + 6, y + 14, CAR_W - 12, 16, 5); context.fill();
    roundRect(x + 7, y + CAR_H - 21, CAR_W - 14, 9, 4); context.fill();
    context.fillStyle = "rgb(255 255 255 / 88%)"; // đèn pha
    roundRect(x + 5, y + 3, 9, 4, 2); context.fill();
    roundRect(x + CAR_W - 14, y + 3, 9, 4, 2); context.fill();
    context.fillStyle = "#ff5f57"; // đèn hậu
    roundRect(x + 5, y + CAR_H - 7, 9, 3, 1.5); context.fill();
    roundRect(x + CAR_W - 14, y + CAR_H - 7, 9, 3, 1.5); context.fill();
    context.fillStyle = ink;
    context.font = FONT;
    context.textAlign = "center";
    context.fillText(label, centerX, centerY + 8);
    if (hovered && !selected) {
      context.strokeStyle = "rgb(255 255 255 / 60%)";
      context.lineWidth = 2;
      roundRect(x - 2, y - 2, CAR_W + 4, CAR_H + 4, 14);
      context.stroke();
    }
  }

  function drawTooltip(anchorX, anchorY, text) {
    context.font = FONT;
    const width = context.measureText(text).width + 20;
    const height = 26;
    const x = Math.min(anchorX + CAR_W / 2 + 12, canvas.width - width - 8);
    const y = Math.max(8, Math.min(anchorY - height / 2, canvas.height - height - 8));
    context.fillStyle = colors.panel;
    context.strokeStyle = colors.lineStrong;
    context.lineWidth = 1;
    roundRect(x, y, width, height, 8);
    context.fill();
    context.stroke();
    context.fillStyle = colors.text;
    context.textAlign = "left";
    context.fillText(text, x + 10, y + 17);
  }

  function render() {
    const width = canvas.width;
    const height = canvas.height;
    const left = roadLeft();
    const laneWidth = roadWidth() / 3;
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);
    context.fillStyle = colors.road; // mặt đường
    context.fillRect(left, 0, roadWidth(), height);

    context.fillStyle = colors.accent; // làn xe mình hơi sáng hơn
    context.globalAlpha = 0.07;
    context.fillRect(left + laneWidth * scenario.ego.lane, 0, laneWidth, height);
    if (dragInfo) { // làn đích khi đang kéo
      context.globalAlpha = 0.14;
      context.fillRect(left + laneWidth * dragInfo.lane, 0, laneWidth, height);
    }
    context.globalAlpha = 1;

    // Lưới mờ mỗi 10 m, mốc 50 m đậm hơn; thước mét bên trái.
    context.font = "500 11px Inter, \"Segoe UI\", sans-serif";
    context.textAlign = "right";
    for (let gap = MIN_GAP; gap <= MAX_GAP; gap += 10) {
      const y = gapToY(gap);
      const major = gap % 50 === 0;
      context.strokeStyle = major ? colors.line : "rgb(255 255 255 / 4%)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + roadWidth(), y);
      context.stroke();
      context.strokeStyle = major ? colors.lineStrong : colors.line;
      context.beginPath();
      context.moveTo(left - (major ? 10 : 5), y);
      context.lineTo(left - 1, y);
      context.stroke();
      if (major) {
        context.fillStyle = colors.muted;
        context.fillText(`${gap > 0 ? "+" : ""}${gap} m`, left - 14, y + 4);
      }
    }

    // Vạch làn: biên ngoài liền, vạch giữa đứt; hai vạch quanh làn xe mình màu nhấn.
    for (let boundary = 0; boundary <= 3; boundary += 1) {
      const x = left + laneWidth * boundary;
      context.beginPath();
      context.setLineDash(boundary === 0 || boundary === 3 ? [] : [14, 12]);
      context.strokeStyle = boundary === scenario.ego.lane || boundary === scenario.ego.lane + 1 ? colors.accent : colors.lineStrong;
      context.lineWidth = 2;
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.setLineDash([]);

    // Vạch 0 m (vị trí xe mình).
    const egoY = gapToY(0);
    context.strokeStyle = colors.accent;
    context.globalAlpha = 0.35;
    context.setLineDash([4, 6]);
    context.beginPath();
    context.moveTo(left, egoY);
    context.lineTo(left + roadWidth(), egoY);
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;

    // Đường bắt dính: tâm làn đích và độ cao khoảng cách khi đang kéo.
    if (dragInfo) {
      const guideX = laneCenter(dragInfo.lane);
      const guideY = gapToY(dragInfo.gap);
      context.strokeStyle = colors.accent;
      context.globalAlpha = 0.5;
      context.setLineDash([3, 5]);
      context.beginPath();
      context.moveTo(guideX, 0);
      context.lineTo(guideX, height);
      context.moveTo(left, guideY);
      context.lineTo(left + roadWidth(), guideY);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
    }

    drawCar(laneCenter(scenario.ego.lane), egoY, { fill: colors.accent, label: "EGO", ink: colors.accentInk });
    const dragged = scenario.vehicles.find((vehicle) => vehicle.id === draggingId);
    for (const vehicle of scenario.vehicles) {
      if (vehicle === dragged) continue;
      drawCar(laneCenter(vehicle.lane), gapToY(vehicle.gap), {
        fill: colors.vehicle, label: vehicle.id, ink: "#1a1305", selected: vehicle.id === selectedId, hovered: vehicle.id === hoverId,
      });
    }
    if (dragged) {
      drawCar(laneCenter(dragged.lane), gapToY(dragged.gap), { fill: colors.vehicle, label: dragged.id, ink: "#1a1305", selected: true });
      drawTooltip(laneCenter(dragged.lane), gapToY(dragged.gap), `Làn ${dragged.lane} (${LANE_NAMES[dragged.lane]}) · ${dragged.gap > 0 ? "+" : ""}${dragged.gap} m`);
    }
  }

  function notify() {
    scenario.events.sort((a, b) => a.at - b.at);
    onChange(scenario);
    render();
  }

  function makeVehicleId() {
    let index = 1;
    while (scenario.vehicles.some((vehicle) => vehicle.id === `V${index}`)) index += 1;
    return `V${index}`;
  }

  function addVehicle(lane = 1, gap = 40) {
    const vehicle = { id: makeVehicleId(), lane, gap, speed: 60 };
    scenario.vehicles.push(vehicle);
    selectedId = vehicle.id;
    onSelect(vehicle);
    notify();
    return vehicle;
  }

  function updateSelected(values) {
    const vehicle = scenario.vehicles.find((item) => item.id === selectedId);
    if (!vehicle) return;
    Object.assign(vehicle, values);
    notify();
    onSelect(vehicle);
  }

  function removeSelected() {
    if (!selectedId) return;
    scenario.vehicles = scenario.vehicles.filter((vehicle) => vehicle.id !== selectedId);
    scenario.events = scenario.events.filter((event) => event.vehicle !== selectedId);
    selectedId = null;
    onSelect(null);
    notify();
  }

  canvas.addEventListener("pointerdown", (event) => {
    const vehicle = vehicleAt(event.clientX, event.clientY);
    selectedId = vehicle?.id || null;
    draggingId = selectedId;
    onSelect(vehicle || null);
    if (vehicle) {
      canvas.setPointerCapture(event.pointerId);
      dragInfo = { lane: vehicle.lane, gap: vehicle.gap };
      canvas.style.cursor = "grabbing";
    }
    render();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!draggingId) {
      // Không kéo: chỉ đổi viền "hover" và con trỏ khi rê qua xe.
      const hovered = vehicleAt(event.clientX, event.clientY)?.id || null;
      if (hovered !== hoverId) {
        hoverId = hovered;
        canvas.style.cursor = hovered ? "grab" : "default";
        scheduleRender();
      }
      return;
    }
    const vehicle = scenario.vehicles.find((item) => item.id === draggingId);
    if (!vehicle) return;
    const position = pointToPosition(event.clientX, event.clientY, event.shiftKey ? 5 : 1);
    vehicle.lane = position.lane;
    vehicle.gap = position.gap;
    dragInfo = { lane: position.lane, gap: position.gap };
    scheduleRender();
  });
  canvas.addEventListener("pointerup", () => {
    const releasedId = draggingId;
    draggingId = null;
    dragInfo = null;
    canvas.style.cursor = hoverId ? "grab" : "default";
    if (releasedId) {
      notify();
      onSelect(scenario.vehicles.find((vehicle) => vehicle.id === releasedId) || null);
    }
  });
  canvas.addEventListener("pointerleave", () => {
    if (draggingId || hoverId === null) return;
    hoverId = null;
    canvas.style.cursor = "default";
    render();
  });
  canvas.addEventListener("dragover", (event) => event.preventDefault());
  canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    const position = pointToPosition(event.clientX, event.clientY);
    addVehicle(position.lane, position.gap);
  });

  function setScenario(nextScenario) {
    scenario = clone(nextScenario);
    selectedId = null;
    onSelect(null);
    onChange(scenario);
    render();
  }

  // Canvas luôn lấp đầy khung chứa; vẽ lại khi đổi kích thước hoặc khi font Inter tải xong.
  function fitToContainer() {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(box.width));
    const height = Math.max(240, Math.round(box.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    render();
  }
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitToContainer).observe(canvas);
  document.fonts?.ready.then(render);

  render();
  return {
    addVehicle,
    getScenario: () => clone(scenario),
    getSelected: () => scenario.vehicles.find((vehicle) => vehicle.id === selectedId) || null,
    removeSelected,
    render,
    setScenario,
    updateSelected,
  };
}

