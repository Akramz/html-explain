(() => {
const NS = "http://www.w3.org/2000/svg";
const COLORS = {module:"--module", store:"--store", part:"--part", actor:"--actor", external:"--ext"};
const KINDS = {module:"Code", store:"Files on disk", part:"Part the user writes", actor:"Person or agent", external:"Outside the system"};
const CSSV = {};
const css = v => CSSV[v] ??= getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const $ = q => document.querySelector(q);

let S = JSON.parse($("#spec").textContent);
const LIVE = JSON.parse($("#live")?.textContent || "null");
const live = !!LIVE;
const api = (path, opts = {}) => fetch(path, {...opts, headers: {"X-HX-Token": LIVE.token}});
const KEY = k => "hx:" + S.id + ":" + k;
const stored = (k, d) => { try { return JSON.parse(localStorage.getItem(KEY(k))) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch {} };

let CUR, PROP, counts, threads, pending = stored("notes", []);
function absorb(spec){
  S = spec;
  CUR = {label:S.title, sub:S.summary, desc:S.desc, does:S.does, files:S.files, findings:S.findings, children:S.root};
  PROP = applyOps(CUR, S.proposed?.ops || []).tree;
  counts = new Map();
  threads = S.threads || {};
  const answered = new Set(Object.values(threads).flat().map(m=>m.id).filter(Boolean));
  pending = pending.filter(n=>!answered.has(n.id));
  store("notes", pending);
}
absorb(S);
const drafts = {};
let stale = false;
const unsent = () => pending.filter(n=>!n.sent);

const kindName = k => S.kinds?.[k] || KINDS[k] || k;
const ekey = e => e.from + ">" + e.to;
function nodeChanged(c, p){ return !!p.change || c.label!==p.label || (c.sub||"")!==(p.sub||""); }
function edgeChanged(c, p){ return !!p.change || (c.label||"")!==(p.label||""); }
function diffLevel(c, p){
  const cn = c?.children?.nodes||[], ce = c?.children?.edges||[];
  if(!p) return {nodes:cn.map(n=>({n, st:"same"})), edges:ce.map(e=>({e, st:"same"}))};
  const pn = p.children?.nodes||[], pe = p.children?.edges||[];
  const cm = new Map(cn.map(x=>[x.id,x])), pids = new Set(pn.map(x=>x.id));
  const nodes = pn.map(n=>{ const o = cm.get(n.id); return {n, cur:o, st: !o ? "added" : nodeChanged(o,n) ? "changed" : "same"}; });
  for(const o of cn) if(!pids.has(o.id)) nodes.push({n:o, st:"removed"});
  const cem = new Map(ce.map(e=>[ekey(e),e])), pek = new Set(pe.map(ekey));
  const edges = pe.map(e=>{ const o = cem.get(ekey(e)); return {e, st: !o ? "added" : edgeChanged(o,e) ? "changed" : "same"}; });
  for(const o of ce) if(!pek.has(ekey(o))) edges.push({e:o, st:"removed"});
  return {nodes, edges};
}
function changesUnder(c, p){
  if(!counts.has(p)){
    const d = diffLevel(c, p);
    counts.set(p, [...d.nodes, ...d.edges].filter(x=>x.st!=="same").length + d.nodes.reduce((s,x)=>s+(x.cur?changesUnder(x.cur,x.n):0), 0));
  }
  return counts.get(p);
}

const state = {mode:"current", path:[], sel:null, tab:"details", labels:true, showReviewed: stored("show-reviewed", false)};
const reviewed = new Set(stored("reviewed", []));
const isHidden = p => !state.showReviewed && p.some((_,i)=>reviewed.has(p.slice(0,i+1).join("/")));
function visible(L, path){ if(state.showReviewed) return L; const nodes = L.nodes.filter(x=>!isHidden([...path, x.n.id])); const ids = new Set(nodes.map(x=>x.n.id)); return {...L, nodes, edges: L.edges.filter(x=>ids.has(x.e.from) && ids.has(x.e.to))}; }
function reviewBtn(p){ const k = p.join("/"), on = reviewed.has(k); return '<button class="btn ghost'+(on?" done":"")+'" data-rev="'+esc(k)+'">'+(on?"✓ Reviewed · undo":"Mark reviewed")+'</button>'; }
function saveReviewed(){ store("reviewed", [...reviewed]); store("show-reviewed", state.showReviewed); }
function clampPath(){
  if(!S.proposed) state.mode = "current";
  while(state.path.length && (!levelOf(tree(), state.path) || isHidden(state.path))) state.path.pop();
}
function reviewChanged(){ saveReviewed(); clampPath(); state.sel = null; writeHash(); render(); }
function toggleReviewed(k){ if(reviewed.has(k)) reviewed.delete(k); else reviewed.add(k); reviewChanged(); }
function readHash(){
  const parts = decodeURIComponent(location.hash.slice(1)).split("/").filter(Boolean);
  if(parts[0]==="current"||parts[0]==="proposed") state.mode = parts.shift();
  state.path = parts;
  clampPath();
}
function writeHash(){ history.replaceState(null,"","#"+[state.mode,...state.path].join("/")); }
const tree = () => state.mode==="current" ? CUR : PROP;

function merged(path){
  const d = diffLevel(levelOf(CUR, path), state.mode==="proposed" ? levelOf(PROP, path) : null);
  for(const x of d.nodes) x.inner = x.cur ? changesUnder(x.cur, x.n) : 0;
  return d;
}
function resolve(sel){
  if(!sel) return null;
  const L = visible(merged(state.path), state.path);
  return (sel.node ? L.nodes.find(x=>x.n.id===sel.node) : L.edges.find(x=>ekey(x.e)===sel.edge)) || null;
}

document.body.innerHTML = `
<header>
  <h1></h1>
  <div class="toggle" id="mode"><button data-m="current">Current</button><button data-m="proposed">Proposed<span class="n" id="nchanges"></span></button></div>
  <div id="crumbs"></div>
  <div class="legend" id="legend"></div>
  <button class="btn ghost" id="improve-btn"></button>
  <button class="btn" id="notes-btn"></button>
</header>
<main>
  <nav><div id="outline"></div><div id="navfoot"><span class="sw"></span><span>Show reviewed <span id="nrev"></span></span></div></nav>
  <section id="stage"><svg id="svg"></svg>
    <div id="zoom"><button data-z="in" title="Zoom in (+)">+</button><button data-z="out" title="Zoom out (−)">−</button><button data-z="fit" title="Fit to screen (0)">Fit</button></div>
    <div id="hint">Click a box to select it · click its ▸ number (or double-click the box) to open it · Esc clears the selection, then goes up · C / P switch views · L hides arrow labels · scroll or + / − zooms, drag pans, 0 fits</div></section>
  <aside>
    <div class="tabs" id="tabs"><button data-t="details" class="on">Details</button><button data-t="log">Design log</button></div>
    <div id="panel"></div>
  </aside>
</main>
<dialog id="sheet"><b>Notes for the agent</b>
  <p class="muted">Copy this and paste it to the agent. It answers each note in place and updates the Proposed view.</p>
  <pre id="sheet-text"></pre>
  <div class="row-end"><button class="btn ghost" id="sheet-close">Close</button><button class="btn" id="sheet-copy">Copy</button></div></dialog>
<div id="toast"></div>`;

const svg = $("#svg");
function el(tag, attrs={}, parent){ const e = document.createElementNS(NS, tag); for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); parent?.appendChild(e); return e; }
function wrap(text, max){ const words = String(text||"").split(/\s+/).filter(Boolean); const lines=[]; let cur=""; for(const w of words){ if((cur+" "+w).trim().length>max && cur){ lines.push(cur); cur=w; } else cur=(cur+" "+w).trim(); } if(cur) lines.push(cur); return lines; }
const stColor = st => st==="added"?css("--add"):st==="removed"?css("--del"):st==="changed"?css("--chg"):null;
function rectOf(n){ const cx = n.x*SX, cy = n.y*SY; return {x:cx-W/2, y:cy-H/2, w:W, h:H, cx, cy}; }
function clipToRect(r, from, toward){
  const dx = toward.x-from.x, dy = toward.y-from.y;
  if(!dx && !dy) return {x:from.x, y:from.y};
  const tx = dx ? (r.w/2+4)/Math.abs(dx) : Infinity, ty = dy ? (r.h/2+4)/Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return {x:from.x+dx*t, y:from.y+dy*t};
}

let viewBox = null;
function render(animateFrom){
  let {nodes, edges} = visible(merged(state.path), state.path);
  let ghost = null;
  const gone = nodes.filter(x=>x.st==="removed");
  if(state.mode==="proposed" && gone.length){
    const kept = nodes.filter(x=>x.st!=="removed"), ids = new Set(gone.map(x=>x.n.id));
    const base = kept.length ? kept : gone;
    const maxY = Math.max(...base.map(x=>x.n.y)), minX = Math.min(...base.map(x=>x.n.x));
    ghost = {x:minX, y:maxY+200};
    const per = Math.max(4, new Set(kept.map(x=>x.n.x)).size);
    nodes = [...kept, ...gone.map((x,i)=>({...x, n:{...x.n, x:minX+(i%per)*250, y:ghost.y+Math.floor(i/per)*120}}))];
    edges = edges.filter(x=>!ids.has(x.e.from) && !ids.has(x.e.to));
  }
  svg.innerHTML = "";
  const defs = el("defs", {}, svg);
  const markers = {};
  const marker = color => { if(markers[color]) return markers[color]; const id = "m"+Object.keys(markers).length; const m = el("marker",{id, viewBox:"0 0 10 10", refX:9, refY:5, markerWidth:7, markerHeight:7, orient:"auto-start-reverse"}, defs); el("path",{d:"M0,0 L10,5 L0,10 z", fill:color}, m); return markers[color] = id; };
  const root = el("g", {class: animateFrom===false ? "" : "fade"}, svg);
  const gE = el("g", {}, root), gL = el("g", {}, root), gN = el("g", {}, root);
  const byId = new Map(nodes.map(x=>[x.n.id, x.n]));
  const pairs = new Map();
  for(const {e} of edges){ const k = [e.from,e.to].sort().join("|"); pairs.set(k,(pairs.get(k)||0)+1); }
  const seen = new Map();
  const rects = nodes.map(x=>rectOf(x.n)), placed = [];
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  const grow = (x,y,w=0,h=0)=>{ minx=Math.min(minx,x); miny=Math.min(miny,y); maxx=Math.max(maxx,x+w); maxy=Math.max(maxy,y+h); };

  for(const x of edges){
    const {e, st} = x;
    const a = byId.get(e.from), b = byId.get(e.to); if(!a||!b) continue;
    const k = [e.from,e.to].sort().join("|"); const i = seen.get(k)||0; seen.set(k,i+1);
    const multi = pairs.get(k);
    const bend = e.bend ?? (multi>1 ? (i - (multi-1)/2) * 46 * (e.from<e.to?1:-1) : 0);
    const ra = rectOf(a), rb = rectOf(b);
    const mx = (ra.cx+rb.cx)/2, my = (ra.cy+rb.cy)/2, dx = rb.cx-ra.cx, dy = rb.cy-ra.cy, len = Math.hypot(dx,dy)||1;
    const c = {x: mx - dy/len*bend*2, y: my + dx/len*bend*2};
    const p1 = clipToRect(ra, {x:ra.cx,y:ra.cy}, c), p2 = clipToRect(rb, {x:rb.cx,y:rb.cy}, c);
    const d = "M"+p1.x+","+p1.y+" Q"+c.x+","+c.y+" "+p2.x+","+p2.y;
    const color = stColor(st) || (e.kind==="spawn" ? "#7a5af8" : e.kind==="http" ? "#0f8a8a" : "#7c8597");
    const g = el("g", {class:"edge", "data-from":e.from, "data-to":e.to}, gE);
    el("path", {class:"vis", d, stroke:color, "stroke-width":st==="same"?1.6:2.4, fill:"none", "stroke-dasharray": st==="removed" ? "6 5" : e.kind==="data" ? "2 4" : "", "marker-end":"url(#"+marker(color)+")", opacity: st==="removed"?.6:1}, g);
    el("path", {class:"hit", d}, g);
    g.addEventListener("click", ev=>{ ev.stopPropagation(); select({edge:ekey(e)}); });
    g.addEventListener("mouseenter", ()=>preview(x));
    if(state.labels && e.label){
      const lines = wrap(e.label, 26);
      const bw = Math.max(...lines.map(s=>s.length))*6.7+12, bh = lines.length*15+6;
      const at = t => ({x:(1-t)*(1-t)*p1.x + 2*(1-t)*t*c.x + t*t*p2.x, y:(1-t)*(1-t)*p1.y + 2*(1-t)*t*c.y + t*t*p2.y});
      const hits = q => [rects, placed].some(a => a.some(o => q.x-bw/2 < o.x+o.w && q.x+bw/2 > o.x && q.y-bh/2 < o.y+o.h && q.y+bh/2 > o.y));
      let best = at(.5);
      for(const t of [.5,.42,.58,.35,.65,.28,.72]){ const q = at(t); if(!hits(q)){ best = q; break; } }
      const lx = best.x, ly = best.y;
      placed.push({x:lx-bw/2-3, y:ly-bh/2-3, w:bw+6, h:bh+6});
      const gl = el("g", {class:"edge", "data-from":e.from, "data-to":e.to}, gL);
      el("rect", {x:lx-bw/2, y:ly-bh/2, width:bw, height:bh, rx:4, fill:"#fff", stroke: stColor(st)||"#e3e6ec", opacity:.95}, gl);
      lines.forEach((s,j)=>{ const tx = el("text", {x:lx, y:ly-bh/2+15+j*15, "text-anchor":"middle", fill: stColor(st)||"#444"}, gl); tx.textContent = s; if(st==="removed") tx.setAttribute("text-decoration","line-through"); });
      gl.addEventListener("click", ev=>{ ev.stopPropagation(); select({edge:ekey(e)}); });
      grow(lx-bw/2, ly-bh/2, bw, bh);
    }
  }

  for(const x of nodes){
    const {n, st, inner} = x;
    const r = rectOf(n);
    grow(r.x, r.y, r.w, r.h);
    const base = css(COLORS[n.kind]||"--module");
    const sc = stColor(st);
    const g = el("g", {class:"node", "data-id":n.id}, gN);
    const fill = n.kind==="part" ? "#f6f0fd" : n.kind==="store" ? "#ecf7f7" : n.kind==="actor" ? "#eef0f4" : n.kind==="external" ? "#f7f8fa" : "#fff";
    el("rect", {class:"box", x:r.x, y:r.y, width:r.w, height:r.h, rx: n.kind==="actor"?r.h/2:9, fill: st==="added" ? "#ecf8f1" : st==="removed" ? "#fdeeed" : fill, stroke: sc||base, "stroke-width": sc?2.6:1.6, "stroke-dasharray": (st==="removed"||n.kind==="external") ? "6 4" : "", opacity: st==="removed"?.75:1}, g);
    if(n.kind==="store") el("path", {d:"M"+r.x+","+(r.y+8)+" h"+r.w, stroke: sc||base, "stroke-width":1, opacity:.6}, g);
    el("rect", {x:r.x, y:r.y+8, width:4, height:r.h-16, rx:2, fill: sc||base}, g);
    const tl = wrap(n.label, Math.floor(r.w/9.4));
    const sl = wrap(n.sub, Math.floor(r.w/6.9)).slice(0, Math.max(1, Math.floor((r.h-16-tl.length*19)/15)));
    const total = tl.length*19 + sl.length*15;
    let y = r.cy - total/2 + 15;
    for(const s of tl){ const t = el("text", {class:"ntitle", x:r.cx, y, "text-anchor":"middle"}, g); t.textContent = s; if(st==="removed") t.setAttribute("text-decoration","line-through"); y += 19; }
    for(const s of sl){ const t = el("text", {class:"nsub", x:r.cx, y:y-2, "text-anchor":"middle"}, g); t.textContent = s; y += 15; }
    const p = [...state.path, n.id];
    const kids = (n.children?.nodes||[]).filter(k=>!isHidden([...p, k.id])).length;
    if(reviewed.has(p.join("/"))){ g.setAttribute("opacity", .45); const t = el("text", {x:r.x+10, y:r.y-6, "font-size":11, fill:css("--add"), "font-weight":600}, g); t.textContent = "✓ reviewed"; }
    if(kids && st!=="removed"){ const bx = r.x+r.w-40, by = r.y-13; const gb = el("g", {class:"open"}, g); el("title", {}, gb).textContent = "Open: "+kids+" parts inside"; el("rect", {x:bx, y:by, width:48, height:26, rx:13, fill: sc||base}, gb); const t = el("text", {class:"badge", x:bx+24, y:by+17.5, "text-anchor":"middle"}, gb); t.textContent = "▸ "+kids; gb.addEventListener("click", ev=>{ ev.stopPropagation(); zoomInto(n); }); }
    if(inner && st!=="removed"){ const bx = r.x-8, by = r.y-9; el("rect", {x:bx, y:by, width:Math.max(56, 14+String(inner).length*7+44), height:18, rx:9, fill: css("--chg")}, g); const t = el("text", {class:"badge", x:bx+8, y:by+13}, g); t.textContent = inner+" inside"; }
    if(n.findings?.length && state.mode==="current"){ const t = el("text", {x:r.x+10, y:r.y+r.h-6, "font-size":10, fill:css("--del")}, g); t.textContent = "● " + n.findings.length; }
    const key = noteKey(p), talk = (threads[key]||[]).length + pending.filter(q=>q.el===key).length;
    if(talk){ const t = el("text", {x:r.x+r.w-10, y:r.y+r.h-6, "font-size":10, fill:css("--module"), "text-anchor":"end"}, g); t.textContent = "✎ " + talk; }
    g.addEventListener("mouseenter", ()=>{ highlight(n.id); preview(x); });
    g.addEventListener("mouseleave", ()=>highlight(null));
    g.addEventListener("click", ev=>{ ev.stopPropagation(); select({node:n.id}); });
    g.addEventListener("dblclick", ev=>{ ev.stopPropagation(); if(kids && st!=="removed") zoomInto(n); });
    if(state.sel?.node===n.id) g.classList.add("sel");
  }
  if(ghost){ const gx = ghost.x*SX - W/2, gy = ghost.y*SY - H/2 - 16; const t = el("text", {x:gx, y:gy, fill:css("--del"), "font-size":14, "font-weight":650}, gN); t.textContent = "Removed in the proposal"; el("line", {x1:gx, y1:gy-34, x2:gx+Math.max(600, Math.min(gone.length, 4)*250*SX), y2:gy-34, stroke:"#e5c3c0", "stroke-dasharray":"4 4"}, gN); grow(gx, gy-20, 10, 10); }
  const pad = 40;
  const target = nodes.length ? [minx-pad, miny-pad, Math.max(400,maxx-minx+2*pad), Math.max(300,maxy-miny+2*pad)] : [0,0,800,500];
  if(animateFrom===false && zoomed && view){}
  else { zoomed = false; if(animateFrom) animate(animateFrom, target); else { animId++; setVB(target); } }
  viewBox = target;
  renderChrome();
  renderPanel();
}
let view = null, zoomed = false;
function setVB(v){ view = v; svg.setAttribute("viewBox", v.join(" ")); }
function toSVG(x, y){ const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function zoomAt(k, p){
  if(!view || !viewBox) return;
  p ??= {x: view[0]+view[2]/2, y: view[1]+view[3]/2};
  const w = Math.min(viewBox[2]*4, Math.max(viewBox[2]/10, view[2]/k)), f = view[2]/w;
  animId++; zoomed = true;
  setVB([p.x-(p.x-view[0])/f, p.y-(p.y-view[1])/f, view[2]/f, view[3]/f]);
}
function fit(){ zoomed = false; animate(view, viewBox, 200); }
let animId = 0;
function animate(from, to, ms=260, done){
  const id = ++animId, t0 = performance.now();
  let ended = false;
  const end = () => { if(ended) return; ended = true; if(id===animId) setVB(to); done?.(); };
  const step = now => { if(id!==animId || ended) return; const k = Math.min(1,(now-t0)/ms), e = 1-Math.pow(1-k,3); setVB(from.map((v,i)=>v+(to[i]-v)*e)); if(k<1) requestAnimationFrame(step); else end(); };
  requestAnimationFrame(step);
  setTimeout(end, ms+80);
}
function highlight(id){
  const linked = new Set([id]);
  for(const g of svg.querySelectorAll("g.edge")){ const on = !id || g.dataset.from===id || g.dataset.to===id; g.classList.toggle("dim", !on); if(id && on){ linked.add(g.dataset.from); linked.add(g.dataset.to); } }
  for(const g of svg.querySelectorAll("g.node")) g.classList.toggle("dim", !!id && !linked.has(g.dataset.id));
}
let zooming = false;
function zoomInto(n){
  if(zooming || !levelOf(tree(), [...state.path, n.id])) return;
  zooming = true;
  const r = rectOf(n);
  animate(view, [r.x-20, r.y-20, r.w+40, r.h+40], 200, ()=>{ zooming = false; state.path = [...state.path, n.id]; state.sel = null; writeHash(); render(null); });
}
function go(path){ state.path = path; state.sel = null; writeHash(); render(); }
function select(sel){ state.sel = sel; state.tab = "details"; renderTabs(); renderPanel(); for(const g of svg.querySelectorAll("g.node")) g.classList.toggle("sel", !!sel?.node && g.dataset.id===sel.node); }
function preview(x){ if(!state.sel && !typing() && state.tab==="details") showDetails(x); }

const foot = $("#navfoot");
function renderChrome(){
  $("h1").textContent = S.title;
  document.title = S.title;
  $("#mode").style.display = S.proposed ? "" : "none";
  $("#tabs").style.display = S.proposed ? "" : "none";
  const crumbs = $("#crumbs"); crumbs.innerHTML = "";
  const t = tree(); const names = [t.label];
  let n = t; for(const id of state.path){ n = n.children.nodes.find(x=>x.id===id); names.push(n.label); }
  names.forEach((nm,i)=>{
    if(i) crumbs.insertAdjacentHTML("beforeend", '<span class="sep">›</span>');
    if(i===names.length-1){ const b = document.createElement("b"); b.textContent = nm; crumbs.appendChild(b); }
    else { const a = document.createElement("a"); a.textContent = nm; a.onclick = ()=>go(state.path.slice(0,i)); crumbs.appendChild(a); }
  });
  for(const b of document.querySelectorAll("#mode button")) b.classList.toggle("on", b.dataset.m===state.mode);
  const total = changesUnder(CUR, PROP);
  $("#nchanges").textContent = total || "";
  $("#nchanges").style.display = total ? "" : "none";
  const sw = (c, t, extra="") => '<span><i style="border-color:'+css(c)+';'+extra+'"></i>'+esc(t)+'</span>';
  $("#legend").innerHTML = state.mode==="current"
    ? sw("--module", kindName("module").toLowerCase()) + sw("--part", kindName("part").toLowerCase(), "background:#f6f0fd") + sw("--store", kindName("store").toLowerCase(), "background:#ecf7f7") + sw("--ext", kindName("external").toLowerCase(), "border-style:dashed")
    : sw("--add", "added") + sw("--chg", "changed") + sw("--del", "removed", "border-style:dashed");
  renderOutline();
  foot.classList.toggle("on", state.showReviewed);
  $("#nrev").textContent = reviewed.size ? "("+reviewed.size+")" : "";
  refreshBar();
}
function renderOutline(){
  const nav = $("#outline"); nav.innerHTML = "";
  const walk = (cn, pn, path, depth) => {
    const deeper = JSON.stringify(state.path)!==JSON.stringify(path);
    for(const x of diffLevel(cn, pn).nodes){
      const {n, cur: o} = x;
      const st = x.st==="same" && o && changesUnder(o, n) ? "inner" : x.st;
      if(deeper && !n.children?.nodes?.length) continue;
      const rk = [...path, n.id].join("/");
      if(isHidden([...path, n.id])) continue;
      const row = document.createElement("div");
      row.className = "row" + (st==="removed"?" removed":"") + (reviewed.has(rk)?" rev":"");
      row.style.paddingLeft = (6+depth*14)+"px";
      if(JSON.stringify(state.path)===JSON.stringify([...path, n.id])) row.classList.add("here");
      const color = stColor(st) || (st==="inner" ? "#f1d9a8" : css(COLORS[n.kind]||"--module"));
      row.innerHTML = '<span class="dot" style="background:'+color+'"></span>';
      row.appendChild(document.createTextNode((reviewed.has(rk)?"✓ ":"") + n.label));
      row.title = n.sub || "";
      row.onclick = () => { if(st==="removed") return; if(n.children?.nodes?.length) go([...path, n.id]); else { go(path); select({node:n.id}); } };
      nav.appendChild(row);
      const open = JSON.stringify(state.path.slice(0, path.length+1))===JSON.stringify([...path, n.id]);
      if(n.children?.nodes?.length && st!=="removed" && open) walk(state.mode==="current"?n:o, state.mode==="current"?null:n, [...path, n.id], depth+1);
    }
  };
  const top = document.createElement("div"); top.className = "row" + (state.path.length? "" : " here"); top.textContent = tree().label + " (top)"; top.onclick = ()=>go([]); nav.appendChild(top);
  walk(CUR, state.mode==="current"?null:PROP, [], 1);
}

function esc(s){ return String(s??"").replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function md(s){ return esc(s).replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>"); }
function findingHTML(o){
  const tags = (o.checked ? '<span class="tag v">checked</span>' : '<span class="tag">to check</span>') + '<span class="tag">' + esc(o.type||"note") + '</span>';
  return '<div class="obs '+esc(o.type||"")+'">'+md(o.t)+'<div class="meta">'+tags+(o.ref?' <code>'+esc(o.ref)+'</code>':'')+'</div></div>';
}
function noteKey(path){ return path.length ? "node:"+path.join("/") : "page"; }
function thread(key){
  const msgs = (threads[key]||[]).map(m=>'<div class="msg '+(m.by==="agent"?"agent":"user")+'"><span class="who">'+(m.by==="agent"?"Agent":"You")+(m.view?" · "+esc(m.view):"")+'</span>'+md(m.text)+'</div>');
  const mine = pending.filter(n=>n.el===key).map(n=>n.sent
    ? '<div class="msg pending"><span class="who">You · sent, the agent is on it</span>'+md(n.text)+'</div>'
    : '<div class="msg pending"><button class="x" data-del="'+esc(n.id)+'" title="Delete">✕</button><span class="who">You · not sent yet</span>'+md(n.text)+'</div>');
  return '<h3>Notes</h3>'+msgs.join("")+mine.join("")+'<textarea class="note" data-for="'+esc(key)+'" placeholder="A question, a change you want, or a reply…"></textarea><div><button class="btn" data-add="'+esc(key)+'">Add note</button></div>';
}
const typing = () => document.activeElement?.matches?.("#panel textarea.note");
const about = o => (o.files?.length ? '<h3>Files</h3><div class="files">'+o.files.map(f=>'<code>'+esc(f)+'</code>').join("")+'</div>' : '')
  + (o.desc ? '<h3>What it does</h3><div>'+md(o.desc)+'</div>' : '')
  + (o.does?.length ? '<ul>'+o.does.map(x=>'<li>'+md(x)+'</li>').join("")+'</ul>' : '');

function renderPanel(){ if(state.tab==="log") renderLog(); else showDetails(resolve(state.sel)); }
function showDetails(s){
  const p = $("#panel");
  const old = p.querySelector("textarea.note");
  const wasTyping = old && document.activeElement===old;
  const caret = wasTyping ? [old.selectionStart, old.selectionEnd] : null;
  if(old) drafts[old.dataset.for] = old.value;
  const scroll = p.scrollTop;
  let h;
  if(!s){
    const owner = levelOf(tree(), state.path);
    h = '<div class="kind">'+(state.path.length?"This level":"Overview")+'</div><h2>'+esc(owner.label)+'</h2>';
    if(owner.sub) h += '<div class="muted">'+md(owner.sub)+'</div>';
    h += about(owner);
    if(state.mode==="proposed" && owner.change) h += '<div class="change"><b>Proposed:</b> '+md(owner.change)+'</div>';
    if(owner.findings?.length) h += '<h3>Findings here ('+owner.findings.length+')</h3>'+owner.findings.map(findingHTML).join("");
    if(state.path.length) h += '<div>'+reviewBtn(state.path)+'</div>';
    h += thread(noteKey(state.path));
    h += '<p class="muted" style="margin-top:18px">Hover a box or arrow for its details. Click a box to select it; click its ▸ number to open it.</p>';
  } else if(s.e){
    const e = s.e, lbl = id => (levelOf(tree(), [...state.path, id]) || levelOf(CUR, [...state.path, id]))?.label || id;
    h = '<div class="kind">Arrow'+(s.st!=="same"?" · "+s.st:"")+'</div><h2>'+esc(lbl(e.from))+' → '+esc(lbl(e.to))+'</h2>';
    if(e.label) h += '<div>'+md(e.label)+'</div>';
    if(e.desc) h += '<h3>Details</h3><div>'+md(e.desc)+'</div>';
    if(e.change && state.mode==="proposed") h += '<div class="change '+s.st+'"><b>Proposed:</b> '+md(e.change)+'</div>';
    h += '<p class="muted">Arrows take no notes. Write a note on one of its boxes.</p>';
  } else {
    const n = s.n, path = [...state.path, n.id];
    h = '<div class="kind">'+esc(kindName(n.kind))+(s.st&&s.st!=="same"?' · <b style="color:'+stColor(s.st)+'">'+s.st+'</b>':'')+'</div><h2>'+esc(n.label)+'</h2>';
    if(n.sub) h += '<div class="muted">'+md(n.sub)+'</div>';
    if(state.mode==="proposed" && (n.change || s.st==="removed")) h += '<div class="change '+s.st+'"><b>Proposed:</b> '+md(n.change || "removed")+'</div>';
    h += about(n);
    if(n.findings?.length) h += '<h3>Findings ('+n.findings.length+')</h3>'+n.findings.map(findingHTML).join("");
    h += '<div>';
    if(n.children?.nodes?.length && s.st!=="removed") h += '<button class="btn" id="open">Open ▸ '+n.children.nodes.length+' parts</button>';
    if(s.st!=="removed" && levelOf(tree(), path)) h += reviewBtn(path);
    h += '</div>';
    h += thread(noteKey(path));
  }
  p.innerHTML = h;
  for(const b of p.querySelectorAll("[data-rev]")) b.onclick = ()=>toggleReviewed(b.dataset.rev);
  const ob = $("#open"); if(ob) ob.onclick = ()=>zoomInto(s.n);
  for(const b of p.querySelectorAll("[data-del]")) b.onclick = ()=>{ pending = pending.filter(n=>n.id!==b.dataset.del); store("notes", pending); render(false); };
  const ta = p.querySelector("textarea.note");
  if(!ta){ p.scrollTop = scroll; return; }
  ta.value = drafts[ta.dataset.for] || "";
  ta.oninput = () => (drafts[ta.dataset.for] = ta.value);
  if(wasTyping && old.dataset.for===ta.dataset.for){ ta.focus(); ta.setSelectionRange(...caret); }
  p.scrollTop = scroll;
  p.querySelector("[data-add]").onclick = async ev => {
    const key = ev.currentTarget.dataset.add, text = ta.value.trim();
    if(!text) return;
    await post({el:key, view:state.mode, text});
    drafts[key] = "";
    render(false);
  };
}
function renderLog(){
  const p = $("#panel");
  const P = S.proposed || {};
  let h = '<div class="kind">Decisions and open questions</div><h2>Design log</h2>';
  if(P.summary) h += '<p>'+md(P.summary)+'</p>';
  if(!P.log?.length) h += '<p class="muted">Nothing yet. As you share notes and questions, each one lands here with what it changed in the proposed view.</p>';
  for(const x of P.log||[]) h += '<div class="logitem"><div class="d">'+esc(x.date||"")+' · '+esc(x.status||"open")+'</div><b>'+md(x.title||"")+'</b><div>'+md(x.text||"")+'</div></div>';
  p.innerHTML = h;
}
function renderTabs(){ for(const b of document.querySelectorAll("#tabs button")) b.classList.toggle("on", b.dataset.t===state.tab); }

function label(key){
  if(key==="page") return "the whole page";
  const path = key.slice(5).split("/"), n = levelOf(CUR, path) || levelOf(PROP, path);
  return "box `"+path.join("/")+"` ("+(n?n.label:"?")+")";
}
function exportText(){
  const by = {};
  for(const n of unsent()) (by[n.el] ||= []).push(n);
  const lines = ['# Notes on "'+S.title+'" ('+S.id+')', "", "File each note in `threads` under its key with its id, answer it there, and put each agreed change in `proposed`.", ""];
  for(const [key, notes] of Object.entries(by)){
    lines.push("## "+label(key)+" · key `"+key+"`");
    for(const t of threads[key]||[]) lines.push("- earlier, "+(t.by==="agent"?"agent":"me")+": "+t.text.replace(/\n/g," "));
    for(const n of notes) lines.push("- ["+n.id+"] ("+(n.kind==="improve"?"improve request, ":"")+"seen in "+n.view+") "+n.text.replace(/\n/g,"\n  "));
    lines.push("");
  }
  return lines.join("\n");
}
function refreshBar(){
  const left = unsent().length, waiting = pending.length - left, imp = improving();
  $("#notes-btn").textContent = stale ? "The live server restarted: reload this page" : live && !left ? "Live · the agent reads each note"+(waiting?" ("+waiting+" waiting)":"") : "Notes for the agent ("+left+")";
  $("#improve-btn").disabled = stale || !!imp;
  $("#improve-btn").textContent = !imp ? "✦ Improve proposal" : imp.sent ? "Improving…" : "Improve proposal · queued";
}
async function post(note){
  note.id = "n"+Math.random().toString(36).slice(2,7);
  pending.push(note);
  if(live){
    try { note.sent = (await api("/api/notes", {method:"POST", body:JSON.stringify(note)})).ok; } catch {}
    if(!note.sent) toast("Could not reach the agent's server: kept here, copy it with Notes for the agent");
  }
  store("notes", pending);
}
const improving = () => pending.find(n=>n.kind==="improve");
async function improve(){
  if(improving()) return;
  await post({el:"page", view:state.mode, kind:"improve", text:"Improve the proposal: use every note, thread and decision so far."});
  render(false);
}
let toastTimer;
function toast(t){ const e = $("#toast"); e.textContent = t; e.style.display = "block"; clearTimeout(toastTimer); toastTimer = setTimeout(()=>e.style.display = "none", 2400); }

foot.onclick = () => { state.showReviewed = !state.showReviewed; reviewChanged(); };
$("#tabs").onclick = e => { const t = e.target.closest("button")?.dataset.t; if(!t) return; state.tab = t; renderTabs(); renderPanel(); };
$("#mode").onclick = e => { const m = e.target.closest("button")?.dataset.m; if(m) setMode(m); };
$("#improve-btn").onclick = improve;
$("#notes-btn").onclick = () => {
  if(!unsent().length) return toast(live ? "The agent already has every note" : "No notes yet: select a box to add one");
  $("#sheet-text").textContent = exportText();
  $("#sheet").showModal();
};
$("#sheet-close").onclick = () => $("#sheet").close();
$("#sheet-copy").onclick = async () => {
  const text = $("#sheet-text").textContent;
  try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
  toast("Copied: paste it to the agent");
};
function setMode(m){ state.mode = m; clampPath(); state.sel = null; writeHash(); render(); }
svg.addEventListener("click", ()=>select(null));
svg.addEventListener("wheel", e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY*(e.ctrlKey ? .01 : .002)), toSVG(e.clientX, e.clientY)); }, {passive:false});
let drag = null, dragged = false;
svg.addEventListener("pointerdown", e => { if(e.button===0 && view) drag = {x:e.clientX, y:e.clientY, v:view, s:svg.getScreenCTM().a, moved:false}; });
svg.addEventListener("pointermove", e => {
  if(!drag) return;
  const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
  if(!drag.moved && Math.hypot(dx, dy) < 4) return;
  if(!drag.moved){ drag.moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add("panning"); }
  animId++; zoomed = true;
  setVB([drag.v[0]-dx/drag.s, drag.v[1]-dy/drag.s, drag.v[2], drag.v[3]]);
});
const endDrag = () => { if(drag?.moved){ dragged = true; setTimeout(()=>dragged = false, 0); } drag = null; svg.classList.remove("panning"); };
svg.addEventListener("pointerup", endDrag);
svg.addEventListener("pointercancel", endDrag);
svg.addEventListener("click", e => { if(dragged) e.stopImmediatePropagation(); }, true);
$("#zoom").onclick = e => { const z = e.target.closest("button")?.dataset.z; if(z==="in") zoomAt(1.25); else if(z==="out") zoomAt(.8); else if(z==="fit") fit(); };
document.addEventListener("keydown", e => {
  if(e.target.closest?.("input, textarea, dialog")) return;
  if(e.key==="Escape" && state.sel){ select(null); return; }
  if((e.key==="Escape"||e.key==="Backspace") && state.path.length){ const up = state.path[state.path.length-1]; go(state.path.slice(0,-1)); const n = levelOf(tree(), state.path)?.children?.nodes.find(x=>x.id===up); if(n){ const r = rectOf(n); animate([r.x-20,r.y-20,r.w+40,r.h+40], viewBox); } }
  else if(e.key==="c") setMode("current"); else if(e.key==="p") setMode("proposed");
  else if(e.key==="l"){ state.labels = !state.labels; render(false); }
  else if(e.key==="+"||e.key==="=") zoomAt(1.25); else if(e.key==="-") zoomAt(.8); else if(e.key==="0") fit();
});
window.addEventListener("hashchange", ()=>{ readHash(); render(); });
readHash(); render();

if(!live) return;
(async () => {
  let version = LIVE.version;
  for(;;){
    let r = null;
    try { r = await api("/api/spec?since="+version); } catch {}
    if(r?.status===200){
      const d = await r.json();
      version = d.version;
      const was = improving();
      absorb(d.spec);
      clampPath();
      render(false);
      toast(was && !improving() ? "The agent improved the proposal: see its answer in the page notes" : "Updated by the agent");
    } else if(r?.status===403){
      stale = true;
      refreshBar();
      return;
    } else if(r?.status!==204){
      await new Promise(ok=>setTimeout(ok, 2000));
    }
  }
})();
})();
