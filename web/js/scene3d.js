// Cảnh Three.js phong cách màn hình Tesla: tối giản, xe low-poly CC0, vẫn chạy được bằng software rendering.
//
// Ràng buộc hiệu năng (máy không GPU): không shadowMap, không post-processing (bloom, SSAO),
// không vật liệu Physical; vật liệu xe dùng MeshMatcapMaterial (không cần ánh sáng động);
// geometry của model được dùng chung cho mọi xe; pixelRatio tự giảm khi FPS thấp.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CAR_LENGTH, CAR_WIDTH } from "../../shared/protocol.js";

const LANE_WIDTH = 3.6;
const ROAD_WIDTH = LANE_WIDTH * 3;
const ROAD_LENGTH = 360;
const ROAD_CENTER_Z = -ROAD_LENGTH / 2 + 25;
const ACC_BLUE = 0x3ea6ff;
const IDLE_LINE = 0x8a95a3;
const HORIZON = 0x16202b; // màu chân trời, cũng là màu sương mù để xa dần hoà vào nền trời

const MODEL_URL = "/assets/car/sedan.glb"; // Kenney Car Kit (CC0), xem README
const MATCAP_URL = "/assets/matcap-soft.png";
// Kích thước model gốc: thân dài 2,55 m, rộng 1,5 m; bánh bán kính 0,3 m cách tâm ±0,66 m theo trục dọc.
const MODEL = { length: 2.55, width: 1.5, wheelX: 0.3, wheelY: 0.3, wheelZ: 0.66, bodyY: 0.15, bodyZ: -0.025 };
const SCALE_XY = CAR_WIDTH / MODEL.width; // rộng đúng CAR_WIDTH
const SCALE_Z = CAR_LENGTH / MODEL.length; // dài đúng CAR_LENGTH (kéo dài thân cho giống sedan thật)
const WHEEL_SCALE = 1.25;
const WHEEL_RADIUS = MODEL.wheelY * WHEEL_SCALE;

const PAINT = { ego: [232, 235, 241], other: [140, 147, 158] }; // xe mình trắng, xe khác xám nhạt
const ADAPT_BELOW_FPS = 22;
const ADAPT_WINDOWS = 3;
const REDUCED_PIXEL_RATIO = 0.75;

function laneToX(lane) {
  return (lane - 1) * LANE_WIDTH;
}

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
// Hệ số làm mượt theo thời gian: không phụ thuộc số khung hình mỗi giây.
const smoothing = (dt, rate) => 1 - Math.exp(-dt * rate);

function ttcColor(ttc) {
  if (Number.isFinite(ttc) && ttc < 2.5) return 0xff3030;
  if (Number.isFinite(ttc) && ttc < 5) return 0xffc83d;
  return 0x35d07f;
}

function canvasTexture(width, height, draw, { color = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const radialGradientTexture = (size) => canvasTexture(size, size, (context) => {
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}, { color: false });

// Palette của Kenney: màu sơn nằm ở một cột texel riêng. Đổi riêng các texel sơn sang màu đích
// (giữ độ sáng gốc để còn khối), kính/bánh/đèn giữ nguyên.
function paintedPalette(source, target) {
  const canvas = document.createElement("canvas");
  canvas.width = source.image.width;
  canvas.height = source.image.height;
  const context = canvas.getContext("2d");
  context.drawImage(source.image, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const reference = (0.299 * 233 + 0.587 * 98 + 0.114 * 71) / 255;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = Math.floor(canvas.width * 0.8); x < Math.ceil(canvas.width * 0.88); x += 1) {
      const index = (y * canvas.width + x) * 4;
      const [r, g, b] = [image.data[index], image.data[index + 1], image.data[index + 2]];
      const max = Math.max(r, g, b);
      const saturation = max ? (max - Math.min(r, g, b)) / max : 0;
      if (saturation < 0.35 || image.data[index + 3] === 0) continue;
      const k = clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255 / reference, 0.6, 1.4);
      for (let c = 0; c < 3; c += 1) image.data[index + c] = clamp(Math.round(target[c] * k), 0, 255);
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = source.flipY; // glTF: flipY = false
  texture.offset.copy(source.offset);
  texture.repeat.copy(source.repeat);
  texture.center.copy(source.center);
  texture.rotation = source.rotation;
  texture.channel = source.channel;
  return texture;
}

const namedMesh = (root, name) => {
  let found = null;
  root.traverse((object) => { if (!found && object.name === name && (object.isMesh || object.children.some((child) => child.isMesh))) found = object; });
  return found?.isMesh ? found : found?.children.find((child) => child.isMesh);
};

export function createScene3d(container) {
  const params = new URLSearchParams(window.location.search);
  const forcedQuality = params.get("quality");
  const quality = forcedQuality === "high" || forcedQuality === "low" ? forcedQuality : "auto";
  let pixelRatio = quality === "low" ? REDUCED_PIXEL_RATIO : 1;
  const showHalos = quality !== "low";

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 70, 280);
  scene.background = new THREE.Color(HORIZON);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
  const cameraTarget = new THREE.Vector3(0, 0, -22);
  const cameraBase = new THREE.Vector3(0, 9, 15);
  camera.position.copy(cameraBase);
  camera.lookAt(cameraTarget);

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const fpsMeter = document.createElement("div");
  fpsMeter.id = "fps-meter";
  fpsMeter.textContent = "0 FPS";
  fpsMeter.dataset.quality = quality;
  container.appendChild(fpsMeter);

  // ---------- Môi trường ----------
  // Trời: tấm nền xa (qua tone mapping như mọi thứ khác nên khớp màu sương mù).
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 140),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(4, 128, (context, width, height) => {
        const gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "#04070b");
        gradient.addColorStop(0.55, "#0c131b");
        gradient.addColorStop(1, "#16202b");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      }),
      fog: false,
      depthWrite: false,
    }),
  );
  sky.position.set(0, 70, -430);
  sky.renderOrder = -1;
  scene.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 700).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0f151b }));
  ground.position.set(0, -0.03, -170);
  scene.add(ground);

  // Nhựa đường: nhiễu mờ + hai vệt bánh xe trong mỗi làn; cuộn theo tốc độ xe mình.
  const asphaltTexture = canvasTexture(256, 256, (context, width, height) => {
    context.fillStyle = "#222a33";
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 5000; i += 1) {
      const light = Math.random() < 0.5;
      context.fillStyle = light ? `rgba(255,255,255,${0.02 + Math.random() * 0.05})` : `rgba(0,0,0,${0.04 + Math.random() * 0.08})`;
      context.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (const x of [0.3, 0.7]) { // vệt bánh xe
      const track = context.createLinearGradient((x - 0.09) * width, 0, (x + 0.09) * width, 0);
      track.addColorStop(0, "rgba(0,0,0,0)");
      track.addColorStop(0.5, "rgba(0,0,0,0.22)");
      track.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = track;
      context.fillRect((x - 0.09) * width, 0, 0.18 * width, height);
    }
  });
  asphaltTexture.wrapS = THREE.RepeatWrapping;
  asphaltTexture.wrapT = THREE.RepeatWrapping;
  asphaltTexture.repeat.set(3, ROAD_LENGTH / LANE_WIDTH);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: asphaltTexture }));
  road.position.set(0, 0, ROAD_CENTER_Z);
  scene.add(road);

  for (const side of [-1, 1]) { // mép đường
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, ROAD_LENGTH), new THREE.MeshBasicMaterial({ color: 0x46505c }));
    curb.position.set(side * (ROAD_WIDTH / 2 + 0.25 + 0.2), 0.03, ROAD_CENTER_Z);
    scene.add(curb);
  }

  // Vạch làn: vạch trong đứt (cuộn theo tốc độ), vạch ngoài liền; mỗi vạch có một dải phát sáng nhẹ (additive).
  const DASH_PERIOD = 9;
  const dashTexture = canvasTexture(8, 64, (context, width, height) => {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height / 3); // vạch 3 m, cách 6 m
  }, { color: false });
  dashTexture.wrapS = THREE.RepeatWrapping;
  dashTexture.wrapT = THREE.RepeatWrapping;
  dashTexture.repeat.set(1, ROAD_LENGTH / DASH_PERIOD);
  const laneLines = [];
  for (let boundary = 0; boundary <= 3; boundary += 1) {
    const dashed = boundary === 1 || boundary === 2;
    const x = (boundary - 1.5) * LANE_WIDTH;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, ROAD_LENGTH).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: IDLE_LINE, map: dashed ? dashTexture : null, transparent: dashed, alphaTest: dashed ? 0.5 : 0, toneMapped: false }),
    );
    line.position.set(x, 0.02, ROAD_CENTER_Z);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, ROAD_LENGTH).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: IDLE_LINE, map: dashed ? dashTexture : null, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    glow.position.set(x, 0.015, ROAD_CENTER_Z);
    scene.add(line, glow);
    laneLines.push({ line, glow });
  }

  const distanceStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.035, 1),
    new THREE.MeshBasicMaterial({ color: 0x35d07f, transparent: true, opacity: 0.7, toneMapped: false }),
  );
  distanceStrip.position.y = 0.055;
  distanceStrip.visible = false;
  scene.add(distanceStrip);

  // ---------- Xe ----------
  const shadowTexture = radialGradientTexture(64);
  const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
  const haloTexture = radialGradientTexture(64);
  const lampGeometry = new THREE.BoxGeometry(0.42, 0.1, 0.06);
  let assets = null; // { bodyGeometry, wheelGeometry: {left,right}, materials: {ego, other} } sau khi nạp xong

  /** Một chiếc xe: root (vị trí, hướng) > tilt (chúi mũi/nghiêng) > model. Geometry và vật liệu dùng chung. */
  function createCar(kind) {
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.scale.set(CAR_WIDTH * 1.9, 1, CAR_LENGTH * 1.3);
    shadow.position.y = 0.012;
    root.add(shadow);

    const tilt = new THREE.Group();
    root.add(tilt);
    const model = new THREE.Group();
    model.rotation.y = Math.PI; // model gốc hướng +Z, xe trong cảnh hướng -Z
    tilt.add(model);

    const material = assets.materials[kind];
    const body = new THREE.Mesh(assets.bodyGeometry, material);
    body.scale.set(SCALE_XY, SCALE_XY, SCALE_Z);
    body.position.set(0, MODEL.bodyY * SCALE_XY, MODEL.bodyZ * SCALE_Z);
    model.add(body);

    const wheels = [];
    for (const side of [-1, 1]) { // -1 = bên phải model, +1 = bên trái
      for (const end of [-1, 1]) {
        const wheel = new THREE.Mesh(side < 0 ? assets.wheelGeometry.right : assets.wheelGeometry.left, material);
        wheel.scale.setScalar(WHEEL_SCALE);
        wheel.position.set(side * MODEL.wheelX * SCALE_XY, WHEEL_RADIUS, end * MODEL.wheelZ * SCALE_Z);
        model.add(wheel);
        wheels.push(wheel);
      }
    }

    // Đèn hậu: phát sáng (không chịu tone mapping) + quầng sáng additive, sáng dần khi phanh.
    const rearZ = CAR_LENGTH / 2 + 0.05;
    const lamps = [];
    const halos = [];
    for (const x of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(lampGeometry, new THREE.MeshBasicMaterial({ color: 0x3a0707, toneMapped: false }));
      lamp.position.set(x, 0.8, rearZ);
      tilt.add(lamp);
      lamps.push(lamp);
      if (showHalos) {
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, color: 0xff2a1f, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
        halo.scale.set(1.5, 1.5, 1);
        halo.position.set(x, 0.8, rearZ + 0.12);
        tilt.add(halo);
        halos.push(halo);
      }
    }

    const dim = new THREE.Color(0x3a0707);
    const bright = new THREE.Color(0xff3b30);
    const state = { pitch: 0, roll: 0, yaw: 0, brake: 0, accel: 0, spin: 0, lastX: null, lastSpeed: null };

    /** brakeOn: đang phanh; accel (m/s²) làm xe chúi/ngửa; speed (m/s) làm bánh quay; x để suy ra hướng và độ nghiêng khi đổi làn. */
    function animate(dt, { x, speed, accel, brakeOn }) {
      const lateral = state.lastX === null || dt <= 0 ? 0 : clamp((x - state.lastX) / dt, -6, 6);
      state.lastX = x;
      const k = smoothing(dt, 8);
      state.accel += (accel - state.accel) * smoothing(dt, 5);
      state.pitch += (clamp(state.accel * 0.011, -0.07, 0.04) - state.pitch) * k; // phanh (accel âm): chúi mũi; tăng tốc: ngửa
      state.roll += (clamp(lateral * 0.012, -0.06, 0.06) - state.roll) * k;
      state.yaw += (clamp(-Math.atan2(lateral, Math.max(speed, 6)), -0.3, 0.3) - state.yaw) * k; // mũi xe hướng theo phía chuyển làn
      root.rotation.y = state.yaw;
      tilt.rotation.x = state.pitch;
      tilt.rotation.z = state.roll;

      state.spin += (speed * dt) / WHEEL_RADIUS;
      for (const wheel of wheels) wheel.rotation.x = state.spin;

      const rate = brakeOn ? 12 : 6; // lên nhanh, tắt chậm hơn
      state.brake += ((brakeOn ? 1 : 0) - state.brake) * smoothing(dt, rate);
      for (const lamp of lamps) lamp.material.color.copy(dim).lerp(bright, state.brake);
      for (const halo of halos) halo.material.opacity = state.brake * 0.85;
    }

    return { root, animate };
  }

  let egoCar = null;
  const otherCars = new Map(); // id -> { car, lastSpeed }

  function setupAssets(gltf, matcap) {
    const body = namedMesh(gltf.scene, "body");
    const wheelLeft = namedMesh(gltf.scene, "wheel-front-left");
    const wheelRight = namedMesh(gltf.scene, "wheel-front-right");
    const palette = body.material.map;
    matcap.colorSpace = THREE.SRGBColorSpace;
    const make = (target) => new THREE.MeshMatcapMaterial({ matcap, map: paintedPalette(palette, target) });
    assets = { bodyGeometry: body.geometry, wheelGeometry: { left: wheelLeft.geometry, right: wheelRight.geometry }, materials: { ego: make(PAINT.ego), other: make(PAINT.other) } };
  }

  // Dự phòng nếu không nạp được model (ví dụ thiếu file): xe hộp đơn giản, vẫn chạy được.
  function setupFallback() {
    const box = new THREE.BoxGeometry(MODEL.width, 0.8, MODEL.length).translate(0, 0.55, 0);
    const wheel = new THREE.CylinderGeometry(MODEL.wheelY, MODEL.wheelY, 0.25, 12).rotateZ(Math.PI / 2);
    const make = (hex) => new THREE.MeshBasicMaterial({ color: hex });
    assets = { bodyGeometry: box, wheelGeometry: { left: wheel, right: wheel }, materials: { ego: make(0xf2f4f7), other: make(0xaab0b8) } };
  }

  const loading = Promise.all([new GLTFLoader().loadAsync(MODEL_URL), new THREE.TextureLoader().loadAsync(MATCAP_URL)])
    .then(([gltf, matcap]) => setupAssets(gltf, matcap))
    .catch((error) => {
      console.error("Không nạp được model xe, dùng xe hộp dự phòng:", error);
      setupFallback();
    });

  // ---------- Khung hình và chất lượng ----------
  let frames = 0;
  let fps = 0;
  let fpsStartedAt = performance.now();
  const recentFps = [];

  function resize() {
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 300);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  let lastUpdate = performance.now();
  let asphaltOffset = 0;
  let dashOffset = 0;
  let smoothedSpeed = 0;
  let cameraX = 0;
  let fov = camera.fov;

  function update(worldState, sensor, egoControl) {
    const now = performance.now();
    const dt = clamp((now - lastUpdate) / 1000, 0, 0.1);
    lastUpdate = now;
    if (!worldState || !assets) return;

    const egoLane = worldState.ego.lane;
    const egoX = laneToX(egoLane);
    const egoSpeed = worldState.ego.speed / 3.6;
    smoothedSpeed += (egoSpeed - smoothedSpeed) * smoothing(dt, 6);

    // Mặt đường và vạch đứt trôi về phía sau theo tốc độ xe mình.
    asphaltOffset = (asphaltOffset + (smoothedSpeed * dt) / LANE_WIDTH) % 1;
    dashOffset = (dashOffset + (smoothedSpeed * dt) / DASH_PERIOD) % 1;
    asphaltTexture.offset.y = asphaltOffset;
    dashTexture.offset.y = dashOffset;

    laneLines.forEach(({ line, glow }, boundary) => {
      const accent = Boolean(egoControl?.accOn) && (boundary === egoLane || boundary === egoLane + 1);
      line.material.color.setHex(accent ? ACC_BLUE : IDLE_LINE);
      glow.material.color.setHex(accent ? ACC_BLUE : IDLE_LINE);
      glow.material.opacity = accent ? 0.3 : 0.07;
    });

    if (!egoCar) {
      egoCar = createCar("ego");
      scene.add(egoCar.root);
    }
    egoCar.root.position.x = egoX;
    egoCar.animate(dt, { x: egoX, speed: egoSpeed, accel: egoControl?.accel ?? 0, brakeOn: Boolean(egoControl?.braking) });

    const activeIds = new Set();
    for (const vehicle of worldState.vehicles) {
      activeIds.add(vehicle.id);
      let entry = otherCars.get(vehicle.id);
      if (!entry) {
        entry = { car: createCar("other"), lastSpeed: vehicle.speed };
        otherCars.set(vehicle.id, entry);
        scene.add(entry.car.root);
      }
      const relativeDistance = vehicle.position - worldState.ego.position;
      const x = laneToX(vehicle.lane);
      entry.car.root.position.set(x, 0, -relativeDistance);
      entry.car.root.visible = relativeDistance > -25 && relativeDistance < 220;
      const accel = dt > 0 ? (vehicle.speed - entry.lastSpeed) / 3.6 / dt : 0;
      entry.lastSpeed = vehicle.speed;
      entry.car.animate(dt, { x, speed: vehicle.speed / 3.6, accel: clamp(accel, -9, 4), brakeOn: Boolean(vehicle.speedControl && vehicle.speedControl.targetSpeed < vehicle.speed) });
    }
    for (const [id, entry] of otherCars) {
      if (!activeIds.has(id)) entry.car.root.visible = false;
    }

    if (sensor?.leadDetected && Number.isFinite(sensor.leadDistance)) {
      const length = Math.max(sensor.leadDistance, 0.5);
      distanceStrip.visible = true;
      distanceStrip.position.set(egoX, 0.055, -length / 2 - CAR_LENGTH / 2);
      distanceStrip.scale.set(1, 1, length);
      distanceStrip.material.color.setHex(ttcColor(sensor.ttc));
    } else {
      distanceStrip.visible = false;
    }

    // Camera theo sau, làm mượt: trượt ngang theo xe mình, lùi ra và mở rộng góc nhìn nhẹ khi nhanh.
    cameraX += (egoX - cameraX) * smoothing(dt, 4);
    const speedFactor = clamp(smoothedSpeed / 33, 0, 1); // 33 m/s ≈ 120 km/h
    camera.position.set(cameraX * 0.85, cameraBase.y + speedFactor * 0.6, cameraBase.z + speedFactor * 1.5);
    cameraTarget.set(cameraX * 0.5, 0, -22);
    camera.lookAt(cameraTarget);
    const targetFov = 52 + speedFactor * 4;
    if (Math.abs(targetFov - fov) > 0.02) {
      fov += (targetFov - fov) * smoothing(dt, 3);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  // Tự thích ứng: FPS trung bình 3 giây gần nhất < 22 thì giảm pixelRatio xuống 0,75 (chỉ khi không ép ?quality=).
  function adaptQuality() {
    recentFps.push(fps);
    if (recentFps.length > ADAPT_WINDOWS) recentFps.shift();
    if (quality !== "auto" || pixelRatio <= REDUCED_PIXEL_RATIO || recentFps.length < ADAPT_WINDOWS) return;
    const average = recentFps.reduce((sum, value) => sum + value, 0) / recentFps.length;
    if (average < ADAPT_BELOW_FPS) {
      pixelRatio = REDUCED_PIXEL_RATIO;
      fpsMeter.dataset.quality = "auto-reduced";
      resize();
    }
  }

  function render() {
    renderer.render(scene, camera);
    frames += 1;
    const now = performance.now();
    const elapsed = now - fpsStartedAt;
    if (elapsed >= 1000) {
      fps = (frames * 1000) / elapsed;
      fpsMeter.textContent = `${Math.round(fps)} FPS${pixelRatio < 1 ? ` · ${pixelRatio}×` : ""}`;
      fpsMeter.classList.toggle("is-slow", fps < 20);
      frames = 0;
      fpsStartedAt = now;
      adaptQuality();
    }
  }

  function getFps() {
    return fps;
  }

  return { update, render, resize, getFps, ready: loading };
}
