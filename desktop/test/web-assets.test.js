// Favicon: trang web khai báo icon và file có thật (tránh 404 /favicon.ico trong console).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const web = new URL("../../web/", import.meta.url);

test("web/index.html khai báo favicon và file tồn tại", () => {
  const html = fs.readFileSync(new URL("index.html", web), "utf8");
  const match = html.match(/<link rel="icon"[^>]*href="\/([^"]+)"/);
  assert.ok(match, "thiếu <link rel=\"icon\">");
  assert.ok(fs.existsSync(new URL(match[1], web)), `thiếu file ${match[1]}`);
});
