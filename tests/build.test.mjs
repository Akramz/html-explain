import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyOps, check, page } from "../plugin/skills/html-explain/runtime/build.mjs";

const example = JSON.parse(
  readFileSync(new URL("../plugin/skills/html-explain/examples/html-explain.json", import.meta.url)),
);

test("the example spec is valid and builds one self-contained page", () => {
  assert.deepEqual(check(example), []);
  const html = page(example);
  assert.match(html, /<script type="application\/json" id="spec">/);
  assert.match(html, /function applyOps\(root, ops\)/);
  assert.doesNotMatch(html, /id="live"/);
  assert.ok(!html.includes("</script>\""));
});

test("the ops make the proposed tree and leave the current one alone", () => {
  const { tree, errors } = applyOps({ children: example.root }, example.proposed.ops);
  assert.deepEqual(errors, []);
  const page = (t) => t.children.nodes.find((n) => n.id === "page").children;
  assert.ok(page(tree).nodes.some((n) => n.id === "search"));
  assert.ok(!page(tree).nodes.some((n) => n.id === "hover"));
  assert.ok(!page(tree).edges.some((e) => e.from === "hover"));
  assert.ok(page({ children: example.root }).nodes.some((n) => n.id === "hover"));
});

test("broken references are named by their path", () => {
  const bad = structuredClone(example);
  const pageLevel = bad.root.nodes.find((n) => n.id === "page").children;
  pageLevel.edges.push({ from: "outline", to: "ghost" });
  pageLevel.nodes.push({ id: "twin", label: "Twin", kind: "module", x: 110, y: 125 });
  bad.root.nodes.push({ id: "odd", label: "Odd", kind: "thing", x: 2000, y: 2000 });
  bad.threads["node:page/ghost"] = [];
  const errors = check(bad).join("\n");
  assert.match(errors, /page: edge outline>ghost: unknown box/);
  assert.match(errors, /page: boxes outline and twin overlap/);
  assert.match(errors, /odd: kind is one of/);
  assert.match(errors, /threads: unknown key node:page\/ghost/);

  const ops = structuredClone(example);
  ops.proposed.ops.push({ op: "remove", at: ["page", "nowhere"], id: "x" }, { op: "unedge", at: ["page"], from: "a", to: "b" });
  const opErrors = check(ops).join("\n");
  assert.match(opErrors, /proposed.ops\[4\] \(remove at \[page, nowhere\]\): no box at that path/);
  assert.match(opErrors, /proposed.ops\[5\] \(unedge at \[page\]\): no arrow a>b/);
});
