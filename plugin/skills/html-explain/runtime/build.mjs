#!/usr/bin/env node
// Check an html-explain spec and build it into one self-contained HTML page.
//   node build.mjs <spec.json> [-o page.html] [--check]
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(here, "explain.css"), "utf8");
const JS = readFileSync(join(here, "explain.js"), "utf8");
const KINDS = ["module", "store", "part", "actor", "external"];
const W = 220, H = 78, SX = 1.36, SY = 1.5;

// The box at `path` under `root`, or null. The page runs this and applyOps too.
export function levelOf(root, path) {
  let n = root;
  for (const id of path) {
    n = (n.children?.nodes || []).find((x) => x.id === id);
    if (!n) return null;
  }
  return n;
}

// The proposed tree: a copy of `root` with the ops applied in order.
export function applyOps(root, ops) {
  const tree = JSON.parse(JSON.stringify(root));
  const errors = [];
  ops.forEach((o, i) => {
    const at = Array.isArray(o.at) ? o.at : [];
    const where = `proposed.ops[${i}] (${o.op} at [${at.join(", ")}])`;
    const n = levelOf(tree, at);
    if (!n) return errors.push(`${where}: no box at that path`);
    const L = (n.children ??= { nodes: [], edges: [] });
    L.edges ??= [];
    const node = (id) => L.nodes.find((x) => x.id === id);
    const edge = () => L.edges.find((e) => e.from === o.from && e.to === o.to);
    if (o.op === "add") {
      if (!o.node?.id || node(o.node.id)) return errors.push(`${where}: node needs a new id`);
      L.nodes.push(o.node);
    } else if (o.op === "remove") {
      if (!node(o.id)) return errors.push(`${where}: no box ${o.id}`);
      L.nodes = L.nodes.filter((x) => x.id !== o.id);
      L.edges = L.edges.filter((e) => e.from !== o.id && e.to !== o.id);
    } else if (o.op === "change") {
      if (!node(o.id)) return errors.push(`${where}: no box ${o.id}`);
      Object.assign(node(o.id), o.set);
    } else if (o.op === "edge") {
      if (!o.edge?.from || !o.edge?.to) return errors.push(`${where}: edge needs from and to`);
      L.edges.push(o.edge);
    } else if (o.op === "unedge") {
      if (!edge()) return errors.push(`${where}: no arrow ${o.from}>${o.to}`);
      L.edges = L.edges.filter((e) => !(e.from === o.from && e.to === o.to));
    } else if (o.op === "reedge") {
      if (!edge()) return errors.push(`${where}: no arrow ${o.from}>${o.to}`);
      Object.assign(edge(), o.set);
    } else {
      errors.push(`${where}: op is add, remove, change, edge, unedge or reedge`);
    }
  });
  return { tree, errors };
}

function checkLevel(level, path, need, keys) {
  const where = path.length ? path.join("/") : "root";
  const nodes = level?.nodes;
  if (!need(Array.isArray(nodes) && nodes.length, `${where}: a level needs nodes`)) return;
  const ids = new Set();
  for (const n of nodes) {
    const p = [...path, n.id].join("/");
    need(typeof n.id === "string" && /^[A-Za-z0-9_-]+$/.test(n.id), `${where}: node id ${n.id}: letters, digits, _ and -`);
    need(!ids.has(n.id), `${where}: node id ${n.id} is repeated`);
    ids.add(n.id);
    need(n.label, `${p}: label is required`);
    need(KINDS.includes(n.kind), `${p}: kind is one of ${KINDS.join(", ")}`);
    need(Number.isFinite(n.x) && Number.isFinite(n.y), `${p}: x and y are numbers`);
    keys.add("node:" + p);
    if (n.children) checkLevel(n.children, [...path, n.id], need, keys);
  }
  for (const e of level.edges || []) need(ids.has(e.from) && ids.has(e.to), `${where}: edge ${e.from}>${e.to}: unknown box`);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const over = Math.abs(a.x - b.x) * SX < W + 10 && Math.abs(a.y - b.y) * SY < H + 10;
      need(!over, `${where}: boxes ${a.id} and ${b.id} overlap (move x or y)`);
    }
  }
}

export function check(spec) {
  const errors = [];
  const need = (ok, msg) => ok || errors.push(msg);
  need(typeof spec.id === "string" && /^[a-z0-9-]+$/.test(spec.id), "id: lowercase letters, digits and dashes");
  need(typeof spec.title === "string" && spec.title, "title is required");
  const keys = new Set(["page"]);
  checkLevel(spec.root, [], need, keys);
  if (spec.proposed && !errors.length) {
    const { tree, errors: opErrors } = applyOps({ children: spec.root }, spec.proposed.ops || []);
    errors.push(...opErrors);
    checkLevel(tree.children, [], (ok, msg) => need(ok, "proposed: " + msg), keys);
  }
  for (const key of Object.keys(spec.threads || {})) need(keys.has(key), `threads: unknown key ${key} (page or node:<path>)`);
  return errors;
}

// The spec at `path` and what is wrong with it; a file that does not parse is one error.
export function load(path) {
  try {
    const spec = JSON.parse(readFileSync(path, "utf8"));
    return { spec, errors: check(spec) };
  } catch (e) {
    return { spec: null, errors: [`${path}: ${e.message}`] };
  }
}

// The page; `live` ({token, version}) is set when serve.mjs serves it.
export function page(spec, live) {
  const json = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${spec.title.replace(/[<&]/g, "")}</title>
<style>
${CSS}</style>
</head>
<body>
<script type="application/json" id="spec">${json(spec)}</script>
${live ? `<script type="application/json" id="live">${json(live)}</script>\n` : ""}<script>
const W = ${W}, H = ${H}, SX = ${SX}, SY = ${SY};
${levelOf}
${applyOps}
${JS}</script>
</body>
</html>
`;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string", short: "o" }, check: { type: "boolean" } },
  });
  const src = positionals[0];
  if (!src) {
    console.error("usage: node build.mjs <spec.json> [-o page.html] [--check]");
    process.exit(2);
  }
  const { spec, errors } = load(src);
  if (errors.length) {
    console.error(errors.map((e) => "error: " + e).join("\n"));
    process.exit(1);
  }
  const count = (L) => L.nodes.reduce((s, n) => s + 1 + (n.children ? count(n.children) : 0), 0);
  if (values.check) {
    console.log(`ok: ${count(spec.root)} boxes, ${(spec.proposed?.ops || []).length} proposed ops`);
  } else {
    const out = values.out || src.replace(/\.json$/, "") + ".html";
    writeFileSync(out, page(spec));
    console.log(`wrote ${out}`);
  }
}
