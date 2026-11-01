import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const runtime = new URL("../plugin/skills/html-explain/runtime/", import.meta.url).pathname;
const example = new URL("../plugin/skills/html-explain/examples/html-explain.json", import.meta.url).pathname;

test("the live server takes notes only from its own page", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "hx-"));
  const spec = join(dir, "demo.json");
  copyFileSync(example, spec);
  const server = spawn(process.execPath, [join(runtime, "serve.mjs"), spec]);
  t.after(() => server.kill());
  const url = await new Promise((ok) => server.stdout.once("data", (d) => ok(String(d).trim())));
  const html = await (await fetch(url)).text();
  const token = JSON.parse(html.match(/id="live">([^<]+)</)[1]).token;
  const note = JSON.stringify({ id: "n1", el: "page", view: "before", text: "hello" });
  const post = (headers) => fetch(url + "api/notes", { method: "POST", body: note, headers });
  assert.equal((await post({})).status, 403);
  assert.equal((await post({ "X-HX-Token": token, Origin: "http://evil.example" })).status, 403);
  assert.equal(existsSync(join(dir, "demo.inbox.jsonl")), false);
  assert.equal((await post({ "X-HX-Token": token })).status, 200);
  const inbox = readFileSync(join(dir, "demo.inbox.jsonl"), "utf8").trim().split("\n");
  assert.equal(inbox.length, 1);
  assert.equal(JSON.parse(inbox[0]).text, "hello");
  const spec0 = await fetch(url + "api/spec?since=0", { headers: { "X-HX-Token": token } });
  const got = await spec0.json();
  assert.equal(got.spec.id, "html-explain");
  assert.equal(got.version, 1);
});
