import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { check, page } from "../plugin/skills/html-explain/runtime/build.mjs";

const example = JSON.parse(
  readFileSync(new URL("../plugin/skills/html-explain/examples/html-explain.json", import.meta.url)),
);

test("the example spec is valid and builds one self-contained page", () => {
  assert.deepEqual(check(example), []);
  const html = page(example);
  assert.match(html, /<script type="application\/json" id="spec">/);
  assert.doesNotMatch(html, /id="live"/); // a built file is the offline page
  assert.ok(!html.includes("</script>\"")); // the spec cannot close its own script tag
});

test("broken references are named", () => {
  const bad = structuredClone(example);
  bad.nodes.push({ id: "x", title: "X", desc: "x", zone: "nowhere" });
  bad.edges.push({ from: "x", to: "ghost" });
  bad.zones[2].columns[1].nodes.push("explore");
  bad.threads["node:ghost"] = [];
  bad.threads["edge:build>page"] = []; // arrows take no notes
  const errors = check(bad).join("\n");
  assert.match(errors, /node x: unknown zone nowhere/);
  assert.match(errors, /edge x>ghost: unknown node/);
  assert.match(errors, /node explore is in two columns/);
  assert.match(errors, /threads: unknown key node:ghost/);
  assert.match(errors, /threads: unknown key edge:build>page/);
});
