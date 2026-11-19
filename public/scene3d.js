// =====================================================================
//  scene3d.js  -  PHẦN 3D (Three.js)
//
//  Quy ước toạ độ (1 đơn vị = 1 mét):
//    - Xe mình ĐỨNG YÊN ở gốc toạ độ (0,0,0), mũi xe hướng về -Z.
//    - Xe trước ở z = -(khoảng cách + chiều dài xe).
//    - Mặt đường trôi về phía +Z (phía sau) theo tốc độ => cảm giác xe đang chạy.
//
//  Tối ưu cho máy KHÔNG có GPU (render bằng CPU/phần mềm):
//    antialias:false | pixelRatio=1 | không đổ bóng | chỉ Basic/Lambert
//    giới hạn 30 FPS | InstancedMesh cho vạch đường | camera.far ~160
// =====================================================================
import * as THREE from "three";

// ---------- Cấu hình ----------
const MAX_FPS = 30;
const RENDER_SCALE = 0.75;       // vẽ ở 75% độ phân giải rồi phóng ra -> nhẹ hơn cho CPU
const LANE_WIDTH = 3.6;          // làn đường rộng 3,6 m
const CAR_LEN = 4.4;             // chiều dài xe (m)
const FAR = 160;
const BG = 0x0d0f12;

const COLOR_LANE_ACC = 0x3ea6ff; // vạch xanh khi ACC bật
const COLOR_LANE_OFF = 0x7d848d;
const COLOR_SAFE = 0x2ee6a0;     // dải xanh
const COLOR_WARN = 0xffc83d;     // TTC < 5 s
const COLOR_DANGER = 0xff3b30;   // TTC < 2,5 s

export function createScene(canvas) {
  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,               // tắt khử răng cưa
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);        // không nhân theo màn hình retina
  renderer.shadowMap.enabled = false; // không đổ bóng

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 40, FAR - 10); // sương mù che phần xa

  // ---------- Camera: phía sau và phía trên xe mình ----------
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, FAR);
  camera.position.set(0, 4.3, 8.5);
  camera.lookAt(0, 1.0, -14);

  // ---------- Ánh sáng (Lambert cần ánh sáng; không có bóng đổ) ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(-5, 10, 6);
  scene.add(sun);

  // ---------- Mặt đường ----------
  // Nền đất tối + mặt đường xám đậm (MeshBasic: không tốn tính toán ánh sáng)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 500).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0b0d10 })
  );
  ground.position.set(0, -0.03, -150);
  scene.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 500).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1b1e23 })
  );
  road.position.set(0, -0.01, -150);
  scene.add(road);

  // 2 vạch kẻ làn (liền) - đổi màu xanh khi ACC bật
  const laneMat = new THREE.MeshBasicMaterial({ color: COLOR_LANE_ACC });
  for (const x of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 500).rotateX(-Math.PI / 2), laneMat);
    line.position.set(x, 0.005, -150);
    scene.add(line);
  }

  // Vạch đứt ở lề: dùng InstancedMesh (1 draw call cho tất cả vạch)
  // Cả nhóm trượt về +Z theo tốc độ rồi "quay vòng" sau mỗi chu kỳ => không cần cập nhật từng vạch.
  const DASH_LEN = 3, DASH_PERIOD = 9, DASH_ROWS = Math.ceil((FAR + 30) / DASH_PERIOD) + 1;
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x9aa0a8 });
  const dashes = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.18, DASH_LEN).rotateX(-Math.PI / 2),
    dashMat,
    DASH_ROWS * 2
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < DASH_ROWS; i++) {
    for (let side = 0; side < 2; side++) {
      m4.setPosition(side ? 4.4 : -4.4, 0.006, 14 - i * DASH_PERIOD);
      dashes.setMatrixAt(i * 2 + side, m4);
    }
  }
  dashes.instanceMatrix.needsUpdate = true;
  dashes.frustumCulled = false;
  const dashGroup = new THREE.Group();
  dashGroup.add(dashes);
  scene.add(dashGroup);

  // ---------- Dải màu giữa 2 xe (xanh / vàng / đỏ theo TTC) ----------
  const stripMat = new THREE.MeshBasicMaterial({ color: COLOR_SAFE, transparent: true, opacity: 0.5, depthWrite: false });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH - 0.5, 1).rotateX(-Math.PI / 2), stripMat);
  strip.position.y = 0.012;
  scene.add(strip);

  // ---------- Dựng xe low-poly ----------
  /** Tạo xe từ khối hộp + bánh hình trụ. Trả về {group, tailMat} */
  function buildCar(bodyColor, cabinColor) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const cabinMat = new THREE.MeshLambertMaterial({ color: cabinColor });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, CAR_LEN), bodyMat);
    body.position.y = 0.72;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), cabinMat);
    cabin.position.set(0, 1.32, 0.25);
    g.add(body, cabin);

    // 4 bánh xe (hình trụ xoay ngang)
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12).rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x15171a });
    for (const x of [-0.92, 0.92]) {
      for (const z of [-1.45, 1.45]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(x, 0.36, z);
        g.add(w);
      }
    }

    // Đèn hậu: 1 vật liệu dùng chung, đổi màu khi phanh
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x5a1010 });
    for (const x of [-0.65, 0.65]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.06), tailMat);
      t.position.set(x, 0.9, CAR_LEN / 2 + 0.02);
      g.add(t);
    }
    return { group: g, tailMat };
  }

  const ego = buildCar(0xf2f4f7, 0x2b2f36);   // xe mình: trắng
  const lead = buildCar(0x8a9099, 0x30343a);  // xe trước: xám
  scene.add(ego.group, lead.group);

  const TAIL_OFF = new THREE.Color(0x5a1010);
  const TAIL_ON = new THREE.Color(0xff2a2a);

  // ---------- Trạng thái hiển thị (được nội suy mượt) ----------
  let target = null;           // gói dữ liệu mới nhất
  let shownDist = 30;          // khoảng cách đang hiển thị (nội suy)
  let leadWasVisible = false;
  let dashOffset = 0;          // quãng đường vạch đã trôi
  let shownSpeed = 0;          // m/s (nội suy)
  let laneIsAcc = true;
  let stripColor = COLOR_SAFE;

  /** Gọi mỗi khi nhận gói dữ liệu mới (10 Hz) - chỉ lưu lại, không vẽ gì */
  function setState(s) {
    target = s;
  }

  /** Cập nhật cảnh theo dt (giây), dùng dữ liệu mới nhất */
  function update(dt) {
    if (!target) return;
    const s = target;

    // Hệ số làm mượt phụ thuộc dt: k = 1 - e^(-dt*rate)
    const k = 1 - Math.exp(-dt * 10);

    // Tốc độ -> vạch đứt trôi về sau
    shownSpeed += (s.speed / 3.6 - shownSpeed) * k;
    dashOffset = (dashOffset + shownSpeed * dt) % DASH_PERIOD;
    dashGroup.position.z = dashOffset;

    // Màu vạch kẻ làn theo trạng thái ACC
    const wantAcc = !!s.acc?.active;
    if (wantAcc !== laneIsAcc) {
      laneIsAcc = wantAcc;
      laneMat.color.setHex(wantAcc ? COLOR_LANE_ACC : COLOR_LANE_OFF);
    }

    // Xe trước
    const detected = !!s.lead?.detected;
    lead.group.visible = detected;
    strip.visible = detected;
    if (detected) {
      const d = Math.max(0, s.lead.distance);
      // Lần đầu thấy xe trước thì "nhảy" tới vị trí luôn, sau đó nội suy mượt
      if (!leadWasVisible) shownDist = d;
      else shownDist += (d - shownDist) * k;

      // d = khoảng cách giữa 2 đầu/đuôi xe => tâm xe trước = d + CAR_LEN
      const leadZ = -(shownDist + CAR_LEN);
      lead.group.position.z = leadZ;
      lead.tailMat.color.copy(s.lead.braking ? TAIL_ON : TAIL_OFF);

      // Dải màu nằm giữa mũi xe mình (z=-CAR_LEN/2) và đuôi xe trước
      const len = Math.max(0.1, shownDist);
      strip.scale.z = len;
      strip.position.z = -(CAR_LEN / 2) - len / 2;

      // Màu theo TTC
      const ttc = s.ttc;
      const c = ttc != null && ttc < 2.5 ? COLOR_DANGER : ttc != null && ttc < 5 ? COLOR_WARN : COLOR_SAFE;
      if (c !== stripColor) {
        stripColor = c;
        stripMat.color.setHex(c);
      }
    }
    leadWasVisible = detected;

    // Đèn phanh xe mình
    const egoBraking = !!s.acc?.braking || s.accel < -1;
    ego.tailMat.color.copy(egoBraking ? TAIL_ON : TAIL_OFF);

    // Xe mình chúi đầu nhẹ khi phanh (hiệu ứng nhìn cho thật)
    ego.group.rotation.x = THREE.MathUtils.clamp(s.accel * 0.004, -0.03, 0.02);
  }

  // ---------- Kích thước canvas ----------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    // false = không đụng vào CSS; canvas được CSS phóng to lại cho vừa khung
    renderer.setSize(Math.round(w * RENDER_SCALE), Math.round(h * RENDER_SCALE), false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---------- Vòng lặp vẽ, giới hạn 30 FPS ----------
  let last = performance.now();
  let frames = 0, fpsT = last;
  let onFps = null;

  function loop(now) {
    requestAnimationFrame(loop);
    const elapsed = now - last;
    if (elapsed < 1000 / MAX_FPS - 1) return; // chưa đủ thời gian -> bỏ qua khung này
    last = now;

    update(Math.min(elapsed / 1000, 0.1));
    renderer.render(scene, camera);

    frames++;
    if (now - fpsT >= 1000) {
      onFps?.(Math.round((frames * 1000) / (now - fpsT)));
      frames = 0;
      fpsT = now;
    }
  }

  return {
    setState,
    start(fpsCallback) {
      onFps = fpsCallback;
      requestAnimationFrame(loop);
    },
  };
}
