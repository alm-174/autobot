// Giao diện desktop: mọi #id mà mã JS tìm bằng querySelector phải tồn tại trong index.html
// (đổi bố cục HTML mà quên một id thì UI hỏng im lặng, nên kiểm tra tĩnh ở đây).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = new URL("../ui/", import.meta.url);
const html = fs.readFileSync(new URL("index.html", ui), "utf8");
const declared = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));

for (const file of ["ui.js", "timeline.js", "feedback.js"]) {
  test(`${file}: mọi #id được dùng đều có trong index.html`, () => {
    const source = fs.readFileSync(new URL(file, ui), "utf8");
    const used = [...source.matchAll(/querySelector(?:All)?\(\s*["'`]#([A-Za-z0-9_-]+)["'`]/g)].map((match) => match[1]);
    assert.ok(used.length > 0);
    assert.deepEqual(used.filter((id) => !declared.has(id)), []);
  });
}

test("index.html: font Inter và icon dùng file local, không có CDN", () => {
  assert.doesNotMatch(html, /(?:href|src)="https?:\/\//); // xmlns của SVG không tính
  assert.match(html, /@fontsource\/inter\/vietnamese-400\.css/);
  const used = [...html.matchAll(/href="#(i-[a-z0-9-]+)"/g)].map((match) => match[1]);
  const symbols = new Set([...html.matchAll(/<symbol id="(i-[a-z0-9-]+)"/g)].map((match) => match[1]));
  assert.deepEqual(used.filter((name) => !symbols.has(name)), []);
});
