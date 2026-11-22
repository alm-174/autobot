import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyScenario, validateScenario } from "../ui/editor.js";

test("kịch bản mới có schema ego đầy đủ và hợp lệ", () => {
  const scenario = createEmptyScenario();
  assert.deepEqual(scenario.ego, {
    lane: 1,
    speed: 60,
    mode: "ACC",
    setSpeed: 80,
    timeGap: 1.8,
  });
  assert.equal(validateScenario(scenario).valid, true);
});

test("validator báo lỗi tiếng Việt rõ ràng", () => {
  const scenario = createEmptyScenario();
  scenario.ego.lane = 3;
  scenario.ego.speed = -1;
  scenario.ego.mode = "SAI";
  scenario.vehicles.push({ id: "A", lane: 1, gap: 20, speed: 50 });
  scenario.events.push({ at: 8, vehicle: "A", action: "brake", toSpeed: 10, decel: 3 });
  scenario.events.push({ at: 4, vehicle: "B", action: "setSpeed", toSpeed: 50, accel: 2 });
  const result = validateScenario(scenario);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Làn xe mình")));
  assert.ok(result.errors.some((error) => error.includes("Tốc độ xe mình")));
  assert.ok(result.errors.some((error) => error.includes("ACC hoặc FOLLOW")));
  assert.ok(result.errors.some((error) => error.includes("không tồn tại")));
  assert.ok(result.errors.some((error) => error.includes("thời gian tăng dần")));
});

test("lỗi 6: phần tử null hoặc sai kiểu không làm validator ném lỗi", () => {
  for (const patch of [{ vehicles: [null] }, { events: [null] }, { vehicles: {} }, { events: "x" }, { ego: "x" }]) {
    const scenario = { ...createEmptyScenario(), ...patch };
    let result;
    assert.doesNotThrow(() => { result = validateScenario(scenario); }, JSON.stringify(patch));
    assert.equal(result.valid, false, JSON.stringify(patch));
    assert.ok(result.errors.length > 0);
  }
});

test("changeLane quá gần chỉ cảnh báo, không chặn lưu", () => {
  const scenario = createEmptyScenario();
  scenario.vehicles.push({ id: "B", lane: 2, gap: 6, speed: 60 });
  scenario.events.push({ at: 0, vehicle: "B", action: "changeLane", toLane: 1, duration: 1 });
  const result = validateScenario(scenario);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings[0], /Xe B chen ở ~2 m.*cần ≥ 28 m.*sẽ va chạm/);
});
