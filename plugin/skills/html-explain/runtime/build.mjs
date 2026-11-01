#!/usr/bin/env node
// Check an html-explain spec and build it into one self-contained HTML page.
//   node build.mjs <spec.json> [-o page.html] [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(here, "explain.css"), "utf8");
const JS = readFileSync(join(here, "explain.js"), "utf8");

export function check(spec) {
  const errors = [];
  const need = (ok, msg) => ok || errors.push(msg);
  need(typeof spec.id === "string" && /^[a-z0-9-]+$/.test(spec.id), "id: lowercase letters, digits and dashes");
  need(typeof spec.title === "string" && spec.title, "title is required");
  const zones = new Map((spec.zones || []).map((z) => [z.id, z]));
  need(zones.size === (spec.zones || []).length, "zone ids must be unique");
  const after = spec.after || {};
  const ids = new Set();
  for (const n of [...(spec.nodes || []), ...(after.add || [])]) {
    need(n.id && !ids.has(n.id), `node id missing or repeated: ${n.id}`);
    ids.add(n.id);
    need(zones.has(n.zone), `node ${n.id}: unknown zone ${n.zone}`);
    need(n.title && n.desc, `node ${n.id}: title and desc are required`);
  }
  const placed = new Set();
  for (const z of zones.values()) {
    for (const c of z.columns || []) {
      for (const id of c.nodes || []) {
        need(ids.has(id), `zone ${z.id}: column lists unknown node ${id}`);
        need(!placed.has(id), `zone ${z.id}: node ${id} is in two columns`);
        placed.add(id);
      }
    }
    need(!z.span || (z.span >= 1 && z.span <= 12), `zone ${z.id}: span is 1 to 12`);
  }
  const always = (spec.edges || []).filter((e) => e.always).length;
  need(always <= 6, `${always} arrows are \`always\`: keep it to the main flow, 6 at most`);
  const edges = new Set();
  for (const e of [...(spec.edges || []), ...(after.edges?.add || [])]) {
    need(ids.has(e.from) && ids.has(e.to), `edge ${e.from}>${e.to}: unknown node`);
    edges.add(`${e.from}>${e.to}`);
  }
  for (const [id, p] of Object.entries(after.nodes || {})) {
    need(ids.has(id), `after.nodes: unknown node ${id}`);
    need(["changed", "removed", "same", undefined].includes(p.status), `after.nodes.${id}: status is changed, removed or same`);
  }
  for (const id of after.edges?.remove || []) need(edges.has(id), `after.edges.remove: unknown edge ${id}`);
  for (const x of after.notes || []) for (const id of x.ids || []) need(ids.has(id), `after.notes: unknown node ${id}`);
  for (const key of Object.keys(spec.threads || {})) {
    const ok = key === "page" || (key.startsWith("node:") && ids.has(key.slice(5))) || (key.startsWith("edge:") && edges.has(key.slice(5)));
    need(ok, `threads: unknown key ${key} (page, node:<id> or edge:<from>><to>)`);
  }
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
<title>${spec.title.replace(/[<`]/g, "")}</title>
<style>
${CSS}</style>
</head>
<body>
<script type="application/json" id="spec">${json(spec)}</script>
${live ? `<script type="application/json" id="live">${json(live)}</script>\n` : ""}<script>
${JS}</script>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
  if (values.check) {
    console.log(`ok: ${spec.nodes.length} boxes, ${(spec.edges || []).length} arrows`);
  } else {
    const out = values.out || src.replace(/\.json$/, "") + ".html";
    writeFileSync(out, page(spec));
    console.log(`wrote ${out}`);
  }
}
