// Điểm vào web: mô phỏng, Three.js, HUD, bản đồ và canvas debug.

import { createSocketClient } from "./socket.js";
import { createWorld } from "./world.js";
import { readLeadSensor } from "./sensor.js";
import { createScene3d } from "./scene3d.js";
import { createHud } from "./hud.js";
import { createMap } from "./map.js";

const FRAME_INTERVAL_MS = 1000 / 30;

function drawCar(context, x, y, color, label) {
  context.fillStyle = color;
  context.fillRect(x - 14, y - 24, 28, 48);
  context.strokeStyle = "#ffffff";
  context.strokeRect(x - 14, y - 24, 28, 48);
  context.fillStyle = "#ffffff";
  context.font = "bold 13px Arial";
  context.textAlign = "center";
  context.fillText(label, x, y + 5);
}

function createDebugRenderer(canvas) {
  const context = canvas.getContext("2d");

  return function render(worldState, sensor) {
    const width = canvas.width;
    const height = canvas.height;
    const laneWidth = 120;
    const roadLeft = (width - laneWidth * 3) / 2;
    const egoY = height * 0.78;
    const pixelsPerMeter = 3;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#181c21";
    context.fillRect(roadLeft, 0, laneWidth * 3, height);

    for (let lane = 0; lane <= 3; lane += 1) {
      context.beginPath();
      context.setLineDash(lane === 0 || lane === 3 ? [] : [18, 16]);
      context.strokeStyle = lane === worldState?.ego.lane || lane - 1 === worldState?.ego.lane
        ? "#3ea6ff"
        : "#69717c";
      const x = roadLeft + lane * laneWidth;
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.setLineDash([]);

    if (!worldState) return;
    const laneX = (lane) => roadLeft + (lane + 0.5) * laneWidth;
    drawCar(context, laneX(worldState.ego.lane), egoY, "#3285ff", "EGO");

    for (const vehicle of worldState.vehicles) {
      const relativePosition = vehicle.position - worldState.ego.position;
      const y = egoY - relativePosition * pixelsPerMeter;
      if (y < -40 || y > height + 40) continue;
      drawCar(
        context,
        laneX(vehicle.lane),
        y,
        sensor?.leadId === vehicle.id ? "#ff5f57" : "#f5b942",
        vehicle.id,
      );
    }
  };
}

function showValue(id, value, suffix = "") {
  document.querySelector(id).textContent = value === null || value === undefined
    ? "–"
    : `${value}${suffix}`;
}

function updateDebugTable(sensor) {
  if (!sensor) return;
  showValue("#sensor-time", sensor.t, " s");
  showValue("#lead-id", sensor.leadId);
  showValue("#lead-distance", sensor.leadDistance, " m");
  showValue("#lead-speed", sensor.leadSpeed, " km/h");
  showValue("#relative-speed", sensor.relSpeed, " km/h");
  showValue("#ttc", sensor.ttc, " s");
  showValue("#ego-speed", sensor.egoSpeed, " km/h");
  showValue("#ego-lane", sensor.egoLane);
}

export function startApp() {
  const parameters = new URLSearchParams(window.location.search);
  const role = parameters.get("role") === "master" ? "master" : "viewer";
  const debugEnabled = parameters.get("debug") === "1";
  const debugPanel = document.querySelector("#debug-panel");
  debugPanel.hidden = !debugEnabled;

  const world = createWorld();
  const scene3d = createScene3d(document.querySelector("#scene-container"));
  const hud = createHud(document.querySelector("#hud-container"));
  const mapView = createMap(document.querySelector("#map-container"));
  const debugRender = createDebugRenderer(document.querySelector("#world-canvas"));
  const scenarioName = document.querySelector("#scenario-name");
  const simulationStatus = document.querySelector("#simulation-status");
  const collisionBanner = document.querySelector("#collision-banner");
  let latestSensor = null;
  let latestEgo = {
    speed: 0,
    accel: 0,
    braking: false,
    warning: "NONE",
    accOn: true,
    setSpeed: 80,
    mode: "ACC",
    timeGap: 1.8,
    state: "CRUISE",
    ecu: "sim",
  };
  let previousTime = performance.now();
  let previousFrame = 0;
  let sentCollision = null;

  function showCollision(data) {
    collisionBanner.hidden = false;
    collisionBanner.textContent = "VA CHẠM";
    simulationStatus.textContent = `VA CHẠM với ${data.vehicleId} tại t=${data.t}s`;
  }

  const socket = createSocketClient({
    onMessage(message) {
      if (message.type === "scenario:load") {
        world.loadScenario(message.data);
        sentCollision = null;
        collisionBanner.hidden = true;
        latestEgo = { ...latestEgo, speed: message.data.ego.speed };
        scenarioName.textContent = message.data.name;
        simulationStatus.textContent = `Đã nạp — ${role}`;
        hud.update(latestEgo, latestSensor);
      }

      if (message.type === "sim:control") {
        world.control(message.action);
        if (message.action === "reset") {
          sentCollision = null;
          collisionBanner.hidden = true;
        }
        simulationStatus.textContent = `${message.action.toUpperCase()} — ${role}`;
      }

      if (message.type === "ego") {
        latestEgo = message.data;
        world.setEgo(message.data);
        hud.update(latestEgo, latestSensor);
      }


      if (message.type === "collision") showCollision(message.data);
    },
  });

  window.setInterval(() => {
    const worldState = world.getState();
    latestSensor = readLeadSensor(worldState);
    if (debugEnabled) updateDebugTable(latestSensor);
    hud.update(latestEgo, latestSensor);

    if (role === "master" && latestSensor) {
      socket.send({ type: "sensor", data: latestSensor });
    }
  }, 100);

  window.setInterval(() => {
    mapView.update(world.getState()?.ego.position || 0);
  }, 500);

  function animationLoop(now) {
    const deltaSeconds = (now - previousTime) / 1000;
    previousTime = now;
    if (role === "master") {
      const worldState = world.update(deltaSeconds);
      if (worldState?.collision && sentCollision !== worldState.collision) {
        sentCollision = worldState.collision;
        showCollision(sentCollision);
        socket.send({ type: "collision", data: sentCollision });
      }
    }

    if (now - previousFrame >= FRAME_INTERVAL_MS) {
      const worldState = world.getState();
      scene3d.update(worldState, latestSensor, latestEgo);
      scene3d.render();
      if (debugEnabled) debugRender(worldState, latestSensor);
      previousFrame = now;
    }

    window.requestAnimationFrame(animationLoop);
  }

  window.requestAnimationFrame(animationLoop);
  return { socket, world, scene3d, hud, mapView };
}

startApp();
