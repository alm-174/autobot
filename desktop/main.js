// Điểm vào Electron: khởi động server và mở cửa sổ bộ điều phối.

import "dotenv/config";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let serverInstance = null;

function registerScenarioFileHandlers() {
  ipcMain.handle("scenario:open", async () => {
    const result = await dialog.showOpenDialog({
      title: "Mở kịch bản",
      filters: [{ name: "Kịch bản JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      const filePath = result.filePaths[0];
      const scenario = JSON.parse(await fs.readFile(filePath, "utf8"));
      return { ok: true, filePath, scenario };
    } catch (error) {
      return { ok: false, error: `Không thể mở file: ${error.message}` };
    }
  });

  ipcMain.handle("scenario:save", async (_event, scenario) => {
    const result = await dialog.showSaveDialog({
      title: "Lưu kịch bản",
      defaultPath: "scenario-moi.json",
      filters: [{ name: "Kịch bản JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      await fs.writeFile(result.filePath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
      return { ok: true, filePath: result.filePath };
    } catch (error) {
      return { ok: false, error: `Không thể lưu file: ${error.message}` };
    }
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--server-port=${serverInstance.port}`],
    },
  });

  window.loadFile(path.join(__dirname, "ui", "index.html"));
}

export async function startDesktop() {
  const port = Number(process.env.PORT) || 3000;
  registerScenarioFileHandlers();
  serverInstance = await startServer({ port });
  createWindow();
}

app.whenReady().then(startDesktop).catch((error) => {
  console.error("Không thể khởi động desktop:", error);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  serverInstance?.close();
});

