// ECU giả lập: quyết định ACC/FOLLOW thuần và giữ state giữa các chu kỳ 10 Hz.

const DEFAULT_SET_SPEED = 80;
const DEFAULT_TIME_GAP = 1.8;
const MAX_SPEED = 120;
const MIN_DISTANCE = 5;
const FOLLOW_MIN_ACCEL = -6;
const FOLLOW_MAX_ACCEL = 2;
const ACC_MIN_ACCEL = -7;
const ACC_MAX_ACCEL = 2.5;
const FCW_TTC = 2.5;
const LOST_TIMEOUT = 3;
const DECEL_ACCEL = -1;       // ACC giảm tốc hơn mức này (m/s²) thì state = DECEL
const TIME_GAP_RATE = 0.2;    // đổi timeGap thì khoảng cách mong muốn trượt dần 0,2 s mỗi giây (tránh phanh giật)
const VALID_TIME_GAPS = new Set([1.2, 1.8, 2.5]);

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const sensorData = (input) => input?.type === "sensor" ? input.data : input;
const validMode = (mode) => mode === "FOLLOW" ? "FOLLOW" : "ACC";

function validTimeGap(timeGap) {
  const value = Number(timeGap);
  return VALID_TIME_GAPS.has(value) ? value : DEFAULT_TIME_GAP;
}

// Hàm thuần: không đọc/ghi biến ngoài, dễ test độc lập với WebSocket và Electron.
export function decide(input, egoState = {}, settings = {}) {
  const sensor = sensorData(input);
  if (!sensor) throw new Error("ECU giả lập cần message sensor hợp lệ.");

  const deltaSeconds = Math.max(Number(settings.deltaSeconds) || 0, 0);
  const accOn = settings.accOn !== false;
  // egoState.timeGap là giá trị đã được làm mượt dần (xem createSimulatedEcu); không có thì dùng giá trị cài đặt.
  const timeGap = Number.isFinite(egoState.timeGap) ? egoState.timeGap : validTimeGap(settings.timeGap);
  const setSpeed = clamp(Number(settings.setSpeed) || DEFAULT_SET_SPEED, 0, MAX_SPEED);
  const currentSpeed = Math.max(Number.isFinite(egoState.speed) ? egoState.speed : sensor.egoSpeed || 0, 0);
  const currentSpeedMps = currentSpeed / 3.6;
  const hasCutIn = sensor.cutIn?.detected === true && Number.isFinite(sensor.cutIn.distance);
  const hasRegularLead = sensor.leadDetected === true && Number.isFinite(sensor.leadDistance);
  const leadDistance = hasCutIn ? sensor.cutIn.distance : sensor.leadDistance;
  const leadSpeed = hasCutIn ? Math.max(Number(sensor.cutIn.speed) || 0, 0) : Math.max(Number(sensor.leadSpeed) || 0, 0);
  const hasLead = hasCutIn || hasRegularLead;
  const relativeSpeed = currentSpeed - leadSpeed;
  const effectiveTtc = relativeSpeed > 0 ? leadDistance / (relativeSpeed / 3.6) : null;
  const unsafeTtc = hasLead && Number.isFinite(effectiveTtc) && effectiveTtc < FCW_TTC;
  const unsafeGap = hasLead && leadDistance < currentSpeedMps + 3;
  let mode = validMode(settings.mode);
  let state = accOn ? "CRUISE" : "OFF";
  let accel = 0;
  const warning = unsafeTtc || unsafeGap ? "FCW" : "NONE";

  if (!accOn) return { state, mode, accel: 0, speed: round(currentSpeed), warning };

  // Lớp an toàn có độ ưu tiên cao nhất trong cả hai chế độ.
  if (unsafeTtc || unsafeGap) {
    accel = FOLLOW_MIN_ACCEL;
    state = "BRAKE";
  } else if (hasCutIn) {
    accel = -2.5;
    state = "CUT_IN";
  } else if (mode === "FOLLOW") {
    if (!hasLead) {
      const lostSeconds = Math.max(Number(egoState.lostSeconds) || 0, 0) + deltaSeconds;
      if (lostSeconds >= LOST_TIMEOUT) {
        mode = "ACC";
        state = "CRUISE";
      } else {
        state = "LOST";
      }
    } else {
      const desiredGap = currentSpeedMps * timeGap + MIN_DISTANCE;
      accel = 0.25 * (leadDistance - desiredGap)
        + 0.6 * (leadSpeed / 3.6 - currentSpeedMps);
      accel = clamp(accel, FOLLOW_MIN_ACCEL, FOLLOW_MAX_ACCEL);
      state = leadSpeed <= 0.5 && currentSpeed <= 2 && leadDistance <= 6.5 ? "STOP" : "TRACKING";
    }
  } else {
    const speedError = (setSpeed - currentSpeed) / 3.6;
    accel = clamp(speedError * 0.8, ACC_MIN_ACCEL, ACC_MAX_ACCEL);
    if (hasLead) {
      const desiredGap = MIN_DISTANCE + timeGap * currentSpeedMps;
      const closingSpeedMps = Number.isFinite(sensor.relSpeed) ? sensor.relSpeed / 3.6 : 0;
      accel = Math.min(accel, 0.35 * (leadDistance - desiredGap) - 0.8 * closingSpeedMps);
    }
    accel = clamp(accel, ACC_MIN_ACCEL, ACC_MAX_ACCEL);
    // Đang bám xe trước và giảm tốc êm (chưa tới mức BRAKE): báo DECEL thay vì CRUISE.
    if (hasLead && accel < DECEL_ACCEL) state = "DECEL";
  }

  let speed = clamp(currentSpeed + accel * deltaSeconds * 3.6, 0, mode === "FOLLOW" ? MAX_SPEED : 200);
  // Khi đã bò tới khoảng dừng, khóa ở 0 để không nhích qua mốc 5 m.
  if (mode === "FOLLOW" && hasLead && leadSpeed <= 0.5 && leadDistance <= 6.5 && speed <= 2) {
    speed = 0;
    accel = 0;
    state = "STOP";
  }

  return { state, mode, accel: round(accel), speed: round(speed), warning };
}

// Giữ API cũ cho các nơi gọi trực tiếp, nhưng mọi quyết định đều đi qua decide().
export function calculateFallbackControl(sensorMessage, previousControl = null, settings = {}, deltaSeconds = 0.1) {
  const decision = decide(sensorMessage, previousControl || {}, { ...settings, deltaSeconds });
  return {
    ...decision,
    braking: decision.accel < -1.5,
    accOn: settings.accOn !== false,
    setSpeed: clamp(Number(settings.setSpeed) || DEFAULT_SET_SPEED, 0, MAX_SPEED),
    timeGap: validTimeGap(settings.timeGap),
  };
}

export function createSimulatedEcu({
  setSpeed = DEFAULT_SET_SPEED,
  accOn = true,
  mode = "ACC",
  timeGap = DEFAULT_TIME_GAP,
  logger = console.log,
} = {}) {
  let config = {
    setSpeed: clamp(Number(setSpeed) || DEFAULT_SET_SPEED, 0, MAX_SPEED),
    accOn,
    mode: validMode(mode),
    timeGap: validTimeGap(timeGap),
  };
  let lastControl = null;
  let lostSeconds = 0;
  let rampedTimeGap = config.timeGap; // timeGap đang dùng thật, đuổi theo config.timeGap

  // manual = người dùng đổi trên UI (khác với nạp kịch bản).
  function setConfig(nextConfig = {}, { manual = false } = {}) {
    const previousMode = config.mode;
    config = {
      setSpeed: Number.isFinite(Number(nextConfig.setSpeed)) ? clamp(Number(nextConfig.setSpeed), 0, MAX_SPEED) : config.setSpeed,
      accOn: typeof nextConfig.accOn === "boolean" ? nextConfig.accOn : config.accOn,
      mode: nextConfig.mode ? validMode(nextConfig.mode) : config.mode,
      timeGap: nextConfig.timeGap === undefined ? config.timeGap : validTimeGap(nextConfig.timeGap),
    };
    if (config.mode !== previousMode) lostSeconds = 0;
    // FOLLOW → ACC bằng tay: giữ tốc độ hiện tại làm setSpeed, không kéo xe về setSpeed cũ (tránh phanh/tăng tốc đột ngột).
    if (manual && previousMode === "FOLLOW" && config.mode === "ACC" && lastControl) {
      config.setSpeed = clamp(Math.round(lastControl.speed), 0, MAX_SPEED);
    }
    return getConfig();
  }

  function reset({ speed = 0 } = {}) {
    lostSeconds = 0;
    rampedTimeGap = config.timeGap;
    lastControl = {
      state: config.accOn ? "CRUISE" : "OFF",
      mode: config.mode,
      speed,
      accel: 0,
      braking: false,
      warning: "NONE",
      accOn: config.accOn,
      setSpeed: config.setSpeed,
      timeGap: config.timeGap,
    };
    return { ...lastControl };
  }

  function update(sensorMessage, deltaSeconds = 0.1) {
    const sensor = sensorData(sensorMessage);
    const previousMode = config.mode;
    const maxStep = TIME_GAP_RATE * Math.max(deltaSeconds, 0);
    rampedTimeGap += clamp(config.timeGap - rampedTimeGap, -maxStep, maxStep);
    const decision = decide(sensor, { speed: lastControl?.speed, lostSeconds, timeGap: rampedTimeGap }, { ...config, deltaSeconds });
    if (previousMode === "FOLLOW" && sensor?.leadDetected !== true) lostSeconds += Math.max(deltaSeconds, 0);
    else lostSeconds = 0;

    if (previousMode === "FOLLOW" && decision.mode === "ACC") {
      config = { ...config, mode: "ACC", setSpeed: decision.speed };
      lostSeconds = 0;
      logger(`[ECU] Mất xe trước 3 giây: chuyển FOLLOW → ACC, setSpeed=${decision.speed} km/h.`);
    }

    lastControl = {
      ...decision,
      mode: config.mode,
      braking: decision.accel < -1.5,
      accOn: config.accOn,
      setSpeed: config.setSpeed,
      timeGap: config.timeGap,
    };
    return { ...lastControl };
  }

  const getConfig = () => ({ ...config });
  const getControl = () => lastControl ? { ...lastControl } : null;
  return { setConfig, reset, update, getConfig, getControl };
}
