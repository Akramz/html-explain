#!/usr/bin/env node
// Live mode: serve a spec's page and pass notes between the reader and the agent.
//   node serve.mjs <spec.json> [--port N]   serve the page; each note lands in <name>.inbox.jsonl
//   node serve.mjs <spec.json> --watch      print one line per new note, for the agent's monitor
// The page long-polls the spec and offers the agent's saves behind a reload button.
// Only the page this server sends can talk to it: a random token goes into that page and every API
// call must carry it in a header, and the Host and Origin must be this server's own address.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync, watchFile, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { check, page } from "./build.mjs";

const args = process.argv.slice(2);
const specPath = args.find((a) => a.endsWith(".json"));
if (!specPath) {
  console.error("usage: node serve.mjs <spec.json> [--port N] [--watch]");
  process.exit(2);
}
const base = specPath.replace(/\.json$/, "");
const inbox = `${base}.inbox.jsonl`;
const cursor = `${base}.inbox.cursor`;

const mtime = () => statSync(specPath).mtimeMs;
const readSpec = () => JSON.parse(readFileSync(specPath, "utf8"));
const lines = () => (existsSync(inbox) ? readFileSync(inbox, "utf8").split("\n").filter(Boolean) : []);

if (args.includes("--watch")) {
  // one stdout line per note, never repeated: the cursor survives a re-armed monitor
  let seen = existsSync(cursor) ? Number(readFileSync(cursor, "utf8")) || 0 : 0;
  const flush = () => {
    const all = lines();
    for (const raw of all.slice(seen)) {
      const n = JSON.parse(raw);
      const text = n.text.replace(/\s*\n\s*/g, " / ");
      console.log(`note ${n.id} on ${n.el} (seen in ${n.view}): ${text}`);
    }
    if (all.length > seen) writeFileSync(cursor, String((seen = all.length)));
  };
  flush();
  watchFile(inbox, { interval: 500 }, flush);
} else {
  const errors = check(readSpec());
  if (errors.length) {
    console.error(errors.map((e) => "error: " + e).join("\n"));
    process.exit(1);
  }
  const portArg = args.indexOf("--port");
  const token = randomBytes(24).toString("hex");
  let self = "";
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (code, type, body) => {
      res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(body);
    };
    if (req.headers.host !== self) return send(403, "text/plain", "wrong host");
    if (req.method === "GET" && url.pathname === "/") {
      const html = page(readSpec()).replace("<body>", `<body data-token="${token}">`);
      return send(200, "text/html; charset=utf-8", html);
    }
    const origin = req.headers.origin;
    if (req.headers["x-hx-token"] !== token || (origin && origin !== `http://${self}`)) {
      return send(403, "text/plain", "not this server's page");
    }
    if (req.method === "GET" && url.pathname === "/api/spec") {
      // long poll: answer as soon as the spec is newer than `since`, else 204 after 25 s
      const since = Number(url.searchParams.get("since") || 0);
      const reply = () => {
        try { return send(200, "application/json", JSON.stringify({ mtime: mtime(), spec: readSpec() })); }
        catch { return send(204, "text/plain", ""); } // the agent is mid-write: try again
      };
      if (mtime() > since) return reply();
      const start = Date.now();
      const tick = setInterval(() => {
        if (mtime() > since || Date.now() - start > 25000) {
          clearInterval(tick);
          if (mtime() > since) reply(); else send(204, "text/plain", "");
        }
      }, 300);
      req.on("close", () => clearInterval(tick));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/notes") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const n = JSON.parse(body);
          if (!n.id || !n.el || !n.text) throw new Error("id, el and text are required");
          appendFileSync(inbox, JSON.stringify({ t: Date.now(), id: n.id, el: n.el, view: n.view, text: n.text }) + "\n");
          send(200, "application/json", '{"ok":true}');
        } catch (e) {
          send(400, "text/plain", String(e.message || e));
        }
      });
      return;
    }
    send(404, "text/plain", "not found");
  });
  server.listen(portArg >= 0 ? Number(args[portArg + 1]) : 0, "127.0.0.1", () => {
    self = `127.0.0.1:${server.address().port}`;
    const url = `http://${self}/`;
    writeFileSync(`${base}.live.json`, JSON.stringify({ url, pid: process.pid }) + "\n");
    console.log(url);
  });
}
