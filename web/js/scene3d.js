// Cảnh Three.js tối giản, ưu tiên chạy được bằng software rendering.

import * as THREE from "/vendor/three/three.module.js";
import { CAR_LENGTH, CAR_WIDTH } from "../../shared/protocol.js";

const LANE_WIDTH = 3.6;
const ROAD_LENGTH = 360;
const ACC_BLUE = 0x3ea6ff;

function laneToX(lane) {
  return (lane - 1) * LANE_WIDTH;
}

function createCar(color) {
  const car = new THREE.Group();
  const bodyMaterial = new THREE.MeshBasicMaterial({ color });
  const glassMaterial = new THREE.MeshBasicMaterial({ color: 0x7f91a6 });
  const tireMaterial = new THREE.MeshBasicMaterial({ color: 0x101215 });
  const brakeMaterial = new THREE.MeshBasicMaterial({ color: 0x3b0505 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.55, CAR_LENGTH), bodyMaterial);
  body.position.y = 0.55;
  car.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.55, 1.9), glassMaterial);
  cabin.position.set(0, 1.05, -0.15);
  car.add(cabin);

  const brakeLights = [];
  const rearZ = CAR_LENGTH / 2; // mặt sau thân xe (xe hướng về -Z, camera nhìn từ +Z)
  for (const x of [-0.62, 0.62]) {
    // Đèn nhô ra khỏi mặt sau (trước đây z=2.08 nằm lọt trong thân xe dài 4,5 m nên bị che)
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), brakeMaterial.clone());
    light.position.set(x, 0.62, rearZ + 0.05);
    car.add(light);
    brakeLights.push(light);
    // Dải đèn nằm trên mép sau nắp cốp để vẫn thấy rõ khi camera nhìn từ trên cao xuống
    const topLight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), brakeMaterial.clone());
    topLight.position.set(x, 0.85, rearZ - 0.3);
    car.add(topLight);
    brakeLights.push(topLight);
  }

  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.25, 1.25]) {
      const tire = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.72), tireMaterial);
      tire.position.set(x, 0.35, z);
      car.add(tire);
    }
  }

  car.userData.brakeLights = brakeLights;
  return car;
}

function setBrakeLights(car, braking) {
  for (const light of car.userData.brakeLights || []) {
    light.material.color.setHex(braking ? 0xff2020 : 0x3b0505);
  }
}

function ttcColor(ttc) {
  if (Number.isFinite(ttc) && ttc < 2.5) return 0xff3030;
  if (Number.isFinite(ttc) && ttc < 5) return 0xffc83d;
  return 0x35d07f;
}

export function createScene3d(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b0e);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
  camera.position.set(0, 9, 15);
  camera.lookAt(0, 0, -22);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const fpsMeter = document.createElement("div");
  fpsMeter.id = "fps-meter";
  fpsMeter.textContent = "0 FPS";
  container.appendChild(fpsMeter);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_WIDTH * 3, ROAD_LENGTH),
    new THREE.MeshBasicMaterial({ color: 0x20252b }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -ROAD_LENGTH / 2 + 25);
  scene.add(road);

  const laneLines = [];
  for (let boundary = 0; boundary <= 3; boundary += 1) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.025, ROAD_LENGTH),
      new THREE.MeshBasicMaterial({ color: 0x69717c }),
    );
    line.position.set((boundary - 1.5) * LANE_WIDTH, 0.025, road.position.z);
    scene.add(line);
    laneLines.push(line);
  }

  const egoCar = createCar(0x3e8cff);
  egoCar.position.set(0, 0, 0);
  scene.add(egoCar);

  const distanceStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.035, 1),
    new THREE.MeshBasicMaterial({ color: 0x35d07f }),
  );
  distanceStrip.position.y = 0.055;
  distanceStrip.visible = false;
  scene.add(distanceStrip);

  const vehicleMeshes = new Map();
  let frames = 0;
  let fps = 0;
  let fpsStartedAt = performance.now();

  function resize() {
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 300);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function update(worldState, sensor, egoControl) {
    if (!worldState) return;

    const egoLane = worldState.ego.lane;
    egoCar.position.x = laneToX(egoLane);
    setBrakeLights(egoCar, Boolean(egoControl?.braking));

    laneLines.forEach((line, boundary) => {
      const isEgoBoundary = boundary === egoLane || boundary === egoLane + 1;
      line.material.color.setHex(egoControl?.accOn && isEgoBoundary ? ACC_BLUE : 0x69717c);
    });

    const activeIds = new Set();
    for (const vehicle of worldState.vehicles) {
      activeIds.add(vehicle.id);
      let mesh = vehicleMeshes.get(vehicle.id);
      if (!mesh) {
        mesh = createCar(0xe5a93d);
        vehicleMeshes.set(vehicle.id, mesh);
        scene.add(mesh);
      }

      const relativeDistance = vehicle.position - worldState.ego.position;
      mesh.position.set(laneToX(vehicle.lane), 0, -relativeDistance);
      mesh.visible = relativeDistance > -25 && relativeDistance < 220;
      setBrakeLights(
        mesh,
        Boolean(vehicle.speedControl && vehicle.speedControl.targetSpeed < vehicle.speed),
      );
    }

    for (const [id, mesh] of vehicleMeshes) {
      if (!activeIds.has(id)) mesh.visible = false;
    }

    if (sensor?.leadDetected && Number.isFinite(sensor.leadDistance)) {
      const length = Math.max(sensor.leadDistance, 0.5);
      distanceStrip.visible = true;
      distanceStrip.position.set(laneToX(egoLane), 0.055, -length / 2 - CAR_LENGTH / 2);
      distanceStrip.scale.set(1, 1, length);
      distanceStrip.material.color.setHex(ttcColor(sensor.ttc));
    } else {
      distanceStrip.visible = false;
    }
  }

  function render() {
    renderer.render(scene, camera);
    frames += 1;
    const now = performance.now();
    const elapsed = now - fpsStartedAt;
    if (elapsed >= 1000) {
      fps = (frames * 1000) / elapsed;
      fpsMeter.textContent = `${Math.round(fps)} FPS`;
      fpsMeter.classList.toggle("is-slow", fps < 20);
      frames = 0;
      fpsStartedAt = now;
    }
  }

  function getFps() {
    return fps;
  }

  return { update, render, resize, getFps };
}

