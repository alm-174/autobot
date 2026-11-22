// L-4 (trạng thái DECEL) và L-5 (đổi cấu hình giữa lúc chạy không được phanh gấp).
import test from "node:test";
import assert from "node:assert/strict";
import { createSimulatedEcu, decide } from "../server/acc-fallback.js";

const sensor = (egoSpeed, leadDistance, leadSpeed) => ({
  egoSpeed,
  leadDetected: true,
  leadDistance,
  leadSpeed,
  relSpeed: egoSpeed - leadSpeed,
  ttc: egoSpeed > leadSpeed ? leadDistance / ((egoSpeed - leadSpeed) / 3.6) : null,
});

test("L-4: ACC có xe trước và đang giảm tốc êm thì trạng thái là DECEL", () => {
  const result = decide(sensor(60, 40, 45), { speed: 60 }, { mode: "ACC", setSpeed: 80, timeGap: 1.8, deltaSeconds: 0.1 });
  assert.ok(result.accel < -1, `accel ${result.accel}`);
  assert.equal(result.warning, "NONE");
  assert.equal(result.state, "DECEL");
});

test("L-4: ACC đường trống vẫn là CRUISE", () => {
  const result = decide({ egoSpeed: 60, leadDetected: false }, { speed: 60 }, { mode: "ACC", setSpeed: 80, timeGap: 1.8, deltaSeconds: 0.1 });
  assert.equal(result.state, "CRUISE");
});

// Vòng kín đơn giản: xe trước chạy đều 60 km/h, khoảng cách tích phân từ tốc độ ECU trả về.
function closedLoop(ecu, state, seconds) {
  let minAccel = 0;
  for (let step = 0; step < seconds * 10; step += 1) {
    const control = ecu.update(sensor(state.speed, state.gap, 60), 0.1);
    state.speed = control.speed;
    state.gap += ((60 - control.speed) / 3.6) * 0.1;
    minAccel = Math.min(minAccel, control.accel);
  }
  return minAccel;
}

test("L-5: đổi timeGap 1.8 → 2.5 giữa lúc chạy không phanh quá −2.5 m/s²", () => {
  const ecu = createSimulatedEcu({ mode: "ACC", setSpeed: 100, timeGap: 1.8, logger: () => {} });
  ecu.reset({ speed: 60 });
  const state = { speed: 60, gap: 5 + 1.8 * (60 / 3.6) };
  closedLoop(ecu, state, 5);
  assert.ok(Math.abs(state.gap - 35) < 1, `đang ổn định quanh 35 m, thực tế ${state.gap}`);

  ecu.setConfig({ timeGap: 2.5 }, { manual: true });
  const minAccel = closedLoop(ecu, state, 30);
  assert.ok(minAccel >= -2.5, `accel nhỏ nhất ${minAccel}`);
  assert.ok(Math.abs(state.gap - (5 + 2.5 * (60 / 3.6))) < 2, `cuối cùng về ~46,7 m, thực tế ${state.gap}`);
});

test("L-5: chuyển FOLLOW → ACC thủ công thì setSpeed = tốc độ hiện tại", () => {
  const ecu = createSimulatedEcu({ mode: "FOLLOW", setSpeed: 50, logger: () => {} });
  ecu.reset({ speed: 70 });
  ecu.setConfig({ mode: "ACC", setSpeed: 50 }, { manual: true });
  assert.equal(ecu.getConfig().mode, "ACC");
  assert.equal(ecu.getConfig().setSpeed, 70);
});

test("L-5: nạp kịch bản (không phải thao tác tay) vẫn giữ nguyên setSpeed của kịch bản", () => {
  const ecu = createSimulatedEcu({ mode: "FOLLOW", setSpeed: 50, logger: () => {} });
  ecu.reset({ speed: 70 });
  ecu.setConfig({ mode: "ACC", setSpeed: 80 });
  assert.equal(ecu.getConfig().setSpeed, 80);
});
