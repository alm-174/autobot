// Điều phối message giữa web master, web viewer và UI desktop.

import { WebSocket } from "ws";
import { createSimulatedEcu } from "./acc-fallback.js";
import { validateScenario } from "../ui/editor.js";

const ROLE = Object.freeze({
  MASTER: "web-master",
  VIEWER: "web-viewer",
  DESKTOP: "desktop-ui",
});

function getRole(request) {
  const url = new URL(request.url || "/", "http://localhost");
  const role = url.searchParams.get("role");

  if (role === "master") return ROLE.MASTER;
  if (role === "desktop") return ROLE.DESKTOP;
  return ROLE.VIEWER;
}

// Message đổi trạng thái đáng ghi log ngay cả khi không bật LOG_VERBOSE (sensor/ego 10 Hz thì không).
const LOGGED_TYPES = new Set(["scenario:select", "scenario:load", "sim:control", "ecu:config", "collision"]);

export function createHub({ webSocketServer, scenarioStore, logger = console.log, verbose = process.env.LOG_VERBOSE === "1" }) {
  const clients = {
    [ROLE.MASTER]: new Set(),
    [ROLE.VIEWER]: new Set(),
    [ROLE.DESKTOP]: new Set(),
  };
  let currentScenario = null;
  let currentScenarioId = null; // tên file nếu nạp từ thư mục scenarios, null nếu gửi từ editor
  let latestSensorMessage = null;
  let simulationPlaying = false;
  const ecu = createSimulatedEcu();

  function log(direction, role, message) {
    const time = new Date().toISOString();
    logger(`[${time}] [${direction}] [${role}] ${message}`);
  }

  function send(socket, role, data) {
    if (socket.readyState !== WebSocket.OPEN) return;
    const message = JSON.stringify(data);
    socket.send(message);
    if (verbose) log("OUT", role, message);
  }

  function getStatus() {
    const masterCount = clients[ROLE.MASTER].size;
    const viewerCount = clients[ROLE.VIEWER].size;

    return {
      type: "hub:status",
      data: {
        webClients: masterCount + viewerCount,
        masterConnected: masterCount > 0,
      },
    };
  }

  function publishStatus() {
    const status = getStatus();
    for (const socket of clients[ROLE.DESKTOP]) {
      send(socket, ROLE.DESKTOP, status);
    }
  }

  function sendToWeb(message) {
    for (const role of [ROLE.MASTER, ROLE.VIEWER]) {
      for (const socket of clients[role]) {
        send(socket, role, message);
      }
    }
  }

  function sendToDesktop(message) {
    for (const socket of clients[ROLE.DESKTOP]) {
      send(socket, ROLE.DESKTOP, message);
    }
  }

  function sendEcuConfig(socket = null) {
    const message = { type: "ecu:config", data: ecu.getConfig() };
    if (socket) send(socket, ROLE.DESKTOP, message);
    else sendToDesktop(message);
  }

  function applyScenarioEcuSettings(scenario) {
    ecu.setConfig({
      accOn: true,
      mode: scenario.ego.mode,
      setSpeed: scenario.ego.setSpeed,
      timeGap: scenario.ego.timeGap,
    });
  }

  // Đưa mô phỏng về đầu kịch bản: dừng, quên sensor cũ, trả ECU về cấu hình + tốc độ của kịch bản.
  function resetSimulation() {
    simulationPlaying = false;
    latestSensorMessage = null;
    if (currentScenario) applyScenarioEcuSettings(currentScenario);
    ecu.reset({ speed: currentScenario?.ego?.speed || 0 });
    sendEcuConfig();
  }

  // Chỉ gọi khi có gói sensor MỚI từ master: mỗi sensor = đúng một bước tính của ECU.
  function publishEgo() {
    if (!latestSensorMessage || clients[ROLE.MASTER].size === 0) return;

    const control = ecu.update(latestSensorMessage, simulationPlaying ? 0.1 : 0);
    const message = {
      type: "ego",
      data: { ...control, ecu: "sim" },
    };
    sendToWeb(message);
    sendToDesktop(message);
  }

  function sendScenarioList(socket) {
    try {
      send(socket, ROLE.DESKTOP, {
        type: "scenario:list",
        data: scenarioStore.listScenarios(),
      });
    } catch (error) {
      send(socket, ROLE.DESKTOP, {
        type: "error",
        data: { message: `Không thể đọc kịch bản: ${error.message}` },
      });
    }
  }

  // Message nạp kịch bản hiện tại; kèm id (tên file) để UI desktop chọn đúng mục trong danh sách.
  function scenarioMessage() {
    return { type: "scenario:load", data: currentScenario, ...(currentScenarioId ? { id: currentScenarioId } : {}) };
  }

  function selectScenario(socket, id) {
    try {
      currentScenario = scenarioStore.loadScenario(id);
      currentScenarioId = id;
      resetSimulation();
      const message = scenarioMessage();
      send(socket, ROLE.DESKTOP, message);
      sendToWeb(message);
    } catch (error) {
      send(socket, ROLE.DESKTOP, {
        type: "error",
        data: { message: `Không thể nạp kịch bản: ${error.message}` },
      });
    }
  }

  function forward(sourceRole, message) {
    const targets = new Set();

    if (sourceRole === ROLE.DESKTOP) {
      clients[ROLE.MASTER].forEach((socket) => targets.add(socket));
      clients[ROLE.VIEWER].forEach((socket) => targets.add(socket));
    } else {
      clients[ROLE.DESKTOP].forEach((socket) => targets.add(socket));
      if (sourceRole === ROLE.MASTER) {
        clients[ROLE.VIEWER].forEach((socket) => targets.add(socket));
      }
    }

    for (const socket of targets) {
      const targetRole = socket.clientRole || "unknown";
      send(socket, targetRole, message);
    }
  }

  function addClient(socket, request) {
    let role = getRole(request);
    // Chỉ một master: tab master thứ hai bị hạ thành viewer (hai thế giới sẽ làm ECU nhận sensor lẫn lộn).
    if (role === ROLE.MASTER && clients[ROLE.MASTER].size > 0) role = ROLE.VIEWER;
    socket.clientRole = role;
    clients[role].add(socket);
    log("CONNECT", role, request.url || "/");
    publishStatus();

    if (role === ROLE.DESKTOP) {
      // Kịch bản và trạng thái play/pause đi TRƯỚC danh sách: UI nối lại biết hub đã có kịch bản nên không tự chọn lại.
      if (currentScenario) {
        send(socket, role, scenarioMessage());
        send(socket, role, { type: "sim:control", action: simulationPlaying ? "play" : "pause" });
      }
      sendScenarioList(socket);
      sendEcuConfig(socket);
      const currentControl = ecu.getControl();
      if (currentControl) {
        send(socket, role, { type: "ego", data: { ...currentControl, ecu: "sim" } });
      }
    } else {
      // Cho tab web biết vai thật (master thứ hai bị hạ thành viewer).
      send(socket, role, { type: "client:role", data: { role: role === ROLE.MASTER ? "master" : "viewer" } });
    }
    if (role !== ROLE.DESKTOP && currentScenario) {
      send(socket, role, scenarioMessage());
      // Báo trạng thái play/pause hiện tại để tab mới không lệch với ECU.
      send(socket, role, { type: "sim:control", action: simulationPlaying ? "play" : "pause" });
    }

    socket.on("message", (rawMessage) => {
      const text = rawMessage.toString();
      if (verbose) log("IN", role, text);

      try {
        const message = JSON.parse(text);
        if (!verbose && LOGGED_TYPES.has(message.type)) {
          log("IN", role, [message.type, message.action, message.data?.id, message.data?.name].filter(Boolean).join(" "));
        }

        if (role === ROLE.DESKTOP && message.type === "scenario:select") {
          selectScenario(socket, message.data?.id);
          return;
        }

        if (role === ROLE.DESKTOP && message.type === "ecu:config") {
          ecu.setConfig(message.data, { manual: true });
          sendEcuConfig();
          return;
        }

        if (role === ROLE.DESKTOP && message.type === "scenario:load") {
          const validation = validateScenario(message.data);
          if (!validation.valid) {
            send(socket, role, {
              type: "error",
              data: { message: `Kịch bản không hợp lệ: ${validation.errors.join(" ")}` },
            });
            return;
          }
          currentScenario = message.data;
          currentScenarioId = null;
          resetSimulation();
        }

        if (role === ROLE.DESKTOP && message.type === "sim:control") {
          if (message.action === "play") simulationPlaying = true;
          if (message.action === "pause") simulationPlaying = false;
          if (message.action === "reset") resetSimulation();
        }

        if (message.type === "sensor") {
          if (role !== ROLE.MASTER || !message.data || typeof message.data !== "object") return;
          latestSensorMessage = message;
          publishEgo();
        }

        if (message.type === "collision") {
          if (role !== ROLE.MASTER || !message.data || typeof message.data !== "object") return;
          simulationPlaying = false;
          logger(`Kịch bản THẤT BẠI tại t=${message.data.t}s: va chạm với ${message.data.vehicleId}, egoSpeed=${message.data.egoSpeed} km/h.`);
        }

        forward(role, message);
      } catch {
        send(socket, role, {
          type: "error",
          data: { message: "Message phải là JSON hợp lệ." },
        });
      }
    });

    socket.on("close", () => {
      clients[role].delete(socket);
      // Master cuối ngắt: dừng và về đầu kịch bản để master mới vào không bị lệch với ECU.
      if (role === ROLE.MASTER && clients[ROLE.MASTER].size === 0) resetSimulation();
      log("DISCONNECT", role, request.url || "/");
      publishStatus();
    });

    socket.on("error", (error) => {
      log("ERROR", role, error.message);
    });
  }

  return {
    addClient,
    getStatus,
    getCurrentScenario: () => currentScenario,
    getEcu: () => ecu,
    clients,
    webSocketServer,
  };
}

