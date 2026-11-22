// Điều phối giao diện desktop, ECU giả lập, editor và biểu đồ telemetry.

import { createEmptyScenario, createScenarioEditor, validateScenario } from "./editor.js";
import { createTimeline } from "./timeline.js";
import { confirmDialog, icon, isDialogOpen, toast } from "./feedback.js";

const RECONNECT_DELAY_MS = 2000;

export function initUi() {
  const serverLight = document.querySelector("#server-light");
  const serverStatus = document.querySelector("#server-status");
  const webClientCount = document.querySelector("#web-client-count");
  const masterLight = document.querySelector("#master-light");
  const masterStatus = document.querySelector("#master-status");
  const scenarioSelect = document.querySelector("#scenario-select");
  const scenarioDescription = document.querySelector("#scenario-description");
  const controlButtons = document.querySelectorAll("[data-action]");
  const setSpeedRange = document.querySelector("#set-speed-range");
  const setSpeedValue = document.querySelector("#set-speed-value");
  const accToggle = document.querySelector("#acc-toggle");
  const modeToggle = document.querySelector("#mode-toggle");
  const timeGapInputs = document.querySelectorAll('input[name="time-gap"]');
  const speedSetting = document.querySelector(".speed-setting");
  const egoSpeedValue = document.querySelector("#ego-speed-value");
  const distanceValue = document.querySelector("#distance-value");
  const ttcValue = document.querySelector("#ttc-value");
  const warningValue = document.querySelector("#warning-value");
  const brakingValue = document.querySelector("#braking-value");
  const ecuStateValue = document.querySelector("#ecu-state-value");
  const driveModeValue = document.querySelector("#drive-mode-value");
  const chart = document.querySelector("#ecu-chart");
  const chartContext = chart.getContext("2d");
  const editorMessage = document.querySelector("#editor-message");
  const editorName = document.querySelector("#editor-name");
  const editorDescription = document.querySelector("#editor-description");
  const editorEgoLane = document.querySelector("#editor-ego-lane");
  const editorEgoSpeed = document.querySelector("#editor-ego-speed");
  const editorEgoMode = document.querySelector("#editor-ego-mode");
  const editorSetSpeed = document.querySelector("#editor-set-speed");
  const editorTimeGap = document.querySelector("#editor-time-gap");
  const vehicleFields = document.querySelector("#vehicle-fields");
  const vehicleEmpty = document.querySelector("#vehicle-empty");
  const vehicleId = document.querySelector("#vehicle-id");
  const vehicleLane = document.querySelector("#vehicle-lane");
  const vehicleGap = document.querySelector("#vehicle-gap");
  const vehicleSpeed = document.querySelector("#vehicle-speed");
  let socket = null;
  let scenarios = [];
  let latestSensor = null;
  let history = [];
  let currentScenario = createEmptyScenario();
  let timeline = null;
  let hubHasScenario = false; // hub đã có kịch bản (nhận scenario:load trước scenario:list) -> không tự chọn lại
  let hubScenarioId = null;
  let savedSnapshot = ""; // nội dung editor lúc nạp/lưu gần nhất, để biết có thay đổi chưa lưu
  const simState = document.querySelector("#sim-state");
  const scenarioList = document.querySelector("#scenario-list");
  const toolbarName = document.querySelector("#toolbar-scenario-name");
  const ecuChip = document.querySelector("#ecu-chip");
  const ecuChipText = document.querySelector("#ecu-chip-text");
  const canvasEmpty = document.querySelector("#canvas-empty");
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim(); // màu lấy từ design tokens trong style.css
  let scenariosLoaded = false;
  let simPlaying = false;
  let pendingHubScenario = null; // kịch bản hub đang chờ người dùng quyết định thay hay giữ bản nháp
  let lastSelected = "vehicle"; // phím Delete xoá xe hay sự kiện: theo thứ tự chọn gần nhất
  let validationWarnings = [];

  // Dòng trạng thái ở chân editor (luôn giữ) + toast (trừ khi silent).
  function showEditorMessage(message, isError = false, isWarning = false, { silent = false } = {}) {
    editorMessage.textContent = message;
    editorMessage.title = message; // dòng trạng thái bị cắt bằng dấu … thì rê chuột để xem đủ
    editorMessage.classList.toggle("is-error", isError);
    editorMessage.classList.toggle("is-warning", isWarning && !isError);
    // Toast chỉ hiện tên file cho gọn (đường dẫn đầy đủ vẫn còn ở dòng trạng thái và tooltip).
    const shortMessage = message.replace(/(?:[A-Za-z]:)?[\\/](?:[^\\/\s]+[\\/])+/g, "…/");
    if (!silent) toast(isError ? "error" : isWarning ? "warning" : "success", shortMessage);
  }

  // Tên kịch bản trên thanh công cụ và trạng thái rỗng của canvas.
  function updateTitleAndEmpty() {
    toolbarName.textContent = editorName.value.trim() || "Kịch bản chưa đặt tên";
    canvasEmpty.hidden = editor.getScenario().vehicles.length > 0;
  }

  function renderScenarioList() {
    scenarioList.innerHTML = "";
    if (!scenariosLoaded || scenarios.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = scenariosLoaded
        ? `${icon("folder-open", "icon icon-lg")}<strong>Chưa có kịch bản</strong><span>Thêm file .json vào thư mục desktop/scenarios hoặc dùng nút Mở.</span>`
        : "<span>Đang tải danh sách…</span>";
      scenarioList.append(empty);
      return;
    }
    for (const item of scenarios) {
      const active = item.id === scenarioSelect.value;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `scenario-item${active ? " is-active" : ""}`;
      button.dataset.id = item.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(active));
      button.title = item.description || item.name;
      button.innerHTML = "<strong></strong><small></small>";
      button.querySelector("strong").textContent = item.name;
      button.querySelector("small").textContent = item.description || "";
      // Danh sách chỉ là cách hiển thị: chọn mục = đổi <select> ẩn rồi chạy đúng logic cũ.
      button.addEventListener("click", () => {
        scenarioSelect.value = item.id;
        scenarioSelect.dispatchEvent(new Event("change"));
        renderScenarioList();
      });
      scenarioList.append(button);
    }
  }

  function showSelectedVehicle(vehicle) {
    vehicleEmpty.hidden = Boolean(vehicle);
    vehicleFields.hidden = !vehicle;
    if (!vehicle) return;
    vehicleId.value = vehicle.id;
    vehicleLane.value = String(vehicle.lane);
    vehicleGap.value = String(vehicle.gap);
    vehicleSpeed.value = String(vehicle.speed);
  }

  const editor = createScenarioEditor(document.querySelector("#scenario-canvas"), {
    onChange(nextScenario) {
      currentScenario = nextScenario;
      timeline?.refresh();
      updateTitleAndEmpty();
    },
    onSelect: showSelectedVehicle,
  });

  timeline = createTimeline(document.querySelector("#timeline"), {
    getScenario: () => currentScenario,
    onChange(nextScenario) {
      currentScenario = nextScenario;
      editor.setScenario(nextScenario);
    },
  });

  function loadIntoEditor(scenario, message = "Đã nạp kịch bản vào editor.", { silent = false } = {}) {
    currentScenario = JSON.parse(JSON.stringify(scenario));
    editorName.value = currentScenario.name || "";
    editorDescription.value = currentScenario.description || "";
    editorEgoLane.value = String(currentScenario.ego?.lane ?? 1);
    editorEgoSpeed.value = String(currentScenario.ego?.speed ?? 60);
    editorEgoMode.value = currentScenario.ego?.mode || "ACC";
    editorSetSpeed.value = String(currentScenario.ego?.setSpeed ?? 80);
    editorTimeGap.value = String(currentScenario.ego?.timeGap ?? 1.8);
    editor.setScenario(currentScenario);
    timeline.setTime(0);
    timeline.refresh();
    savedSnapshot = JSON.stringify(editor.getScenario());
    updateTitleAndEmpty();
    showEditorMessage(message, false, false, { silent });
  }

  const isDirty = () => JSON.stringify(editor.getScenario()) !== savedSnapshot;

  function showSimState(action) {
    simPlaying = action === "play";
    simState.textContent = action === "play" ? "Mô phỏng: đang chạy" : action === "reset" ? "Mô phỏng: về đầu, đang dừng" : "Mô phỏng: đang dừng";
  }

  function syncMeta() {
    const nextScenario = editor.getScenario();
    nextScenario.name = editorName.value;
    nextScenario.description = editorDescription.value;
    nextScenario.ego = {
      lane: Number(editorEgoLane.value),
      speed: Number(editorEgoSpeed.value),
      mode: editorEgoMode.value,
      setSpeed: Number(editorSetSpeed.value),
      timeGap: Number(editorTimeGap.value),
    };
    editor.setScenario(nextScenario);
    updateTitleAndEmpty();
  }

  function checkedScenario() {
    const scenario = editor.getScenario();
    const result = validateScenario(scenario);
    if (!result.valid) {
      showEditorMessage(result.errors.join(" • "), true);
      return null;
    }
    validationWarnings = result.warnings || [];
    if (validationWarnings.length) showEditorMessage(`CẢNH BÁO: ${validationWarnings.join(" • ")}`, false, true);
    return scenario;
  }

  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function formatNumber(value, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits) : "–";
  }

  function drawHistory() {
    const width = chart.width;
    const height = chart.height;
    const padding = 24;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    const now = history.at(-1)?.time || 0;

    chartContext.clearRect(0, 0, width, height);
    chartContext.fillStyle = token("--bg-0");
    chartContext.fillRect(0, 0, width, height);
    chartContext.strokeStyle = token("--line");
    chartContext.lineWidth = 1;

    for (let row = 0; row <= 3; row += 1) {
      const y = padding + (plotHeight / 3) * row;
      chartContext.beginPath();
      chartContext.moveTo(padding, y);
      chartContext.lineTo(width - padding, y);
      chartContext.stroke();
    }

    function drawLine(key, maximum, color) {
      chartContext.beginPath();
      chartContext.strokeStyle = color;
      chartContext.lineWidth = 2;
      let started = false;

      for (const point of history) {
        if (!Number.isFinite(point[key])) continue;
        const age = now - point.time;
        const x = padding + ((30 - age) / 30) * plotWidth;
        const value = Math.min(Math.max(point[key], 0), maximum);
        const y = padding + plotHeight - (value / maximum) * plotHeight;
        if (!started) {
          chartContext.moveTo(x, y);
          started = true;
        } else {
          chartContext.lineTo(x, y);
        }
      }

      chartContext.stroke();
    }

    drawLine("speed", 120, token("--accent"));
    drawLine("distance", 150, token("--success"));
    drawLine("ttc", 30, token("--warning"));

    if (history.length === 0) {
      chartContext.fillStyle = token("--text-dim");
      chartContext.font = '500 13px Inter, "Segoe UI", sans-serif';
      chartContext.textAlign = "center";
      chartContext.fillText("Chưa có dữ liệu — mở tab master rồi bấm Play", width / 2, height / 2 + 4);
    }
  }

  function selectScenario(id) {
    const selected = scenarios.find((scenario) => scenario.id === id);
    scenarioDescription.textContent = selected?.description || "";
    send({ type: "scenario:select", data: { id } });
  }

  function showScenarioList(items) {
    const previousValue = scenarioSelect.value;
    scenarios = items;
    scenarioSelect.innerHTML = "";

    for (const scenario of scenarios) {
      const option = document.createElement("option");
      option.value = scenario.id;
      option.textContent = scenario.name;
      scenarioSelect.appendChild(option);
    }

    scenariosLoaded = true;
    scenarioSelect.disabled = scenarios.length === 0;
    const stillExists = scenarios.some((scenario) => scenario.id === previousValue);
    if (stillExists) scenarioSelect.value = previousValue;
    if (scenarios.some((scenario) => scenario.id === hubScenarioId)) scenarioSelect.value = hubScenarioId;
    // Chỉ tự chọn khi hub CHƯA có kịch bản; nối lại thì giữ nguyên lần chạy đang có.
    if (!hubHasScenario && scenarios.length > 0) selectScenario(scenarioSelect.value);
    renderScenarioList();
  }

  function setServerStatus(online) {
    serverLight.className = `status-light ${online ? "is-online" : "is-offline"}`;
    serverStatus.textContent = online ? "Server đã kết nối" : "Mất kết nối server";
  }

  function updateHubStatus(data) {
    webClientCount.textContent = String(data.webClients ?? 0);
    masterLight.className = `status-light ${data.masterConnected ? "is-online" : "is-offline"}`;
    masterStatus.textContent = data.masterConnected ? "Master đã kết nối" : "Chưa có master";
  }

  function updateSensor(data) {
    latestSensor = data;
    timeline.setTime(data.t);
    distanceValue.textContent = formatNumber(data.leadDistance);
    ttcValue.textContent = formatNumber(data.ttc);
  }

  function updateEgo(data) {
    ecuChip.dataset.state = data.state || "";
    ecuChipText.textContent = `ECU · ${data.mode || "ACC"} · ${data.state || "CRUISE"}`;
    egoSpeedValue.textContent = formatNumber(data.speed);
    warningValue.textContent = data.warning || "NONE";
    warningValue.classList.toggle("is-warning", data.warning === "FCW");
    brakingValue.textContent = data.braking ? "Đang phanh" : "Không phanh";
    setSpeedRange.value = String(data.setSpeed);
    setSpeedValue.textContent = String(data.setSpeed);
    accToggle.checked = data.accOn;
    accToggle.nextElementSibling.textContent = data.accOn ? "ACC ON" : "ACC OFF";
    modeToggle.checked = data.mode === "FOLLOW";
    speedSetting.classList.toggle("is-disabled", data.mode === "FOLLOW");
    setSpeedRange.disabled = data.mode === "FOLLOW";
    ecuStateValue.textContent = data.state || "CRUISE";
    ecuStateValue.classList.toggle("is-tracking", data.state === "TRACKING");
    driveModeValue.textContent = data.mode || "ACC";
    for (const input of timeGapInputs) input.checked = Number(input.value) === Number(data.timeGap || 1.8);

    const time = performance.now() / 1000;
    history.push({
      time,
      speed: data.speed,
      distance: latestSensor?.leadDistance,
      ttc: latestSensor?.ttc,
    });
    history = history.filter((point) => time - point.time <= 30);
    drawHistory();
  }

  function sendEcuConfig() {
    setSpeedValue.textContent = setSpeedRange.value;
    accToggle.nextElementSibling.textContent = accToggle.checked ? "ACC ON" : "ACC OFF";
    send({
      type: "ecu:config",
      data: {
        setSpeed: Number(setSpeedRange.value),
        accOn: accToggle.checked,
        mode: modeToggle.checked ? "FOLLOW" : "ACC",
        timeGap: Number(document.querySelector('input[name="time-gap"]:checked')?.value || 1.8),
      },
    });
  }

  function connect() {
    // Cổng do main.js truyền qua preload.cjs (desktopApi.port), khớp với PORT trong .env.
    socket = new WebSocket(`ws://localhost:${window.desktopApi?.port ?? 3000}/?role=desktop`);

    socket.addEventListener("open", () => setServerStatus(true));
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "hub:status") updateHubStatus(message.data);
        if (message.type === "scenario:list") showScenarioList(message.data);
        if (message.type === "scenario:load") {
          hubHasScenario = true;
          hubScenarioId = message.id || null;
          if (hubScenarioId && scenarios.some((scenario) => scenario.id === hubScenarioId)) scenarioSelect.value = hubScenarioId;
          scenarioDescription.textContent = message.data.description || message.data.name;
          renderScenarioList();
          // Có thay đổi chưa lưu trong editor thì hỏi trước khi thay bằng kịch bản của hub.
          const applyLoad = (data) => loadIntoEditor(data, "Đã nạp kịch bản vào editor.", { silent: true });
          if (!isDirty()) applyLoad(message.data);
          else if (pendingHubScenario) pendingHubScenario = message.data; // đang hỏi rồi: chỉ cập nhật bản mới nhất
          else {
            pendingHubScenario = message.data;
            confirmDialog({
              title: "Có thay đổi chưa lưu",
              message: "Editor đang có thay đổi chưa lưu. Thay bằng kịch bản đang chạy trên hub sẽ làm mất bản nháp này.",
              confirmText: "Thay bằng kịch bản của hub",
              cancelText: "Giữ bản nháp",
              danger: true,
            }).then((replace) => {
              const latest = pendingHubScenario;
              pendingHubScenario = null;
              if (replace) return applyLoad(latest);
              const text = "Giữ bản nháp trong editor; kịch bản đang chạy trên hub là: " + latest.name;
              showEditorMessage(text, false, false, { silent: true });
              toast("info", text);
            });
          }
          history = [];
          latestSensor = null;
          drawHistory();
        }
        if (message.type === "sim:control") showSimState(message.action);
        if (message.type === "sensor") updateSensor(message.data);
        if (message.type === "ego") updateEgo(message.data);
        if (message.type === "collision") {
          showEditorMessage(`Kịch bản THẤT BẠI tại t=${message.data.t}s — va chạm với xe ${message.data.vehicleId}.`, true);
        }
        if (message.type === "ecu:config") {
          setSpeedRange.value = String(message.data.setSpeed);
          setSpeedValue.textContent = String(message.data.setSpeed);
          accToggle.checked = message.data.accOn;
          accToggle.nextElementSibling.textContent = message.data.accOn ? "ACC ON" : "ACC OFF";
          modeToggle.checked = message.data.mode === "FOLLOW";
          speedSetting.classList.toggle("is-disabled", message.data.mode === "FOLLOW");
          setSpeedRange.disabled = message.data.mode === "FOLLOW";
          driveModeValue.textContent = message.data.mode || "ACC";
          for (const input of timeGapInputs) input.checked = Number(input.value) === Number(message.data.timeGap || 1.8);
        }
        if (message.type === "error") toast("error", message.data.message);
      } catch (error) {
        console.warn("Bỏ qua message hub không hợp lệ:", error);
      }
    });
    socket.addEventListener("close", () => {
      setServerStatus(false);
      hubHasScenario = false; // lần nối sau sẽ quyết định lại dựa vào message hub gửi
      updateHubStatus({ webClients: 0, masterConnected: false });
      window.setTimeout(connect, RECONNECT_DELAY_MS);
    });
    socket.addEventListener("error", () => socket.close());
  }

  scenarioSelect.addEventListener("change", () => selectScenario(scenarioSelect.value));
  setSpeedRange.addEventListener("input", sendEcuConfig);
  accToggle.addEventListener("change", sendEcuConfig);
  modeToggle.addEventListener("change", sendEcuConfig);
  for (const input of timeGapInputs) input.addEventListener("change", sendEcuConfig);
  for (const button of controlButtons) {
    button.addEventListener("click", () => {
      send({ type: "sim:control", action: button.dataset.action });
      showSimState(button.dataset.action);
      if (button.dataset.action === "reset") timeline.setTime(0);
    });
  }

  for (const input of [editorName, editorDescription, editorEgoLane, editorEgoSpeed, editorEgoMode, editorSetSpeed, editorTimeGap]) {
    input.addEventListener("change", syncMeta);
  }

  document.querySelector("#vehicle-tool").addEventListener("click", () => editor.addVehicle(1, 40));
  document.querySelector("#vehicle-tool").addEventListener("dragstart", (event) => event.dataTransfer.setData("text/vehicle-tool", "vehicle"));
  document.querySelector("#vehicle-update").addEventListener("click", () => {
    editor.updateSelected({
      lane: Number(vehicleLane.value),
      gap: Number(vehicleGap.value),
      speed: Number(vehicleSpeed.value),
    });
  });
  document.querySelector("#vehicle-delete").addEventListener("click", () => editor.removeSelected());

  document.querySelector("#scenario-new").addEventListener("click", () => loadIntoEditor(createEmptyScenario(), "Đã tạo kịch bản mới."));
  document.querySelector("#scenario-open").addEventListener("click", async () => {
    const result = await window.desktopApi?.openScenario();
    if (!result || result.canceled) return;
    if (!result.ok) return showEditorMessage(result.error, true);
    const validation = validateScenario(result.scenario);
    if (!validation.valid) return showEditorMessage(validation.errors.join(" • "), true);
    loadIntoEditor(result.scenario, `Đã mở ${result.filePath}.`);
  });
  document.querySelector("#scenario-save").addEventListener("click", async () => {
    const scenario = checkedScenario();
    if (!scenario) return;
    const result = await window.desktopApi?.saveScenario(scenario);
    if (!result || result.canceled) return;
    const warningText = validationWarnings.length ? ` CẢNH BÁO: ${validationWarnings.join(" • ")}` : "";
    if (result.ok) savedSnapshot = JSON.stringify(scenario);
    showEditorMessage(result.ok ? `Đã lưu ${result.filePath}.${warningText}` : result.error, !result.ok, result.ok && validationWarnings.length > 0);
  });
  document.querySelector("#scenario-send-play").addEventListener("click", () => {
    const scenario = checkedScenario();
    if (!scenario) return;
    const sent = send({ type: "scenario:load", data: scenario });
    if (sent) {
      send({ type: "sim:control", action: "play" });
      showSimState("play");
    }
    const warningText = validationWarnings.length ? ` CẢNH BÁO: ${validationWarnings.join(" • ")}` : "";
    showEditorMessage(sent ? `Đã gửi kịch bản sang web và bắt đầu Play.${warningText}` : "Server chưa kết nối.", !sent, sent && validationWarnings.length > 0);
  });

  connect();
  drawHistory();
  loadIntoEditor(currentScenario, "Sẵn sàng tạo kịch bản.", { silent: true });
  renderScenarioList();

  // ---- Phím tắt: Space (Play/Pause), Delete (xoá xe/sự kiện), Ctrl+S (lưu), Ctrl+O (mở) ----
  document.querySelector("#scenario-canvas").addEventListener("pointerdown", () => { lastSelected = "vehicle"; });
  document.querySelector("#timeline").addEventListener("click", (event) => { if (event.target.closest(".timeline-event")) lastSelected = "event"; });
  const isTyping = (target) => Boolean(target.closest?.("input, textarea, select"));
  document.addEventListener("keydown", (event) => {
    if (isDialogOpen()) return;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === "s") { event.preventDefault(); document.querySelector("#scenario-save").click(); return; }
    if (modifier && key === "o") { event.preventDefault(); document.querySelector("#scenario-open").click(); return; }
    if (isTyping(event.target)) return;
    if (event.code === "Space") {
      event.preventDefault();
      document.querySelector(`[data-action="${simPlaying ? "pause" : "play"}"]`).click();
    }
    if (event.key === "Delete") {
      event.preventDefault();
      const eventFirst = lastSelected === "event" && timeline.hasSelection();
      if (eventFirst || (!editor.getSelected() && timeline.hasSelection())) document.querySelector("#event-delete").click();
      else if (editor.getSelected()) document.querySelector("#vehicle-delete").click();
    }
  });
  // Nút đang có focus không được tự kích hoạt lại khi nhả phím Space (đã xử lý ở keydown).
  document.addEventListener("keyup", (event) => {
    if (event.code === "Space" && !isTyping(event.target) && !isDialogOpen()) event.preventDefault();
  });
}

initUi();
