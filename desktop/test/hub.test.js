// Test hub bằng socket giả (không mở cổng mạng thật) và timer giả.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHub } from "../server/hub.js";
import { createScenarioStore } from "../server/scenarios.js";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // WebSocket.OPEN
    this.sent = [];
  }
  send(text) { this.sent.push(JSON.parse(text)); }
  say(message) { this.emit("message", Buffer.from(JSON.stringify(message))); }
  close() { this.readyState = 3; this.emit("close"); }
  ofType(type) { return this.sent.filter((message) => message.type === type); }
}

function setup(t, logger = () => {}) {
  mock.timers.enable({ apis: ["setInterval"] });
  const hub = createHub({ webSocketServer: {}, scenarioStore: createScenarioStore(), logger });
  t.after(() => mock.timers.reset());
  const connect = (role) => {
    const socket = new FakeSocket();
    hub.addClient(socket, { url: `/?role=${role}` });
    return socket;
  };
  return { hub, connect };
}

const sensor = (data = {}) => ({
  type: "sensor",
  data: { t: 0, egoSpeed: 60, leadDetected: false, leadId: null, leadDistance: null, leadSpeed: null, relSpeed: null, ttc: null, egoLane: 1, ...data },
});
const closeLead = { leadDetected: true, leadId: "A", leadDistance: 10, leadSpeed: 20, relSpeed: 40, ttc: 0.9 };

// Gửi n gói sensor; tick(100) giữ cho test chạy được cả khi hub còn dùng timer 100 ms.
function feed(master, message, count = 1) {
  for (let i = 0; i < count; i += 1) {
    master.say(message);
    mock.timers.tick(100);
  }
}

test("lỗi 1: chỉ một master; master thứ hai thành viewer và sensor của nó bị bỏ", (t) => {
  const { hub, connect } = setup(t);
  const desktop = connect("desktop");
  const first = connect("master");
  const second = connect("master");

  assert.equal(hub.clients["web-master"].size, 1);
  assert.equal(second.clientRole, "web-viewer");
  second.say(sensor({ t: 99 }));
  assert.equal(desktop.ofType("sensor").length, 0, "sensor từ tab thứ hai không được tới desktop");
  assert.equal(first.clientRole, "web-master");
});

test("lỗi 2: ECU chỉ tính một bước cho mỗi gói sensor, không tự chạy theo timer", (t) => {
  const { connect } = setup(t);
  const desktop = connect("desktop");
  const master = connect("master");
  desktop.say({ type: "sim:control", action: "play" });

  master.say(sensor());
  mock.timers.tick(1000); // 1 giây không có sensor mới
  assert.equal(master.ofType("ego").length, 1, "một sensor -> đúng một message ego");
});

test("lỗi 3: master cuối ngắt thì dừng và đưa ECU về đầu kịch bản", (t) => {
  const { hub, connect } = setup(t);
  const desktop = connect("desktop");
  desktop.say({ type: "scenario:select", data: { id: "cut-in.json" } });
  desktop.say({ type: "sim:control", action: "play" });

  const first = connect("master");
  feed(first, sensor({ egoSpeed: 60, ...closeLead }), 5);
  assert.ok(hub.getEcu().getControl().speed < 60, "ECU đã phanh");

  first.close();
  const second = connect("master");
  assert.equal(hub.getEcu().getControl().speed, 60, "ECU về tốc độ ban đầu của kịch bản");
  assert.equal(second.ofType("sim:control").at(-1)?.action, "pause", "master mới biết hub đang dừng");
});

test("lỗi 3: master vào sau khi đã bấm Play thì nhận lệnh play", (t) => {
  const { connect } = setup(t);
  const desktop = connect("desktop");
  desktop.say({ type: "scenario:select", data: { id: "cut-in.json" } });
  desktop.say({ type: "sim:control", action: "play" });

  const master = connect("master");
  assert.equal(master.ofType("sim:control").at(-1)?.action, "play");
});

test("lỗi 4: Reset khôi phục mode và setSpeed của kịch bản", (t) => {
  const { hub, connect } = setup(t);
  const desktop = connect("desktop");
  desktop.say({ type: "scenario:select", data: { id: "follow-traffic.json" } });
  desktop.say({ type: "sim:control", action: "play" });
  const master = connect("master");

  feed(master, sensor({ egoSpeed: 40 }), 40); // mất xe trước > 3 s
  assert.equal(hub.getEcu().getConfig().mode, "ACC", "ECU đã tự chuyển FOLLOW → ACC");

  desktop.say({ type: "sim:control", action: "reset" });
  const config = hub.getEcu().getConfig();
  assert.equal(config.mode, "FOLLOW");
  assert.equal(config.setSpeed, 80);
});

test("collision từ master dừng hub, chuyển desktop và ghi log thất bại", (t) => {
  const logs = [];
  const { connect } = setup(t, (line) => logs.push(line));
  const desktop = connect("desktop");
  const master = connect("master");
  desktop.say({ type: "sim:control", action: "play" });
  master.say({ type: "collision", data: { t: 5.4, vehicleId: "B", egoSpeed: 48 } });

  assert.deepEqual(desktop.ofType("collision").at(-1)?.data, { t: 5.4, vehicleId: "B", egoSpeed: 48 });
  assert.ok(logs.some((line) => line.includes("Kịch bản THẤT BẠI tại t=5.4s")));
});

// ---- Mục 1: desktop nối lại ----
test("desktop nối lại: nhận kịch bản (kèm id) TRƯỚC danh sách và trạng thái play, hub không reset", (t) => {
  const { hub, connect } = setup(t);
  const first = connect("desktop");
  first.say({ type: "scenario:select", data: { id: "follow-traffic.json" } });
  first.say({ type: "sim:control", action: "play" });
  const master = connect("master");
  feed(master, sensor({ egoSpeed: 40 }), 3);
  const loadsAtMaster = master.ofType("scenario:load").length;

  first.close();
  const second = connect("desktop");
  const types = second.sent.map((message) => message.type);
  assert.ok(types.indexOf("scenario:load") !== -1 && types.indexOf("scenario:load") < types.indexOf("scenario:list"), `thứ tự: ${types.join(", ")}`);
  assert.equal(second.ofType("scenario:load")[0].id, "follow-traffic.json");
  assert.equal(second.ofType("sim:control").at(-1)?.action, "play");
  assert.equal(master.ofType("scenario:load").length, loadsAtMaster, "web master không bị nạp lại kịch bản");
  assert.equal(hub.getCurrentScenario().name, "Bám xe trong giao thông");
});

// ---- Mục 4: log ----
test("log mặc định chỉ có CONNECT/DISCONNECT/ERROR và đổi trạng thái, không có sensor/ego", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const lines = [];
  const hub = createHub({ webSocketServer: {}, scenarioStore: createScenarioStore(), logger: (line) => lines.push(line) });
  const open = (role) => { const socket = new FakeSocket(); hub.addClient(socket, { url: `/?role=${role}` }); return socket; };
  const desktop = open("desktop");
  const master = open("master");
  desktop.say({ type: "sim:control", action: "play" });
  for (let i = 0; i < 20; i += 1) master.say(sensor());
  master.close();
  mock.timers.reset();
  const text = lines.join("\n");
  assert.match(text, /\[CONNECT\]/);
  assert.match(text, /\[DISCONNECT\]/);
  assert.match(text, /sim:control/);
  assert.doesNotMatch(text, /"type":"sensor"/);
  assert.doesNotMatch(text, /"type":"ego"/);
});

test("LOG_VERBOSE (tuỳ chọn verbose) ghi lại tất cả message", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const lines = [];
  const hub = createHub({ webSocketServer: {}, scenarioStore: createScenarioStore(), logger: (line) => lines.push(line), verbose: true });
  const master = new FakeSocket();
  hub.addClient(master, { url: "/?role=master" });
  master.say(sensor());
  mock.timers.reset();
  assert.match(lines.join("\n"), /"type":"sensor"/);
});

// ---- Mục 4: nhãn vai ----
test("web nhận vai thật: master đầu là master, master thứ hai và viewer là viewer", (t) => {
  const { connect } = setup(t);
  const first = connect("master");
  const second = connect("master");
  const viewer = connect("viewer");
  assert.equal(first.ofType("client:role")[0].data.role, "master");
  assert.equal(second.ofType("client:role")[0].data.role, "viewer");
  assert.equal(viewer.ofType("client:role")[0].data.role, "viewer");
});
