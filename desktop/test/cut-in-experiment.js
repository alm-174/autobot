// Thí nghiệm cut-in headless: dùng nguyên world, sensor và decide của ứng dụng.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createWorld } from "../../web/js/world.js";
import { readLeadSensor } from "../../web/js/sensor.js";
import { decide } from "../server/acc-fallback.js";
import { CAR_LENGTH } from "../../shared/protocol.js";

const STEP_SECONDS = 0.05;
const RUN_SECONDS = 20;
const CHANGE_LANE_SECONDS = 1;
const BRAKE_DECEL = 4;
const EGO_SPEEDS = [40, 60, 80, 100];
const DELTA_SPEEDS = [10, 20, 30, 40, 60];
const MODES = ["ACC", "FOLLOW"];
const CUT_TYPES = ["CUT_IN", "CUT_IN_BRAKE"];
const START_DISTANCES = Array.from({ length: 121 }, (_, index) => index * 0.5);

function deltaCases(egoSpeed) {
  const regular = DELTA_SPEEDS
    .map((deltaV) => ({ deltaV, label: String(deltaV), valid: deltaV <= egoSpeed }));
  // Giữ STOPPED thành ca riêng để so sánh, kể cả khi trùng số với một Δv chuẩn.
  return [...regular, { deltaV: egoSpeed, label: "STOPPED", valid: true }];
}

function createScenario({ egoSpeed, deltaV, startDistance, cutType }) {
  const leadSpeed = Math.max(egoSpeed - deltaV, 0);
  const closingPerStep = ((egoSpeed - leadSpeed) / 3.6) * STEP_SECONDS;
  const events = [{
    at: 0, vehicle: "B", action: "changeLane", toLane: 1, duration: CHANGE_LANE_SECONDS,
  }];

  if (cutType === "CUT_IN_BRAKE") {
    events.push({
      at: CHANGE_LANE_SECONDS, vehicle: "B", action: "brake", toSpeed: 0, decel: BRAKE_DECEL,
    });
  }

  return {
    name: `experiment-${cutType}-${egoSpeed}-${deltaV}-${startDistance}`,
    ego: { lane: 1, speed: egoSpeed },
    vehicles: [{
      id: "B",
      lane: 2,
      // Bù bước đầu: khi changeLane bắt đầu, clearance đúng giá trị yêu cầu.
      gap: startDistance + CAR_LENGTH + closingPerStep,
      speed: leadSpeed,
    }],
    events,
  };
}

function runCase({ egoSpeed, deltaV, startDistance, cutType, mode }) {
  const world = createWorld();
  world.loadScenario(createScenario({ egoSpeed, deltaV, startDistance, cutType }));
  world.control("play");

  let egoState = { speed: egoSpeed, lostSeconds: 0 };
  let minimumDistance = Infinity;
  let maximumBraking = 0;
  let cutInDetectedAt = null;
  let fullBrakeAt = null;
  let sawCutIn = false;
  let mergedAhead = false;

  for (let elapsed = 0; elapsed < RUN_SECONDS; elapsed += STEP_SECONDS) {
    const state = world.getState();
    const sensor = readLeadSensor(state);
    if (sensor.cutIn?.detected) {
      sawCutIn = true;
      if (cutInDetectedAt === null) cutInDetectedAt = state.time;
    }

    const decision = decide(sensor, egoState, {
      mode,
      accOn: true,
      setSpeed: egoSpeed,
      timeGap: 1.8,
      deltaSeconds: STEP_SECONDS,
    });
    if (fullBrakeAt === null && cutInDetectedAt !== null && decision.accel <= -6) fullBrakeAt = state.time;

    maximumBraking = Math.max(maximumBraking, Math.max(-decision.accel, 0));
    egoState = {
      speed: decision.speed,
      lostSeconds: mode === "FOLLOW" && !sensor.leadDetected && !sensor.cutIn?.detected
        ? egoState.lostSeconds + STEP_SECONDS
        : 0,
    };
    world.setEgo(decision);
    world.update(STEP_SECONDS);

    const nextState = world.getState();
    const cutInVehicle = nextState.vehicles.find((vehicle) => vehicle.id === "B");
    if (!cutInVehicle.laneChange && cutInVehicle.lane === nextState.ego.lane) {
      mergedAhead ||= cutInVehicle.position - nextState.ego.position - CAR_LENGTH > 0;
    }
    const nextSensor = readLeadSensor(nextState);
    const measuredDistance = nextSensor.cutIn?.detected
      ? nextSensor.cutIn.distance
      : nextSensor.leadDistance;
    if (Number.isFinite(measuredDistance)) minimumDistance = Math.min(minimumDistance, measuredDistance);
    if (world.getState().collision) break;
  }

  return {
    collided: Boolean(world.getState().collision),
    sawCutIn,
    mergedAhead,
    minimumDistance: Number.isFinite(minimumDistance) ? minimumDistance : null,
    maximumBraking,
    reactionTime: cutInDetectedAt !== null && fullBrakeAt !== null
      ? Math.max(fullBrakeAt - cutInDetectedAt, 0)
      : null,
  };
}

function findMinimumSafeDistance(parameters) {
  let lastResult = null;
  for (const startDistance of START_DISTANCES) {
    const result = runCase({ ...parameters, startDistance });
    lastResult = result;
    if (result.sawCutIn && result.mergedAhead && !result.collided) return { startDistance, ...result };
  }
  return {
    startDistance: null,
    ...(lastResult || {
      minimumDistance: null, maximumBraking: null, reactionTime: null,
      collided: true, sawCutIn: false, mergedAhead: false,
    }),
  };
}

function theoreticalDistance(deltaV, reactionTime) {
  if (!Number.isFinite(reactionTime)) return null;
  const deltaMps = deltaV / 3.6;
  return deltaMps * reactionTime + (deltaMps ** 2) / (2 * 6);
}

const results = [];
for (const mode of MODES) {
  for (const cutType of CUT_TYPES) {
    for (const egoSpeed of EGO_SPEEDS) {
      for (const deltaCase of deltaCases(egoSpeed)) {
        const result = deltaCase.valid
          ? findMinimumSafeDistance({ egoSpeed, deltaV: deltaCase.deltaV, cutType, mode })
          : { startDistance: null, minimumDistance: null, maximumBraking: null, reactionTime: null };
        const theory = theoreticalDistance(deltaCase.deltaV, result.reactionTime);
        results.push({
          status: !deltaCase.valid ? "INVALID_DELTA_V" : result.startDistance === null ? "NO_SAFE_WITHIN_RANGE" : "OK",
          mode,
          cutType,
          egoSpeed,
          deltaLabel: deltaCase.label,
          deltaV: deltaCase.deltaV,
          leadSpeed: deltaCase.valid ? egoSpeed - deltaCase.deltaV : null,
          minimumSafeStartDistance: result.startDistance,
          minimumAchievedDistance: result.minimumDistance,
          maximumBraking: result.maximumBraking,
          reactionTime: result.reactionTime,
          theoreticalDistance: theory,
          simulationMinusTheory: result.startDistance === null || theory === null
            ? null
            : result.startDistance - theory,
        });
      }
    }
  }
}

function display(value, digits = 2) {
  return value === null ? "N/A" : Number(value).toFixed(digits);
}

console.table(results.map((result) => ({
  Status: result.status,
  Mode: result.mode,
  "Kiểu chen": result.cutType,
  "Ego km/h": result.egoSpeed,
  "Δv km/h": result.deltaLabel,
  "Xe chen km/h": result.leadSpeed,
  "Min an toàn m": display(result.minimumSafeStartDistance, 1),
  "Min đạt được m": display(result.minimumAchievedDistance),
  "Phanh max m/s²": display(result.maximumBraking),
  "Phản ứng s": display(result.reactionTime),
  "Lý thuyết m": display(result.theoreticalDistance),
  "Mô phỏng - LT m": display(result.simulationMinusTheory),
})));

const csvHeader = [
  "status", "mode", "cut_type", "ego_speed_kmh", "delta_v_label", "delta_v_kmh", "cut_in_speed_kmh",
  "minimum_safe_start_distance_m", "minimum_achieved_distance_m", "maximum_braking_accel_mps2",
  "reaction_time_s", "theoretical_distance_m", "simulation_minus_theory_m",
];
const csvLines = [
  csvHeader.join(","),
  ...results.map((result) => [
    result.status, result.mode, result.cutType, result.egoSpeed, result.deltaLabel, result.deltaV,
    result.leadSpeed === null ? "N/A" : result.leadSpeed,
    display(result.minimumSafeStartDistance, 1), display(result.minimumAchievedDistance),
    display(result.maximumBraking), display(result.reactionTime), display(result.theoreticalDistance),
    display(result.simulationMinusTheory),
  ].join(",")),
];

function createHtml(data) {
  const chartGroups = CUT_TYPES.flatMap((cutType) => MODES.map((mode) => ({ cutType, mode })));
  const chartCards = chartGroups.map((group, index) => (
    `<section><h2>${group.cutType} — ${group.mode}</h2><canvas id="chart-${index}"></canvas></section>`
  )).join("\n");
  const safeJson = JSON.stringify(data).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Kết quả thí nghiệm cut-in</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { margin:0; padding:24px; background:#0b1016; color:#eef4fb; font:14px Arial,sans-serif; }
    h1 { margin-bottom:6px; } p { color:#aebdca; }
    main { display:grid; grid-template-columns:repeat(auto-fit,minmax(480px,1fr)); gap:18px; }
    section { padding:18px; border:1px solid #293746; border-radius:12px; background:#121a23; }
    canvas { max-height:420px; } a { color:#55adff; }
  </style>
</head>
<body>
  <h1>Khoảng cách cut-in tối thiểu không va chạm</h1>
  <p>Bước 0,05 s; đổi làn 1 s; “chen rồi phanh” giảm tốc 4 m/s². <a href="cut-in-results.csv">Tải CSV</a>.</p>
  <main>${chartCards}</main>
  <script>
    const rows = ${safeJson};
    const groups = ${JSON.stringify(chartGroups)};
    const speeds = ${JSON.stringify(EGO_SPEEDS)};
    const colors = { 40:"#4dabf7", 60:"#51cf66", 80:"#ffd43b", 100:"#ff6b6b" };
    groups.forEach((group, index) => {
      const selected = rows.filter(row => row.cutType === group.cutType && row.mode === group.mode);
      const deltas = ["10", "20", "30", "40", "60", "STOPPED"];
      const datasets = speeds.map(speed => ({
        label: "Ego " + speed + " km/h",
        data: deltas.map(delta => selected.find(row => row.egoSpeed === speed && row.deltaLabel === delta)?.minimumSafeStartDistance ?? null),
        borderColor: colors[speed], backgroundColor: colors[speed], tension:0.15, spanGaps:false,
      }));
      new Chart(document.getElementById("chart-" + index), {
        type:"line", data:{ labels:deltas.map(delta => delta === "STOPPED" ? "Xe đứng yên" : "Δv " + delta), datasets },
        options:{ responsive:true, plugins:{ legend:{ labels:{ color:"#dce7f2" } } }, scales:{
          x:{ title:{ display:true,text:"Δv (km/h)",color:"#aebdca" },ticks:{ color:"#aebdca" } },
          y:{ title:{ display:true,text:"Khoảng cách tối thiểu (m)",color:"#aebdca" },ticks:{ color:"#aebdca" },beginAtZero:true },
        }},
      });
    });
  </script>
</body>
</html>`;
}

const csvPath = fileURLToPath(new URL("../../docs/cut-in-results.csv", import.meta.url));
const htmlPath = fileURLToPath(new URL("../../docs/cut-in-results.html", import.meta.url));
fs.writeFileSync(csvPath, `${csvLines.join("\n")}\n`, "utf8");
fs.writeFileSync(htmlPath, createHtml(results), "utf8");
console.log(`\nĐã ghi CSV: ${csvPath}`);
console.log(`Đã ghi biểu đồ HTML: ${htmlPath}`);
