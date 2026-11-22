// Đọc, kiểm tra, lưu và liệt kê các file kịch bản JSON.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenario } from "../ui/editor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDirectory = path.resolve(__dirname, "..", "scenarios");

function assertValidScenario(scenario, fileName) {
  const result = validateScenario(scenario);
  if (!result.valid) throw new Error(`${fileName}: ${result.errors.join(" ")}`);
  return scenario;
}

export function createScenarioStore({ directory = defaultDirectory, logger = console.warn } = {}) {
  function loadScenario(id) {
    if (path.basename(id) !== id || !id.endsWith(".json")) {
      throw new Error("Tên file kịch bản không hợp lệ.");
    }

    const filePath = path.join(directory, id);
    const content = fs.readFileSync(filePath, "utf8");
    return assertValidScenario(JSON.parse(content), id);
  }

  // File hỏng/sai cấu trúc chỉ bị bỏ qua (và ghi log), không làm mất cả danh sách.
  function listScenarios() {
    const items = [];
    for (const id of fs.readdirSync(directory).filter((fileName) => fileName.endsWith(".json")).sort()) {
      try {
        const scenario = loadScenario(id);
        items.push({ id, name: scenario.name, description: scenario.description || "" });
      } catch (error) {
        logger(`Bỏ qua kịch bản ${id}: ${error.message}`);
      }
    }
    return items;
  }

  return { listScenarios, loadScenario };
}

