// Khởi tạo Express, WebSocket và phục vụ thư mục web/.

import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createHub } from "./hub.js";
import { createScenarioStore } from "./scenarios.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const webDirectory = path.join(projectRoot, "web");
const sharedDirectory = path.join(projectRoot, "shared");
const nodeModulesDirectory = path.resolve(__dirname, "..", "node_modules");

export function createServer() {
  const expressApp = express();
  const server = http.createServer(expressApp);
  const webSocketServer = new WebSocketServer({ server });
  const scenarioStore = createScenarioStore();
  const hub = createHub({ webSocketServer, scenarioStore });

  expressApp.use("/shared", express.static(sharedDirectory));
  expressApp.use("/vendor/three", express.static(path.join(nodeModulesDirectory, "three", "build")));
  expressApp.use("/vendor/leaflet", express.static(path.join(nodeModulesDirectory, "leaflet", "dist")));
  expressApp.use(express.static(webDirectory));

  webSocketServer.on("connection", (socket, request) => {
    hub.addClient(socket, request);
  });

  return { expressApp, server, webSocketServer, hub, scenarioStore };
}

export async function startServer({ port = 3000 } = {}) {
  const instance = createServer();

  await new Promise((resolve, reject) => {
    instance.server.once("error", reject);
    instance.server.listen(port, () => {
      instance.server.off("error", reject);
      resolve();
    });
  });

  console.log(`Server đang chạy tại http://localhost:${port}`);

  return {
    ...instance,
    port,
    close() {
      instance.webSocketServer.close();
      instance.server.close();
    },
  };
}

