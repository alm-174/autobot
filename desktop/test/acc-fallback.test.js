import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSimulatedEcu, decide } from "../server/acc-fallback.js";
import { createWorld } from "../../web/js/world.js";
import { readLeadSensor } from "../../web/js/sensor.js";

const settings = { mode: "FOLLOW", timeGap: 1.8, accOn: true, deltaSeconds: 0.1 };

function sensor({ egoSpeed = 40, leadDistance = 25, leadSpeed = 40, ttc = 99, leadDetected = true, cutIn = null } = {}) {
  return {
    egoSpeed,
    leadDetected,
    leadDistance: leadDetected ? leadDistance : null,
    leadSpeed: leadDetected ? leadSpeed : null,
    relSpeed: leadDetected ? egoSpeed - leadSpeed : null,
    ttc: leadDetected ? ttc : null,
    cutIn: cutIn || { detected: false, distance: null, speed: null },
  };
}

test("FOLLOW bám ổn định quanh desiredGap", () => {
  const desiredGap = 40 / 3.6 * 1.8 + 5;
  const result = decide(sensor({ leadDistance: desiredGap }), { speed: 40 }, settings);
  assert.equal(result.state, "TRACKING");
  assert.ok(Math.abs(result.accel) < 0.01);
});

test("CUT_IN phản ứng theo khoảng cách 30 m / 15 m / 6 m", () => {
  const at30 = decide(sensor({ egoSpeed: 60, leadDetected: false, cutIn: { detected: true, distance: 30, speed: 50 } }), { speed: 60 }, settings);
  assert.equal(at30.state, "CUT_IN");
  assert.equal(at30.accel, -2.5);

  for (const distance of [15, 6]) {
    const result = decide(sensor({ egoSpeed: 60, leadDetected: false, cutIn: { detected: true, distance, speed: 20 } }), { speed: 60 }, settings);
    assert.equal(result.state, "BRAKE");
    assert.equal(result.accel, -6);
    assert.equal(result.warning, "FCW");
  }
});

test("sensor đo đầu-đuôi và nhận xe chen ngay khi thân xe chạm làn", () => {
  const reading = readLeadSensor({
    time: 5.5,
    ego: { lane: 1, position: 100, speed: 60 },
    vehicles: [{
      id: "B", lane: 1.75, position: 134.5, speed: 50,
      laneChange: { fromLane: 2, toLane: 1, startTime: 5, duration: 2 },
    }],
  });
  assert.equal(reading.leadId, "B");
  assert.equal(reading.leadDistance, 30);
  assert.deepEqual(reading.cutIn, { detected: true, distance: 30, speed: 50 });
});

function cutInScenario(clearance) {
  return {
    name: `cut-in-${clearance}`,
    ego: { lane: 1, speed: 60 },
    vehicles: [{ id: "B", lane: 2, gap: clearance + 4.5, speed: 20 }],
    events: [{ at: 0.1, vehicle: "B", action: "changeLane", toLane: 1, duration: 0.5 }],
  };
}

function runCutIn(clearance) {
  const world = createWorld();
  world.loadScenario(cutInScenario(clearance));
  world.control("play");
  const ecu = createSimulatedEcu({ mode: "FOLLOW", logger: () => {} });
  ecu.reset({ speed: 60 });
  let sawCutIn = false;
  let sawTracking = false;
  for (let step = 0; step < 120 && !world.getState().collision; step += 1) {
    const reading = readLeadSensor(world.getState());
    const control = ecu.update(reading, 0.1);
    sawCutIn ||= control.state === "CUT_IN";
    sawTracking ||= control.state === "TRACKING";
    world.setEgo(control);
    world.update(0.1);
  }
  return { state: world.getState(), sawCutIn, sawTracking };
}

test("cut-in 30 m không va chạm; cut-in 5 m dừng mô phỏng khi va chạm", () => {
  const safe = runCutIn(30);
  assert.equal(safe.state.collision, null);
  assert.equal(safe.sawCutIn, true);
  assert.equal(safe.sawTracking, true);

  const unsafe = runCutIn(5);
  assert.equal(unsafe.state.playing, false);
  assert.equal(unsafe.state.collision.vehicleId, "B");
});

test("xe trước tăng tốc thì FOLLOW tăng tốc", () => {
  const result = decide(sensor({ leadDistance: 27, leadSpeed: 55 }), { speed: 40 }, settings);
  assert.equal(result.state, "TRACKING");
  assert.ok(result.accel > 0);
  assert.ok(result.accel <= 2);
});

test("xe trước dừng rồi chạy lại thì ego tự khởi hành ngay", () => {
  const stopped = decide(sensor({ egoSpeed: 0, leadDistance: 5.2, leadSpeed: 0 }), { speed: 0 }, settings);
  assert.equal(stopped.state, "STOP");
  assert.equal(stopped.speed, 0);

  const restarted = decide(sensor({ egoSpeed: 0, leadDistance: 5.2, leadSpeed: 10 }), { speed: 0 }, settings);
  assert.equal(restarted.state, "TRACKING");
  assert.ok(restarted.accel > 0);
  assert.ok(restarted.speed > 0);
});

test("mất xe trước giữ tốc độ 3 giây rồi chuyển ACC", () => {
  const missing = sensor({ egoSpeed: 52, leadDetected: false });
  const lost = decide(missing, { speed: 52, lostSeconds: 2.8 }, settings);
  assert.equal(lost.mode, "FOLLOW");
  assert.equal(lost.state, "LOST");
  assert.equal(lost.speed, 52);

  const logs = [];
  const ecu = createSimulatedEcu({ mode: "FOLLOW", logger: (line) => logs.push(line) });
  ecu.reset({ speed: 52 });
  let control;
  for (let index = 0; index < 30; index += 1) control = ecu.update(missing, 0.1);
  assert.equal(control.mode, "ACC");
  assert.equal(control.setSpeed, 52);
  assert.equal(logs.length, 1);
});

test("phanh khẩn cấp ưu tiên ở cả ACC và FOLLOW", () => {
  for (const mode of ["ACC", "FOLLOW"]) {
    const result = decide(sensor({ egoSpeed: 60, leadDistance: 20, leadSpeed: 20, ttc: 2 }), { speed: 60 }, { ...settings, mode });
    assert.equal(result.accel, -6);
    assert.equal(result.warning, "FCW");
    assert.equal(result.state, "BRAKE");
  }
});

test("follow-traffic dừng, tự chạy lại và luôn cách xe trước trên 3 m", () => {
  const scenario = JSON.parse(fs.readFileSync(new URL("../scenarios/follow-traffic.json", import.meta.url)));
  const world = createWorld();
  world.loadScenario(scenario);
  world.control("play");
  const ecu = createSimulatedEcu({ mode: "FOLLOW", timeGap: 1.8, logger: () => {} });
  ecu.reset({ speed: scenario.ego.speed });
  let minimumGap = Infinity;
  let stopped = false;
  let restarted = false;

  for (let step = 0; step < 400; step += 1) {
    const control = ecu.update(readLeadSensor(world.getState()), 0.1);
    world.setEgo(control);
    world.update(0.1);
    const reading = readLeadSensor(world.getState());
    if (reading.leadDetected) minimumGap = Math.min(minimumGap, reading.leadDistance);
    if (control.state === "STOP") stopped = true;
    if (stopped && step > 250 && control.speed > 1) restarted = true;
  }

  assert.ok(stopped, "ego phải dừng theo xe trước");
  assert.ok(restarted, "ego phải tự chạy lại");
  assert.ok(minimumGap >= 3, `khoảng cách nhỏ nhất ${minimumGap} m`);
});

test("lỗi 10: chế độ ACC dùng timeGap đã chọn", () => {
  const input = sensor({ egoSpeed: 60, leadDistance: 40, leadSpeed: 60 });
  const near = decide(input, { speed: 60 }, { ...settings, mode: "ACC", timeGap: 1.2, setSpeed: 80 });
  const far = decide(input, { speed: 60 }, { ...settings, mode: "ACC", timeGap: 2.5, setSpeed: 80 });
  assert.ok(far.accel < near.accel, `timeGap 2.5 phải phanh nhiều hơn 1.2 (${far.accel} vs ${near.accel})`);
});
