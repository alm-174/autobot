// Cảnh 3D: tài sản (model CC0, matcap), importmap, server phục vụ three addons và các ràng buộc hiệu năng cho máy không GPU.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "../server/index.js";

const web = new URL("../../web/", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, web), "utf8");

function glbInfo(file) {
  const buffer = fs.readFileSync(new URL(file, web));
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  let triangles = 0;
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
  }
  return { json, triangles };
}

test("model xe CC0: ≤ 5000 tam giác, có texture và giấy phép đi kèm", () => {
  const { json, triangles } = glbInfo("assets/car/sedan.glb");
  assert.ok(triangles > 0 && triangles <= 5000, `${triangles} tam giác`);
  assert.deepEqual(json.nodes.map((node) => node.name).sort(), ["body", "wheel-back-left", "wheel-back-right", "wheel-front-left", "wheel-front-right"]);
  for (const image of json.images) assert.ok(fs.existsSync(new URL(`assets/car/${image.uri}`, web)), `thiếu ${image.uri}`);
  assert.match(fs.readFileSync(new URL("assets/car/License-Kenney-CC0.txt", web), "utf8"), /Creative Commons Zero, CC0/);
});

test("matcap local nhỏ (< 32 KB)", () => {
  assert.ok(fs.statSync(new URL("assets/matcap-soft.png", web)).size < 32 * 1024);
});

test("index.html có importmap cho three và three/addons", () => {
  const html = read("index.html");
  assert.match(html, /<script type="importmap">/);
  assert.match(html, /"three":\s*"\/vendor\/three\/three\.module\.js"/);
  assert.match(html, /"three\/addons\/":\s*"\/vendor\/three-addons\/"/);
});

test("server phục vụ GLTFLoader, model và matcap", async (t) => {
  const { server } = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  for (const path of ["/vendor/three-addons/loaders/GLTFLoader.js", "/assets/car/sedan.glb", "/assets/car/Textures/colormap.png", "/assets/matcap-soft.png"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
  }
});

test("scene3d.js: matcap + ACES + sRGB, không shadowMap / post-processing / Physical", () => {
  const source = read("js/scene3d.js");
  assert.match(source, /MeshMatcapMaterial/);
  assert.match(source, /ACESFilmicToneMapping/);
  assert.match(source, /SRGBColorSpace/);
  assert.match(source, /GLTFLoader/);
  assert.doesNotMatch(source, /shadowMap\.enabled\s*=\s*true/);
  assert.doesNotMatch(source, /EffectComposer|UnrealBloomPass|SSAOPass|RenderPass/);
  assert.doesNotMatch(source, /MeshPhysicalMaterial/);
  assert.doesNotMatch(source, /MeshLambertMaterial/);
});
