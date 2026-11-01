#!/usr/bin/env node
// Live mode: serve a spec's page and pass notes between the reader and the agent.
//   node serve.mjs <spec.json> [--port N]   serve the page; each note lands in <name>.inbox.jsonl
//   node serve.mjs <spec.json> --watch      print one line per new note, for the agent's monitor
// The page long-polls for a new spec version and redraws itself in place. Only the page
// this server sent can talk to it: the API needs that page's random token, this server's Host and,
// from a browser, this server's Origin.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, watchFile, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { json } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { load, page } from "./build.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { port: { type: "string", default: "0" }, watch: { type: "boolean" } },
});
const specPath = positionals[0];
if (!specPath) {
  console.error("usage: node serve.mjs <spec.json> [--port N] [--watch]");
  process.exit(2);
}
const base = specPath.replace(/\.json$/, "");
const inbox = `${base}.inbox.jsonl`;

if (values.watch) {
  // one stdout line per note, never repeated: the cursor file survives a re-armed monitor
  const cursor = `${base}.inbox.cursor`;
  let seen = existsSync(cursor) ? Number(readFileSync(cursor, "utf8")) || 0 : 0;
  const flush = () => {
    const all = existsSync(inbox) ? readFileSync(inbox, "utf8").split("\n").filter(Boolean) : [];
    for (const raw of all.slice(seen)) {
      const n = JSON.parse(raw);
      console.log(`note ${n.id} on ${n.el} (seen in ${n.view}): ${n.text.replace(/\s*\n\s*/g, " / ")}`);
    }
    if (all.length > seen) writeFileSync(cursor, String((seen = all.length)));
  };
  flush();
  watchFile(inbox, { interval: 500 }, flush);
} else {
  let { spec, errors } = load(specPath);
  if (errors.length) {
    console.error(errors.map((e) => "error: " + e).join("\n"));
    process.exit(1);
  }
  // each valid save of the spec is a new version; a save that fails the check is skipped and
  // reported, and the page keeps the last valid one
  let version = 1;
  const waiting = new Set();
  watchFile(specPath, { interval: 300 }, () => {
    const next = load(specPath);
    if (next.errors.length) return console.error(next.errors.map((e) => "error: " + e).join("\n"));
    spec = next.spec;
    version += 1;
    for (const res of waiting) reply(res);
    waiting.clear();
  });
  const send = (res, code, type, body) => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };
  const reply = (res) => send(res, 200, "application/json", JSON.stringify({ version, spec }));

  const token = randomBytes(24).toString("hex");
  let self = "";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.headers.host !== self) return send(res, 403, "text/plain", "wrong host");
    if (req.method === "GET" && url.pathname === "/") {
      return send(res, 200, "text/html; charset=utf-8", page(spec, { token, version }));
    }
    const origin = req.headers.origin;
    if (req.headers["x-hx-token"] !== token || (origin && origin !== `http://${self}`)) {
      return send(res, 403, "text/plain", "not this server's page");
    }
    if (req.method === "GET" && url.pathname === "/api/spec") {
      // long poll: answer once the version passes `since`, else 204 after 25 s
      if (version > Number(url.searchParams.get("since") || 0)) return reply(res);
      waiting.add(res);
      const done = () => waiting.delete(res);
      const timer = setTimeout(() => done() && send(res, 204, "text/plain", ""), 25000);
      return res.on("close", () => { clearTimeout(timer); done(); });
    }
    if (req.method === "POST" && url.pathname === "/api/notes") {
      try {
        const n = await json(req);
        if (!n.id || !n.el || !n.text) throw new Error("id, el and text are required");
        appendFileSync(inbox, JSON.stringify({ id: n.id, el: n.el, view: n.view, text: n.text }) + "\n");
        return send(res, 200, "application/json", '{"ok":true}');
      } catch (e) {
        return send(res, 400, "text/plain", String(e.message || e));
      }
    }
    send(res, 404, "text/plain", "not found");
  });
  server.listen(Number(values.port), "127.0.0.1", () => {
    self = `127.0.0.1:${server.address().port}`;
    console.log(`http://${self}/`);
  });
}
