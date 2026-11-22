// Giao thức dùng chung giữa desktop, web và ESP32.
// Khi thay đổi file này, phải cập nhật docs/api.md.

export const WS_MESSAGE = Object.freeze({
  SCENARIO_LOAD: "scenario:load",
  SCENARIO_LIST: "scenario:list",
  SCENARIO_SELECT: "scenario:select",
  SIM_CONTROL: "sim:control",
  EGO: "ego",
  SENSOR: "sensor",
  HUB_STATUS: "hub:status",
  ECU_CONFIG: "ecu:config",
  COLLISION: "collision",
  ERROR: "error",
  CLIENT_ROLE: "client:role",
});

export const SIM_ACTION = Object.freeze({
  PLAY: "play",
  PAUSE: "pause",
  RESET: "reset",
});

export const MQTT_TOPIC = Object.freeze({
  SENSOR: "sensor",
  CONTROL: "control",
  STATUS: "status",
});

export const ECU_SOURCE = Object.freeze({
  ESP32: "esp32",
  FALLBACK: "fallback",
  SIM: "sim",
});

export const ECU_MODE = Object.freeze({
  ACC: "ACC",
  FOLLOW: "FOLLOW",
});

export const ECU_STATE = Object.freeze({
  CRUISE: "CRUISE",
  DECEL: "DECEL",
  TRACKING: "TRACKING",
  STOP: "STOP",
  LOST: "LOST",
  BRAKE: "BRAKE",
  CUT_IN: "CUT_IN",
  OFF: "OFF",
});

// Kích thước chuẩn dùng chung cho cảm biến và kiểm tra va chạm.
export const CAR_LENGTH = 4.5;
export const CAR_WIDTH = 1.8;

export const TIME_GAP_SECONDS = Object.freeze({
  NEAR: 1.2,
  MEDIUM: 1.8,
  FAR: 2.5,
});

export const SCENARIO_EGO_DEFAULTS = Object.freeze({
  lane: 1,
  speed: 60,
  mode: ECU_MODE.ACC,
  setSpeed: 80,
  timeGap: TIME_GAP_SECONDS.MEDIUM,
});

export const DEFAULTS = Object.freeze({
  PORT: 3000,
  MQTT_URL: "mqtt://broker.hivemq.com:1883",
  MQTT_PREFIX: "autobot_nhom5",
  SENSOR_HZ: 10,
  ESP32_TIMEOUT_MS: 2000,
  SENSOR_RANGE_M: 150,
});

// Ghép tiền tố MQTT với tên topic, ví dụ: autobot_nhom5/sensor.
export function makeMqttTopic(prefix, topic) {
  return `${prefix}/${topic}`;
}

