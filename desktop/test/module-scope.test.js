// L-1: mọi file .js dùng cú pháp ESM phải nằm dưới package.json có "type": "module".
// Electron 33 (Node 20) không tự nhận ra ESM như Node 24, nên thiếu file này thì `npm start` bị crash.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const skip = new Set(["node_modules", ".git", "_old_prototype", "embedded"]);

function listJs(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJs(full));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

function moduleType(file) {
  for (let directory = path.dirname(file); directory.startsWith(root); directory = path.dirname(directory)) {
    const manifest = path.join(directory, "package.json");
    if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, "utf8")).type;
  }
  return undefined;
}

test("L-1: mọi file .js của dự án nằm trong phạm vi package.json type=module", () => {
  const bad = listJs(root).filter((file) => moduleType(file) !== "module").map((file) => path.relative(root, file));
  assert.deepEqual(bad, []);
});
