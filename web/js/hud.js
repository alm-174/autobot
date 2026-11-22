// HUD kiểu màn hình xe: tốc độ, ACC, xe trước, cảnh báo và nguồn ECU.

function format(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "–";
}

export function createHud(container) {
  container.innerHTML = `
    <div class="hud-speed">
      <strong id="hud-speed-value">0</strong>
      <span>km/h</span>
    </div>
    <div class="hud-acc" id="hud-acc">
      <span class="hud-acc-icon" id="hud-mode-icon">ACC</span>
      <strong id="hud-set-speed">80</strong>
      <span class="hud-gap-bars" id="hud-gap-bars"><i></i><i></i><i></i></span>
      <small id="hud-drive-state">CRUISE</small>
    </div>
    <div class="hud-lead">
      <span>XE TRƯỚC</span>
      <strong id="hud-lead-distance">– m</strong>
      <small id="hud-lead-speed">– km/h</small>
    </div>
    <div class="hud-ecu">ECU: <strong id="hud-ecu-value">SIM</strong></div>
    <div class="hud-fcw" id="hud-fcw">⚠ FCW — PHANH NGAY</div>
  `;

  const speed = container.querySelector("#hud-speed-value");
  const acc = container.querySelector("#hud-acc");
  const setSpeed = container.querySelector("#hud-set-speed");
  const modeIcon = container.querySelector("#hud-mode-icon");
  const gapBars = [...container.querySelectorAll("#hud-gap-bars i")];
  const driveState = container.querySelector("#hud-drive-state");
  const leadDistance = container.querySelector("#hud-lead-distance");
  const leadSpeed = container.querySelector("#hud-lead-speed");
  const ecu = container.querySelector("#hud-ecu-value");
  const fcw = container.querySelector("#hud-fcw");

  function update(egoControl, sensor) {
    speed.textContent = format(egoControl?.speed ?? sensor?.egoSpeed);
    setSpeed.textContent = format(egoControl?.setSpeed ?? 80);
    acc.classList.toggle("is-off", egoControl?.accOn === false);
    const followMode = egoControl?.mode === "FOLLOW";
    modeIcon.textContent = followMode ? "BÁM XE" : "ACC";
    acc.classList.toggle("is-follow", followMode);
    acc.classList.toggle("is-tracking", egoControl?.state === "TRACKING");
    acc.classList.toggle("is-decel", egoControl?.state === "DECEL");
    driveState.textContent = egoControl?.state || "CRUISE";
    const barCount = egoControl?.timeGap === 1.2 ? 1 : egoControl?.timeGap === 2.5 ? 3 : 2;
    gapBars.forEach((bar, index) => bar.classList.toggle("is-active", followMode && index < barCount));
    leadDistance.textContent = sensor?.leadDetected
      ? `${format(sensor.leadDistance, 1)} m`
      : "– m";
    leadSpeed.textContent = sensor?.leadDetected
      ? `${format(sensor.leadSpeed)} km/h`
      : "– km/h";
    ecu.textContent = String(egoControl?.ecu || "sim").toUpperCase();
    fcw.classList.toggle("is-visible", egoControl?.warning === "FCW");
  }

  return { update };
}

