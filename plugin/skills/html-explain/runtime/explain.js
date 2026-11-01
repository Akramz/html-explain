(() => {
  const S = JSON.parse(document.getElementById("spec").textContent);
  const KEY = "html-explain:" + S.id;
  const $ = (q, el = document) => el.querySelector(q);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const md = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  const threads = S.threads || {};
  const answered = new Set(Object.values(threads).flat().map((m) => m.id).filter(Boolean));

  // notes the reader wrote and has not sent yet; one the agent filed in `threads` is dropped
  let pending = [];
  try { pending = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  pending = pending.filter((n) => !answered.has(n.id));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pending)); } catch {} };
  save();

  let mode = "before";
  let sel = null; // "node:<id>", "edge:<from>><to>" or null
  let view, els = {};

  const edgeId = (e) => `${e.from}>${e.to}`;

  function build(m) {
    const nodes = {};
    for (const n of S.nodes) nodes[n.id] = { ...n };
    let edges = (S.edges || []).map((e) => ({ ...e }));
    const zones = (S.zones || []).filter((z) => (m === "after" ? !z.before_only : !z.after_only));
    if (m === "after" && S.after) {
      const a = S.after;
      for (const [id, p] of Object.entries(a.nodes || {})) {
        if (!nodes[id]) continue;
        nodes[id] = { ...nodes[id], ...p, status: p.status || "changed" };
      }
      for (const n of a.add || []) nodes[n.id] = { ...n, status: "new" };
      const gone = new Set(Object.keys(nodes).filter((id) => nodes[id].status === "removed"));
      const drop = new Set((a.edges && a.edges.remove) || []);
      edges = edges.filter((e) => !drop.has(edgeId(e)) && !gone.has(e.from) && !gone.has(e.to));
      edges = edges.concat(((a.edges && a.edges.add) || []).map((e) => ({ ...e })));
      for (const id of gone) nodes[id].note = null;
    }
    for (const n of Object.values(nodes)) { n.out = []; n.in = []; }
    for (const e of edges) {
      if (nodes[e.from] && nodes[e.to]) { nodes[e.from].out.push(e); nodes[e.to].in.push(e); }
    }
    return { nodes, edges, zones };
  }

  const talk = (key) => (threads[key] || []).length + pending.filter((n) => n.el === key).length;

  function nodeEl(n) {
    const el = document.createElement("div");
    const cls = { changed: " chg", removed: " gone", new: " new" }[n.status] || "";
    el.className = "node" + (n.kind ? " " + n.kind : "") + (n.note ? " flag" : "") + cls;
    const size = n.status === "removed" ? "removed" : n.status === "changed" ? "edited" : (n.size ?? "");
    el.innerHTML = `<div class="t">${esc(n.title)}</div><div class="f"><span>${esc(n.file || "")}</span><span>${esc(size)}</span></div>`;
    const k = talk("node:" + n.id);
    if (k) {
      const mine = pending.some((p) => p.el === "node:" + n.id);
      el.insertAdjacentHTML("beforeend", `<span class="talk${mine ? " pending" : ""}">${k}</span>`);
    }
    el.onclick = (e) => { e.stopPropagation(); select("node:" + n.id); };
    els[n.id] = el;
    return el;
  }

  function render() {
    document.body.classList.toggle("after", mode === "after");
    document.querySelectorAll(".switch button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
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
    if (sel && sel.startsWith("node:") && !view.nodes[sel.slice(5)]) sel = null;
    if (sel && sel.startsWith("edge:") && !view.edges.some((e) => "edge:" + edgeId(e) === sel)) sel = null;
    select(sel);
    refreshBar();
  }

  // ---- wires: edges marked `always`, plus the selected node's edges or the selected edge
  function center(el) {
    const b = $("#board").getBoundingClientRect(), r = el.getBoundingClientRect();
    return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2];
  }
  function draw() {
    const svg = $("#wires");
    svg.innerHTML = "";
    const node = sel && sel.startsWith("node:") ? sel.slice(5) : null;
    const shown = view.edges.filter((e) => e.always || (node && (e.from === node || e.to === node)) || "edge:" + edgeId(e) === sel);
    for (const e of shown) {
      if (!els[e.from] || !els[e.to]) continue;
      const [x1, y1] = center(els[e.from]), [x2, y2] = center(els[e.to]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(60, Math.abs(x2 - x1) / 4);
      const d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
      const picked = "edge:" + edgeId(e) === sel;
      const color = picked ? "#1d1d1f" : node === e.to ? "#8e44ad" : node === e.from ? "#0a66c2" : "#9a9a9a";
      const ns = "http://www.w3.org/2000/svg";
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", color);
      p.setAttribute("stroke-width", picked ? "2.6" : "1.6");
      if (node === e.to && !picked) p.setAttribute("stroke-dasharray", "4 4");
      const hit = document.createElementNS(ns, "path");
      hit.setAttribute("d", d);
      hit.setAttribute("class", "hit");
      hit.setAttribute("fill", "none");
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", "12");
      hit.onclick = (ev) => { ev.stopPropagation(); select("edge:" + edgeId(e)); };
      const tip = document.createElementNS(ns, "title");
      tip.textContent = `${view.nodes[e.from].title} → ${view.nodes[e.to].title}${e.label ? ": " + e.label : ""}`;
      hit.append(tip);
      svg.append(p, hit);
      if (e.label && (picked || e.always)) {
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", mx); t.setAttribute("y", (y1 + y2) / 2 - Math.min(30, Math.abs(x2 - x1) / 8) - 4);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "11"); t.setAttribute("fill", color);
        t.textContent = e.label;
        svg.append(t);
      }
    }
  }

  // ---- the side panel
  function chip(id, cls) {
    const n = view.nodes[id];
    return n ? `<button class="chip ${cls}" data-key="node:${esc(id)}">${esc(n.title)}</button>` : "";
  }
  function edgeChip(e, other, cls) {
    const k = talk("edge:" + edgeId(e));
    const lab = view.nodes[other] ? view.nodes[other].title : other;
    return `<button class="chip ${cls}" data-key="edge:${esc(edgeId(e))}">${esc(lab)}${e.label ? " · " + esc(e.label) : ""}${k ? ` (${k})` : ""}</button>`;
  }
  function thread(key) {
    const msgs = (threads[key] || []).map((m) =>
      `<div class="msg ${m.by === "agent" ? "agent" : "user"}"><span class="who">${m.by === "agent" ? "Agent" : "You"}${m.view ? " · " + esc(m.view) : ""}</span>${md(m.text)}</div>`);
    const mine = pending.filter((n) => n.el === key).map((n) =>
      `<div class="msg pending"><button class="x" data-del="${esc(n.id)}" title="Delete">✕</button><span class="who">You · not sent yet</span>${md(n.text)}</div>`);
    return `<h4>Notes and questions</h4>${msgs.join("")}${mine.join("")}
      <textarea class="note" placeholder="A question, a change you want, or a reply…"></textarea>
      <div style="display:flex;gap:6px;margin-top:6px"><button class="btn primary" data-add="${esc(key)}">Add note</button></div>`;
  }
  function panel() {
    const p = $("#panel");
    let html;
    if (!sel) {
      const a = mode === "after" && S.after;
      html = `<h2>${esc(a ? a.label || "After" : "Click a box or an arrow")}</h2>
        <p>${md(a ? a.summary || "" : S.summary || "")}</p>
        <p class="empty">Click a box or an arrow to read it and leave a note. Notes stay in this browser until you copy them to the agent with <b>Notes for the agent</b>.</p>`;
      if (a && a.notes && a.notes.length) {
        html += `<h4>Your notes and where they land</h4><ol class="notes-list">${a.notes.map((x) =>
          `<li><div class="q">${md(x.q)}</div><div>${md(x.a)}</div><div class="chips">${(x.ids || []).map((id) => chip(id, "")).join("")}</div></li>`).join("")}</ol>`;
      }
      html += thread("page");
    } else if (sel.startsWith("node:")) {
      const n = view.nodes[sel.slice(5)];
      const tag = n.status === "removed" ? "removed" : n.status === "new" ? "new" : n.tag;
      html = `${tag ? `<span class="tag">${esc(tag)}</span>` : ""}<h2>${esc(n.title)}</h2>
        <div class="file">${esc(n.file || "")}${n.size && mode === "before" ? " · " + esc(n.size) : ""}</div>
        <p>${md(n.desc)}</p>
        ${n.change ? `<h4>What changes</h4><p class="change">${md(n.change)}</p>` : ""}
        ${n.note ? `<h4>Worth a look</h4><p class="notice">${md(n.note)}</p>` : ""}
        ${n.status === "removed" ? "" : `<h4>Uses</h4>${n.out.length ? `<div class="chips">${n.out.map((e) => edgeChip(e, e.to, "u")).join("")}</div>` : `<div class="empty">none</div>`}
        <h4>Used by</h4>${n.in.length ? `<div class="chips">${n.in.map((e) => edgeChip(e, e.from, "b")).join("")}</div>` : `<div class="empty">none</div>`}`}
        ${thread(sel)}`;
    } else {
      const e = view.edges.find((x) => "edge:" + edgeId(x) === sel);
      html = `<span class="tag">arrow</span><h2>${esc(view.nodes[e.from].title)} → ${esc(view.nodes[e.to].title)}</h2>
        ${e.label ? `<div class="file">${esc(e.label)}</div>` : ""}<p>${md(e.desc || "")}</p>
        <div class="chips">${chip(e.from, "u")}${chip(e.to, "b")}</div>${thread(sel)}`;
    }
    p.innerHTML = html;
    p.querySelectorAll("[data-key]").forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); select(b.dataset.key); }));
    p.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { pending = pending.filter((n) => n.id !== b.dataset.del); save(); render(); }));
    p.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
      const text = p.querySelector("textarea.note").value.trim();
      if (!text) return;
      pending.push({ id: "n" + Math.random().toString(36).slice(2, 7), el: b.dataset.add, view: mode, text });
      save();
      render();
    }));
  }

  function select(key) {
    sel = key || null;
    const board = $("#board");
    board.classList.toggle("focus", !!sel);
    Object.values(els).forEach((e) => e.classList.remove("sel", "rel-u", "rel-b"));
    if (sel && sel.startsWith("node:")) {
      const n = view.nodes[sel.slice(5)];
      els[n.id].classList.add("sel");
      n.out.forEach((e) => els[e.to] && els[e.to].classList.add("rel-u"));
      n.in.forEach((e) => els[e.from] && els[e.from].classList.add("rel-b"));
    } else if (sel) {
      const e = view.edges.find((x) => "edge:" + edgeId(x) === sel);
      els[e.from].classList.add("rel-u");
      els[e.to].classList.add("rel-b");
    }
    history.replaceState(null, "", "#" + mode + (sel ? "/" + sel : ""));
    panel();
    draw();
  }

  // ---- notes for the agent
  function label(key) {
    if (key === "page") return "the whole page";
    if (key.startsWith("node:")) {
      const n = build("after").nodes[key.slice(5)] || build("before").nodes[key.slice(5)];
      return `box \`${key.slice(5)}\` (${n ? n.title : "?"}${n && n.file ? ", " + n.file : ""})`;
    }
    return `arrow \`${key.slice(5)}\``;
  }
  function exportText() {
    const by = {};
    for (const n of pending) (by[n.el] ||= []).push(n);
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
    $("#notes-btn").textContent = `Notes for the agent (${pending.length})`;
  }
  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), 1800);
  }

  function shell() {
    document.title = S.title.replace(/`/g, "");
    const legend = [
      ["background:var(--part);border-color:var(--part)", "key part"],
      ["border:2px solid var(--coreline)", "main step"],
      ["", "module"],
      ["background:var(--flag);border-color:var(--flag);border-radius:50%;width:8px;height:8px", "worth a look"],
    ];
    const after = [
      ["border-left:4px solid var(--uses)", "changes"],
      ["background:#fdecea;border:1px dashed var(--flag)", "removed"],
      ["background:#eef8f2;border:1px dashed var(--new)", "new"],
    ];
    document.body.innerHTML = `
      <header><h1>${md(S.title)}</h1>
        ${S.after ? `<span class="switch"><button data-mode="before">Before</button><button data-mode="after">${esc(S.after.label || "After")}</button></span>` : ""}
        ${S.subtitle ? `<span class="sub">${md(S.subtitle)}</span>` : ""}
        <span class="legend">${legend.map(([s, t]) => `<span><span class="sw" style="${s}"></span>${t}</span>`).join("")}
          ${after.map(([s, t]) => `<span class="after-only"><span class="sw" style="${s}"></span>${t}</span>`).join("")}
          <span style="color:var(--uses)">━ uses</span><span style="color:var(--usedby)">┅ used by</span></span>
      </header>
      <div class="wrap"><div id="board"><svg id="wires"></svg></div><aside id="panel"></aside></div>
      <div id="bar"><button class="btn primary" id="notes-btn"></button></div>
      <div id="sheet"><div class="box"><b>Notes for the agent</b>
        <span class="empty">Copy this and paste it to the agent. It answers each note in place and updates the After view.</span>
        <pre id="sheet-text"></pre>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="sheet-close">Close</button><button class="btn primary" id="sheet-copy">Copy</button></div></div></div>
      <div id="toast"></div>`;
    document.querySelectorAll(".switch button").forEach((b) => (b.onclick = () => { mode = b.dataset.mode; render(); }));
    $("#board").onclick = () => select(null);
    $("#notes-btn").onclick = () => {
      if (!pending.length) return toast("No notes yet: click a box or an arrow to add one");
      $("#sheet-text").textContent = exportText();
      $("#sheet").classList.add("on");
    };
    $("#sheet-close").onclick = () => $("#sheet").classList.remove("on");
    $("#sheet-copy").onclick = async () => {
      const text = exportText();
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
      }
      toast("Copied: paste it to the agent");
    };
    addEventListener("resize", draw);
  }

  shell();
  const [m, ...rest] = location.hash.slice(1).split("/");
  if (m === "after" && S.after) mode = "after";
  sel = rest.join("/") || null;
  render();
})();
