// Kịch bản mẫu chạy headless 5 lần (nhịp khung hình khác nhau) phải cho cùng một kết luận.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runScenario } from "./scenario-runner.js";

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../scenarios/${name}`, import.meta.url), "utf8"));
const runs = (name) => [1, 2, 3, 4, 5].map((seed) => runScenario(load(name), { seed }));

for (const name of ["cut-in.json", "lead-hard-brake.json", "stop-and-go.json", "lead-leaves-lane.json", "follow-traffic.json", "editor-cut-in-follow.json"]) {
  test(`${name}: không va chạm, khoảng cách nhỏ nhất ≥ 5 m ở cả 5 lần chạy`, () => {
    for (const result of runs(name)) {
      assert.equal(result.collision, null, `va chạm: ${JSON.stringify(result.collision)}`);
      assert.ok(result.minDistance >= 5, `khoảng cách nhỏ nhất ${result.minDistance} m (${result.states.join(" → ")})`);
    }
  });
}

test("cut-in-collision.json: cố ý va chạm ở cả 5 lần chạy, mô tả nói rõ là cố ý", () => {
  const scenario = load("cut-in-collision.json");
  assert.match(scenario.description, /cố ý/i);
  for (const result of runs("cut-in-collision.json")) assert.ok(result.collision, "phải va chạm");
});

test("cut-in-side-blindspot.json: va chạm khi xe chen lúc song song, cảm biến không thấy cut-in", () => {
  const scenario = load("cut-in-side-blindspot.json");
  assert.equal(scenario.description, "xe chen khi đang song song – ngoài tầm cảm biến phía trước, va chạm là giới hạn của ACC");
  for (const result of runs("cut-in-side-blindspot.json")) {
    assert.ok(result.collision, "phải va chạm");
    assert.equal(result.cutInSeen, false, "cảm biến không được thấy cut-in trước khi va chạm");
  }
});
