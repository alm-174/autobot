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
  const roadLeft = () => canvas.width * 0.17;
  const roadWidth = () => canvas.width * 0.66;
  const laneCenter = (lane) => roadLeft() + roadWidth() * ((lane + 0.5) / 3);
  const gapToY = (gap) => 32 + ((MAX_GAP - gap) / (MAX_GAP - MIN_GAP)) * (canvas.height - 64);

  function pointToPosition(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    const x = (clientX - bounds.left) * canvas.width / bounds.width;
    const y = (clientY - bounds.top) * canvas.height / bounds.height;
    const lane = Math.max(0, Math.min(2, Math.floor((x - roadLeft()) / (roadWidth() / 3))));
    const ratio = Math.max(0, Math.min(1, (y - 32) / (canvas.height - 64)));
    return { lane, gap: Math.round(MAX_GAP - ratio * (MAX_GAP - MIN_GAP)), x, y };
  }

  function vehicleAt(clientX, clientY) {
    const point = pointToPosition(clientX, clientY);
    return scenario.vehicles.findLast((vehicle) => Math.abs(point.x - laneCenter(vehicle.lane)) <= 26 && Math.abs(point.y - gapToY(vehicle.gap)) <= 20);
  }

  function drawCar(vehicle, color, label) {
    const x = laneCenter(vehicle.lane);
    const y = gapToY(vehicle.gap);
    context.fillStyle = color;
    context.fillRect(x - 22, y - 15, 44, 30);
    context.strokeStyle = vehicle.id === selectedId ? "#ffffff" : "#101419";
    context.lineWidth = vehicle.id === selectedId ? 3 : 1;
    context.strokeRect(x - 22, y - 15, 44, 30);
    context.fillStyle = "#ffffff";
    context.font = "bold 12px Arial";
    context.textAlign = "center";
    context.fillText(label, x, y + 4);
  }

  function render() {
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#0d1116";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#242a31";
    context.fillRect(roadLeft(), 0, roadWidth(), height);
    for (let boundary = 0; boundary <= 3; boundary += 1) {
      const x = roadLeft() + roadWidth() * boundary / 3;
      context.beginPath();
      context.setLineDash(boundary === 0 || boundary === 3 ? [] : [12, 10]);
      context.strokeStyle = boundary === scenario.ego.lane || boundary === scenario.ego.lane + 1 ? "#3ea6ff" : "#737d88";
      context.lineWidth = 2;
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.setLineDash([]);
    context.fillStyle = "#98a3af";
    context.font = "11px Arial";
    context.textAlign = "right";
    for (const gap of [-50, 0, 50, 100, 150]) {
      const y = gapToY(gap);
      context.fillText(`${gap > 0 ? "+" : ""}${gap} m`, roadLeft() - 10, y + 4);
      context.strokeStyle = "#3a424b";
      context.beginPath();
      context.moveTo(roadLeft(), y);
      context.lineTo(roadLeft() + roadWidth(), y);
      context.stroke();
    }
    drawCar({ id: "__ego", lane: scenario.ego.lane, gap: 0 }, "#3e8cff", "EGO");
    for (const vehicle of scenario.vehicles) drawCar(vehicle, "#e5a93d", vehicle.id);
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
    render();
    if (vehicle) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!draggingId) return;
    const vehicle = scenario.vehicles.find((item) => item.id === draggingId);
    if (!vehicle) return;
    const position = pointToPosition(event.clientX, event.clientY);
    vehicle.lane = position.lane;
    vehicle.gap = position.gap;
    render();
  });
  canvas.addEventListener("pointerup", () => {
    if (draggingId) {
      notify();
      onSelect(scenario.vehicles.find((vehicle) => vehicle.id === draggingId) || null);
    }
    draggingId = null;
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

