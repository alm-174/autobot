// Timeline sự kiện: mỗi xe một hàng, khối sự kiện màu theo loại (có icon) và kéo được để đổi thời điểm.

import { icon } from "./feedback.js";

const ACTION_ICON = { changeLane: "arrow-left-right", brake: "octagon-x", setSpeed: "gauge" };

function eventLabel(event) {
  if (event.action === "changeLane") return `${event.vehicle} → làn ${event.toLane}`;
  if (event.action === "brake") return `${event.vehicle} phanh ${event.toSpeed}`;
  return `${event.vehicle} → ${event.toSpeed} km/h`;
}

export function createTimeline(container, { getScenario, onChange = () => {} }) {
  let selectedIndex = null;
  let currentTime = 0;
  let currentDuration = 30;
  const vehicleInput = document.querySelector("#event-vehicle");
  const actionInput = document.querySelector("#event-action");
  const atInput = document.querySelector("#event-at");
  const valueInput = document.querySelector("#event-value");
  const rateInput = document.querySelector("#event-rate");
  const valueLabel = document.querySelector("#event-value-label");
  const rateLabel = document.querySelector("#event-rate-label");

  function refreshVehicles() {
    const previous = vehicleInput.value;
    vehicleInput.innerHTML = "";
    for (const vehicle of getScenario().vehicles) {
      const option = document.createElement("option");
      option.value = vehicle.id;
      option.textContent = vehicle.id;
      vehicleInput.appendChild(option);
    }
    if ([...vehicleInput.options].some((option) => option.value === previous)) vehicleInput.value = previous;
  }

  function refreshLabels() {
    const isLane = actionInput.value === "changeLane";
    valueLabel.textContent = isLane ? "Làn đích" : "Tốc độ đích";
    rateLabel.textContent = isLane ? "Duration (s)" : actionInput.value === "brake" ? "Decel (m/s²)" : "Accel (m/s²)";
    valueInput.max = isLane ? "2" : "240";
    valueInput.step = isLane ? "1" : "1";
  }

  function fillForm(event) {
    vehicleInput.value = event.vehicle;
    actionInput.value = event.action;
    atInput.value = String(event.at);
    valueInput.value = String(event.action === "changeLane" ? event.toLane : event.toSpeed);
    rateInput.value = String(event.action === "changeLane" ? event.duration : event.action === "brake" ? event.decel : event.accel);
    refreshLabels();
  }

  function eventFromForm() {
    const action = actionInput.value;
    const event = { at: Number(atInput.value), vehicle: vehicleInput.value, action };
    if (action === "changeLane") {
      event.toLane = Number(valueInput.value);
      event.duration = Number(rateInput.value);
    } else {
      event.toSpeed = Number(valueInput.value);
      event[action === "brake" ? "decel" : "accel"] = Number(rateInput.value);
    }
    return event;
  }

  function render() {
    const scenario = getScenario();
    const duration = Math.max(30, ...scenario.events.map((event) => event.at + 5));
    currentDuration = duration;
    container.innerHTML = "";

    // Trạng thái rỗng: chưa có xe thì chưa có hàng nào để đặt sự kiện.
    if (scenario.vehicles.length === 0) {
      container.innerHTML = `<div class="empty-state">${icon("car", "icon icon-lg")}<strong>Chưa có xe nào</strong><span>Thêm xe vào canvas trước, rồi đặt sự kiện đổi làn, phanh hoặc đổi tốc độ cho từng xe.</span></div>`;
      return;
    }

    const board = document.createElement("div");
    board.className = "timeline-board";

    const axisRow = document.createElement("div");
    axisRow.className = "timeline-row";
    axisRow.appendChild(document.createElement("span"));
    const axis = document.createElement("div");
    axis.className = "timeline-axis";
    for (let second = 0; second <= duration; second += 5) {
      const mark = document.createElement("span");
      mark.style.left = `${second / duration * 100}%`;
      mark.textContent = `${second}s`;
      axis.appendChild(mark);
    }
    axisRow.appendChild(axis);
    board.appendChild(axisRow);

    // Kéo thả khối sự kiện: chỉ đổi thời điểm, giữ nguyên xe (mỗi hàng tự tính theo bề rộng của nó).
    function attachDrop(track) {
      track.addEventListener("dragover", (event) => event.preventDefault());
      track.addEventListener("drop", (event) => {
        event.preventDefault();
        const index = Number(event.dataTransfer.getData("text/event-index"));
        if (!Number.isInteger(index) || !scenario.events[index]) return;
        const bounds = track.getBoundingClientRect();
        scenario.events[index].at = Math.max(0, Math.round(((event.clientX - bounds.left) / bounds.width) * duration * 10) / 10);
        scenario.events.sort((a, b) => a.at - b.at);
        selectedIndex = null;
        onChange(scenario);
        render();
      });
    }

    for (const vehicle of scenario.vehicles) {
      const row = document.createElement("div");
      row.className = "timeline-row";
      const label = document.createElement("span");
      label.className = "timeline-label";
      label.textContent = vehicle.id;
      const track = document.createElement("div");
      track.className = "timeline-track";
      track.dataset.vehicle = vehicle.id;

      scenario.events.forEach((event, index) => {
        if (event.vehicle !== vehicle.id) return;
        const block = document.createElement("button");
        block.type = "button";
        block.className = `timeline-event action-${event.action}${index === selectedIndex ? " is-selected" : ""}`;
        block.style.left = `${event.at / duration * 100}%`;
        block.innerHTML = `${icon(ACTION_ICON[event.action] || "gauge")}<span></span>`;
        block.querySelector("span").textContent = eventLabel(event);
        block.title = `${event.at}s — ${event.action}`;
        block.draggable = true;
        block.addEventListener("click", () => {
          selectedIndex = index;
          fillForm(event);
          render();
        });
        block.addEventListener("dragstart", (dragEvent) => dragEvent.dataTransfer.setData("text/event-index", String(index)));
        track.appendChild(block);
      });
      attachDrop(track);
      row.append(label, track);
      board.appendChild(row);
    }

    if (scenario.events.length === 0) {
      const hint = document.createElement("p");
      hint.className = "timeline-hint";
      hint.textContent = "Chưa có sự kiện nào: chọn xe và hành động ở trên rồi bấm Thêm.";
      board.appendChild(hint);
    }

    // Vạch thời gian mô phỏng (đỏ) phủ lên toàn bộ các hàng.
    const layer = document.createElement("div");
    layer.className = "timeline-playhead-layer";
    const playhead = document.createElement("div");
    playhead.className = "timeline-playhead";
    playhead.style.left = `${Math.min(currentTime / duration, 1) * 100}%`;
    playhead.title = `Thời gian mô phỏng: ${currentTime.toFixed(1)} s`;
    layer.appendChild(playhead);
    board.appendChild(layer);
    container.appendChild(board);
  }

  document.querySelector("#event-add").addEventListener("click", () => {
    const scenario = getScenario();
    if (!vehicleInput.value) return;
    scenario.events.push(eventFromForm());
    scenario.events.sort((a, b) => a.at - b.at);
    selectedIndex = null;
    onChange(scenario);
    render();
  });
  document.querySelector("#event-update").addEventListener("click", () => {
    const scenario = getScenario();
    if (selectedIndex === null || !scenario.events[selectedIndex]) return;
    scenario.events[selectedIndex] = eventFromForm();
    scenario.events.sort((a, b) => a.at - b.at);
    selectedIndex = null;
    onChange(scenario);
    render();
  });
  document.querySelector("#event-delete").addEventListener("click", () => {
    const scenario = getScenario();
    if (selectedIndex === null) return;
    scenario.events.splice(selectedIndex, 1);
    selectedIndex = null;
    onChange(scenario);
    render();
  });
  actionInput.addEventListener("change", refreshLabels);
  refreshLabels();
  refreshVehicles();
  render();

  return {
    refresh() {
      refreshVehicles();
      render();
    },
    setTime(time) {
      currentTime = Math.max(Number(time) || 0, 0);
      const playhead = container.querySelector(".timeline-playhead");
      if (!playhead) return;
      playhead.style.left = `${Math.min(currentTime / currentDuration, 1) * 100}%`;
      playhead.title = `Thời gian mô phỏng: ${currentTime.toFixed(1)} s`;
    },
    hasSelection: () => selectedIndex !== null,
  };
}
