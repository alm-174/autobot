// Chạy một kịch bản headless bằng đúng world, sensor và ECU của ứng dụng (không cần Electron/Chrome).
// Mô phỏng thực tế: world cập nhật theo khung hình không đều (30–60 ms), sensor→ECU→ego 10 Hz.
import { createWorld } from "../../web/js/world.js";
import { readLeadSensor } from "../../web/js/sensor.js";
import { createSimulatedEcu } from "../server/acc-fallback.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runScenario(scenario, { seed = 1, seconds = 35 } = {}) {
  const random = mulberry32(seed);
  const world = createWorld();
  world.loadScenario(scenario);
  world.control("play");
  const ecu = createSimulatedEcu({ logger: () => {} });
  ecu.setConfig({ accOn: true, mode: scenario.ego.mode, setSpeed: scenario.ego.setSpeed, timeGap: scenario.ego.timeGap });
  ecu.reset({ speed: scenario.ego.speed });

  const states = [];
  let minDistance = Infinity;
  let collision = null;
  let cutInSeen = false;
  let sinceSensor = 0.1; // gửi sensor ngay ở khung đầu tiên
  let time = 0;

  while (time < seconds && !collision) {
    const delta = 0.03 + random() * 0.03;
    world.update(delta);
    time += delta;
    sinceSensor += delta;
    if (sinceSensor >= 0.1) {
      sinceSensor -= 0.1;
      const sensor = readLeadSensor(world.getState());
      const control = ecu.update(sensor, 0.1);
      world.setEgo(control);
      const key = `${control.state}/${control.mode}`;
      if (states.at(-1)?.key !== key) states.push({ key, t: sensor.t });
      if (sensor.leadDetected) minDistance = Math.min(minDistance, sensor.leadDistance);
      if (sensor.cutIn?.detected) {
        cutInSeen = true;
        minDistance = Math.min(minDistance, sensor.cutIn.distance);
      }
    }
    collision = world.getState().collision;
  }

  return { states: states.map((item) => `${item.key}@${item.t}`), minDistance, collision, cutInSeen, t: time };
}
