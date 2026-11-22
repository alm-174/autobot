import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createScenarioStore } from "../server/scenarios.js";

const sampleDirectory = new URL("../scenarios/", import.meta.url);

test("mọi kịch bản mẫu trong scenarios/ đều hợp lệ", () => {
  const files = fs.readdirSync(sampleDirectory).filter((name) => name.endsWith(".json"));
  const listed = createScenarioStore().listScenarios();
  assert.ok(files.length > 0);
  assert.equal(listed.length, files.length);
});

test("lỗi 5: file JSON hỏng hoặc sai cấu trúc bị bỏ qua, danh sách vẫn có file tốt", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scenarios-"));
  fs.copyFileSync(new URL("cut-in.json", sampleDirectory), path.join(directory, "cut-in.json"));
  fs.writeFileSync(path.join(directory, "broken.json"), "{ bad json");
  fs.writeFileSync(path.join(directory, "invalid.json"), '{"name":"thiếu ego"}');
  const warnings = [];

  const list = createScenarioStore({ directory, logger: (line) => warnings.push(line) }).listScenarios();

  assert.deepEqual(list.map((item) => item.id), ["cut-in.json"]);
  assert.ok(warnings.some((line) => line.includes("broken.json")), "phải ghi tên file hỏng");
  assert.ok(warnings.some((line) => line.includes("invalid.json")));
  fs.rmSync(directory, { recursive: true });
});
