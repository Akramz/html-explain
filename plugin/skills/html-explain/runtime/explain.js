(() => {
  let S = JSON.parse(document.getElementById("spec").textContent);
  const LIVE = JSON.parse(document.getElementById("live")?.textContent || "null"); // set by serve.mjs
  const live = !!LIVE;
  const KEY = "html-explain:" + S.id;
  const $ = (q, el = document) => el.querySelector(q);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const api = (path, opts = {}) => fetch(path, { ...opts, headers: { "X-HX-Token": LIVE.token } });

  // notes the agent has not answered yet: unsent, or sent in live mode; one filed in `threads` drops
  let pending = [];
  try { pending = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pending)); } catch {} };
  const unsent = () => pending.filter((n) => !n.sent);
  let threads = {};
  function absorb(spec) {
    S = spec;
    threads = S.threads || {};
    const answered = new Set(Object.values(threads).flat().map((m) => m.id).filter(Boolean));
    pending = pending.filter((n) => !answered.has(n.id));
    save();
  }
  absorb(S);
  const drafts = {}; // half-written notes by key: a redraw keeps them

  let mode = "before";
  let sel = null; // "node:<id>" or null
  let view, els = {};

  // the view model of one mode
  function build(m) {
    const nodes = {};
    for (const n of S.nodes) nodes[n.id] = { ...n };
    let edges = (S.edges || []).map((e) => ({ ...e }));
    const zones = (S.zones || []).filter((z) => (m === "after" ? !z.before_only : !z.after_only));
    if (m === "after" && S.after) {
      const a = S.after;
      for (const [id, p] of Object.entries(a.nodes || {})) {
        if (nodes[id]) nodes[id] = { ...nodes[id], ...p, status: p.status || "changed" };
      }
      for (const n of a.add || []) nodes[n.id] = { ...n, status: "new" };
      const drop = new Set(a.edges?.remove || []);
      const gone = (id) => nodes[id].status === "removed";
      edges = edges.filter((e) => !drop.has(`${e.from}>${e.to}`) && !gone(e.from) && !gone(e.to));
      edges = edges.concat((a.edges?.add || []).map((e) => ({ ...e })));
    }
    for (const n of Object.values(nodes)) {
      Object.assign(n, { key: "node:" + n.id, out: [], in: [] });
      if (n.status === "removed") n.note = null;
    }
    for (const e of edges) {
      nodes[e.from].out.push(e);
      nodes[e.to].in.push(e);
    }
    return { nodes, edges, zones };
  }
  const picked = () => (sel ? view.nodes[sel.slice(5)] : null);
  const talk = (key) => (threads[key] || []).length + pending.filter((n) => n.el === key).length;

  function nodeEl(n) {
    const el = document.createElement("div");
    const cls = { changed: " chg", removed: " gone", new: " new" }[n.status] || "";
    el.className = "node" + (n.kind ? " " + n.kind : "") + (n.note ? " flag" : "") + cls;
    const size = n.status === "removed" ? "removed" : n.status === "changed" ? "edited" : (n.size ?? "");
    el.innerHTML = `<div class="t">${esc(n.title)}</div><div class="f"><span>${esc(n.file || "")}</span><span>${esc(size)}</span></div>`;
    const k = talk(n.key);
    if (k) {
      const mine = pending.some((p) => p.el === n.key);
      el.insertAdjacentHTML("beforeend", `<span class="talk${mine ? " pending" : ""}">${k}</span>`);
    }
    el.onclick = (e) => { e.stopPropagation(); select(n.key); };
    els[n.id] = el;
    return el;
  }

  function render() {
    if (mode === "after" && !S.after) mode = "before";
    document.body.classList.toggle("after", mode === "after");
    header();
    view = build(mode);
    els = {};
    const board = $("#board");
    board.querySelectorAll(".zone").forEach((z) => z.remove());
    const placed = new Set();
    for (const z of view.zones) {
      const sec = document.createElement("section");
      sec.className = "zone" + (z.style ? " " + z.style : "");
      sec.style.gridColumn = `span ${z.span || 12}`;
      sec.innerHTML = `<h2>${esc(z.title)}</h2>${z.why ? `<div class="why">${md(z.why)}</div>` : ""}`;
      if (z.columns) {
        const cols = document.createElement("div");
        cols.className = "cols";
        cols.style.gridTemplateColumns = `repeat(${z.columns.length}, 1fr)`;
        z.columns.forEach((c, i) => {
          const col = document.createElement("div");
          col.className = "col";
          col.innerHTML = c.title ? `<h3>${esc(c.title)}</h3>` : "";
          for (const id of c.nodes || []) {
            if (view.nodes[id]) { col.append(nodeEl(view.nodes[id])); placed.add(id); }
          }
          if (z.arrows && i < z.columns.length - 1) col.insertAdjacentHTML("beforeend", `<span class="arrow">→</span>`);
          cols.append(col);
        });
        sec.append(cols);
      }
      const rest = Object.values(view.nodes).filter((n) => n.zone === z.id && !placed.has(n.id));
      if (rest.length) {
        const box = document.createElement("div");
        box.className = "nodes";
        rest.forEach((n) => { box.append(nodeEl(n)); placed.add(n.id); });
        sec.append(box);
      }
      if (z.flow) sec.insertAdjacentHTML("beforeend", `<div class="flowline">${md(z.flow)}</div>`);
      board.append(sec);
    }
    select(picked() ? sel : null);
    refreshBar();
  }

  // ---- arrows: those marked `always`, plus the selected box's. They are drawn above the boxes,
  // from edge to edge, straight unless both directions between two boxes are shown.
  const MARKERS = ["", "u", "b"].map((c) =>
    `<marker id="arrow${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="head ${c}" d="M0,1 L9,5 L0,9 z"/></marker>`).join("");
  const GAP = 3; // between a box and its arrow's end
  const LABEL = { char: 6.6, line: 14 }; // the 11px label font: average width, line height
  function draw() {
    const b = $("#board").getBoundingClientRect();
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2, w: r.width / 2 + GAP, h: r.height / 2 + GAP };
    };
    // where the line from a box's centre towards the other box's centre leaves it
    const rim = (a, o) => {
      const dx = o.x - a.x, dy = o.y - a.y;
      const t = Math.min(a.w / Math.abs(dx || 1e-9), a.h / Math.abs(dy || 1e-9));
      return [a.x + dx * t, a.y + dy * t];
    };
    const node = sel ? sel.slice(5) : null;
    const shown = view.edges.filter((e) => e.always || e.from === node || e.to === node);
    let html = `<defs>${MARKERS}</defs>`;
    const taken = [];
    for (const e of shown) {
      if (!els[e.from] || !els[e.to]) continue;
      const A = box(els[e.from]), B = box(els[e.to]);
      const [x1, y1] = rim(A, B), [x2, y2] = rim(B, A);
      const len = Math.hypot(x2 - x1, y2 - y1);
      // boxes that nearly touch get no line: the outline and the panel already show the link
      if ((x2 - x1) * (B.x - A.x) + (y2 - y1) * (B.y - A.y) <= 0 || len < 10) continue;
      const back = shown.some((r) => r.from === e.to && r.to === e.from) ? 16 : 0;
      const cx = (x1 + x2) / 2 + ((y2 - y1) / len) * back, cy = (y1 + y2) / 2 - ((x2 - x1) / len) * back;
      const cls = node === e.to ? "b" : node === e.from ? "u" : "";
      html += `<path class="w ${cls}" d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" marker-end="url(#arrow${cls})"/>`;
      // a label sits at the line's middle, unless another label is already there
      const lx = (x1 + 2 * cx + x2) / 4, ly = (y1 + 2 * cy + y2) / 4 - 4;
      const half = ((e.label || "").length * LABEL.char) / 2 + 4;
      if (e.label && !taken.some(([x, y, h]) => Math.abs(x - lx) < h + half && Math.abs(y - ly) < LABEL.line)) {
        taken.push([lx, ly, half]);
        html += `<text x="${lx}" y="${ly}" class="w ${cls}">${esc(e.label)}</text>`;
      }
    }
    $("#wires").innerHTML = html;
  }
  let frame = 0;
  const redraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };

  // ---- the side panel
  function chip(id, cls, label) {
    const n = view.nodes[id];
    return n ? `<button class="chip ${cls}" data-key="${esc(n.key)}">${esc(n.title)}${label ? " · " + esc(label) : ""}</button>` : "";
  }
  const chips = (list, f) => (list.length ? `<div class="chips">${list.map(f).join("")}</div>` : `<div class="empty">none</div>`);
  function thread(key) {
    const msgs = (threads[key] || []).map((m) =>
      `<div class="msg ${m.by === "agent" ? "agent" : "user"}"><span class="who">${m.by === "agent" ? "Agent" : "You"}${m.view ? " · " + esc(m.view) : ""}</span>${md(m.text)}</div>`);
    const mine = pending.filter((n) => n.el === key).map((n) => n.sent
      ? `<div class="msg pending"><span class="who">You · sent, the agent is on it</span>${md(n.text)}</div>`
      : `<div class="msg pending"><button class="x" data-del="${esc(n.id)}" title="Delete">✕</button><span class="who">You · not sent yet</span>${md(n.text)}</div>`);
    return `<h4>Notes and questions</h4>${msgs.join("")}${mine.join("")}
      <textarea class="note" data-for="${esc(key)}" placeholder="A question, a change you want, or a reply…"></textarea>
      <div style="display:flex;gap:6px;margin-top:6px"><button class="btn primary" data-add="${esc(key)}">Add note</button></div>`;
  }
  function panel() {
    const p = $("#panel");
    const old = p.querySelector("textarea.note");
    const typing = old && document.activeElement === old;
    const caret = typing ? [old.selectionStart, old.selectionEnd] : null;
    if (old) drafts[old.dataset.for] = old.value;
    const scroll = p.scrollTop;
    const it = picked();
    let html;
    if (!it) {
      const a = mode === "after" && S.after;
      html = `<h2>${esc(a ? a.label || "After" : "Click a box")}</h2>
        <p>${md(a ? a.summary || "" : S.summary || "")}</p>
        <p class="empty">${live
          ? "Click a box to read it, see its arrows and leave a note. The agent sees each note as you add it; its answers and changes appear here as it makes them."
          : "Click a box to read it, see its arrows and leave a note. Notes stay in this browser until you copy them to the agent with <b>Notes for the agent</b>."}</p>`;
      if (a?.notes?.length) {
        html += `<h4>Your notes and where they land</h4><ol class="notes-list">${a.notes.map((x) =>
          `<li><div class="q">${md(x.q)}</div><div>${md(x.a)}</div><div class="chips">${(x.ids || []).map((id) => chip(id, "")).join("")}</div></li>`).join("")}</ol>`;
      }
      html += thread("page");
    } else {
      const tag = it.status === "removed" ? "removed" : it.status === "new" ? "new" : it.tag;
      html = `${tag ? `<span class="tag">${esc(tag)}</span>` : ""}<h2>${esc(it.title)}</h2>
        <div class="file">${esc(it.file || "")}${it.size && mode === "before" ? " · " + esc(it.size) : ""}</div>
        <p>${md(it.desc)}</p>
        ${it.change ? `<h4>What changes</h4><p class="change">${md(it.change)}</p>` : ""}
        ${it.note ? `<h4>Worth a look</h4><p class="notice">${md(it.note)}</p>` : ""}
        ${it.status === "removed" ? "" : `<h4>Uses</h4>${chips(it.out, (e) => chip(e.to, "u", e.label))}
        <h4>Used by</h4>${chips(it.in, (e) => chip(e.from, "b", e.label))}`}
        ${thread(it.key)}`;
    }
    p.innerHTML = html;
    const ta = p.querySelector("textarea.note");
    ta.value = drafts[ta.dataset.for] || "";
    ta.oninput = () => (drafts[ta.dataset.for] = ta.value);
    if (typing && old.dataset.for === ta.dataset.for) {
      ta.focus();
      ta.setSelectionRange(...caret);
    }
    p.scrollTop = scroll;
    p.querySelectorAll("[data-key]").forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); select(b.dataset.key); }));
    p.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { pending = pending.filter((n) => n.id !== b.dataset.del); save(); render(); }));
    p.querySelector("[data-add]").onclick = async (ev) => {
      const key = ev.currentTarget.dataset.add;
      const text = ta.value.trim();
      if (!text) return;
      const note = { id: "n" + Math.random().toString(36).slice(2, 7), el: key, view: mode, text };
      if (live) {
        try { note.sent = (await api("/api/notes", { method: "POST", body: JSON.stringify(note) })).ok; } catch {}
        if (!note.sent) toast("Could not reach the agent's server: kept here, copy it with Notes for the agent");
      }
      pending.push(note);
      drafts[key] = "";
      save();
      render();
    };
  }

  function select(key) {
    sel = key || null;
    $("#board").classList.toggle("focus", !!sel);
    Object.values(els).forEach((e) => e.classList.remove("sel", "rel-u", "rel-b"));
    const it = picked();
    const mark = (id, cls) => els[id]?.classList.add(cls);
    if (it) {
      mark(it.id, "sel");
      it.out.forEach((e) => mark(e.to, "rel-u"));
      it.in.forEach((e) => mark(e.from, "rel-b"));
    }
    history.replaceState(null, "", "#" + mode + (sel ? "/" + sel : ""));
    panel();
    draw();
  }

  // ---- notes for the agent, offline: one block to paste into the chat
  function label(key) {
    if (key === "page") return "the whole page";
    const id = key.slice(5);
    const n = [...S.nodes, ...(S.after?.add || [])].find((x) => x.id === id);
    return `box \`${id}\` (${n ? n.title : "?"}${n?.file ? ", " + n.file : ""})`;
  }
  function exportText() {
    const by = {};
    for (const n of unsent()) (by[n.el] ||= []).push(n);
    const lines = [`# Notes on "${S.title}" (${S.id}, round ${S.round || 0})`, "",
      "File each note in `threads` under its key with its id, answer it there, and update `after`.", ""];
    for (const [key, notes] of Object.entries(by)) {
      lines.push(`## ${label(key)} · key \`${key}\``);
      for (const t of threads[key] || []) lines.push(`- earlier, ${t.by === "agent" ? "agent" : "me"}: ${t.text.replace(/\n/g, " ")}`);
      for (const n of notes) lines.push(`- [${n.id}] (seen in ${n.view}) ${n.text.replace(/\n/g, "\n  ")}`);
      lines.push("");
    }
    return lines.join("\n");
  }
  function refreshBar() {
    const left = unsent().length, waiting = pending.length - left;
    $("#notes-btn").textContent = live && !left
      ? `Live · the agent reads each note${waiting ? ` (${waiting} waiting)` : ""}`
      : `Notes for the agent (${left})`;
  }
  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), 2400);
  }

  const LEGEND = [["part", "key part"], ["step", "main step"], ["", "module"], ["dot", "worth a look"]];
  const LEGEND_AFTER = [["chg", "changes"], ["gone", "removed"], ["new", "new"]];
  function header() {
    document.title = S.title.replace(/`/g, "");
    const sw = ([cls, t], extra = "") => `<span class="${extra}"><span class="sw ${cls}"></span>${t}</span>`;
    $("header").innerHTML = `<h1>${md(S.title)}</h1>
      ${S.after ? `<span class="switch"><button data-mode="before">Before</button><button data-mode="after">${esc(S.after.label || "After")}</button></span>` : ""}
      ${S.subtitle ? `<span class="sub">${md(S.subtitle)}</span>` : ""}
      <span class="legend">${LEGEND.map((x) => sw(x)).join("")}${LEGEND_AFTER.map((x) => sw(x, "after-only")).join("")}
        <span class="u">━ uses</span><span class="b">┅ used by</span></span>`;
    document.querySelectorAll(".switch button").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.onclick = () => { mode = b.dataset.mode; render(); };
    });
  }

  document.body.innerHTML = `
    <header></header>
    <div class="wrap"><div id="board"><svg id="wires"></svg></div><aside id="panel"></aside></div>
    <div id="bar"><button class="btn primary" id="notes-btn"></button></div>
    <dialog id="sheet"><b>Notes for the agent</b>
      <span class="empty">Copy this and paste it to the agent. It answers each note in place and updates the After view.</span>
      <pre id="sheet-text"></pre>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="sheet-close">Close</button><button class="btn primary" id="sheet-copy">Copy</button></div></dialog>
    <div id="toast"></div>`;
  $("#board").onclick = () => select(null);
  $("#notes-btn").onclick = () => {
    if (!unsent().length) return toast(live ? "The agent already has every note" : "No notes yet: click a box to add one");
    $("#sheet-text").textContent = exportText();
    $("#sheet").showModal();
  };
  $("#sheet-close").onclick = () => $("#sheet").close();
  $("#sheet-copy").onclick = async () => {
    const text = $("#sheet-text").textContent;
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast("Copied: paste it to the agent");
  };
  addEventListener("resize", redraw);

  const [m, ...rest] = location.hash.slice(1).split("/");
  if (m === "after" && S.after) mode = "after";
  sel = rest.join("/") || null;
  render();

  // live mode: each save of the agent redraws the page in place; the page itself never reloads,
  // so the selection, the scroll and a half-written note survive
  if (!live) return;
  (async () => {
    let version = LIVE.version;
    for (;;) {
      let r = null;
      try { r = await api("/api/spec?since=" + version); } catch {}
      if (r?.status === 200) {
        const d = await r.json();
        version = d.version;
        absorb(d.spec);
        render();
        toast("Updated by the agent");
      } else if (r?.status === 403) {
        $("#notes-btn").textContent = "The live server restarted: reload this page";
        return;
      } else if (r?.status !== 204) {
        await new Promise((ok) => setTimeout(ok, 2000)); // server down: try again
      }
    }
  })();
})();
