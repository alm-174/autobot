// Chỉ expose hai thao tác file cần thiết cho scenario editor.

const { contextBridge, ipcRenderer } = require("electron");

// main.js truyền cổng server qua additionalArguments: --server-port=XXXX
const portArgument = process.argv.find((argument) => argument.startsWith("--server-port="));
const port = Number(portArgument?.split("=")[1]) || 3000;

contextBridge.exposeInMainWorld("desktopApi", {
  port,
  openScenario: () => ipcRenderer.invoke("scenario:open"),
  saveScenario: (scenario) => ipcRenderer.invoke("scenario:save", scenario),
});
