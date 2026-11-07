/* Contoso Agent Studio
   An isometric, dependency-free replay of an AI agent team's event log.
   Data: fetch('events.json'); on file:// (fetch blocked) it falls back to window.STUDIO_EVENTS from events.js.
   Video export: window.__studio = { ready, total, renderAt(t) } draws a deterministic frame for replay time t. */
(() => {
  'use strict';

  // ================================================================ settings
  const QS = new URLSearchParams(location.search);
  const RENDER = QS.get('render') === '1';
  const SELFTEST = QS.get('selftest') === '1';
  const T_PARAM = QS.has('t') ? Math.max(0, parseFloat(QS.get('t')) || 0) : null;
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT = '"Segoe UI Variable Text","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,"Liberation Sans",system-ui,sans-serif';
  const MONO = 'ui-monospace,"Cascadia Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono","DejaVu Sans Mono",monospace';

  // World units: 1 = one floor cell. x runs along the back-right wall, y along the back-left wall, z is up.
  const W = 16, D = 10, H = 4.3, BASE = 0.42, WT = 0.22;
  const SPEED = 6, DT = 1 / 24, LIVE_MS = 15000;
  const SLOT = { goal: 3.2, plan: 2.8, assign: 2.0, start: 2.5, log: 1.8, tool: 1.8, blocked: 3.2, decision_request: 3.5, decision_answer: 2.6, review: 2.6, done: 2.2, merge: 2.2, memory: 1.4, note: 2.6 };
  const TAG = { goal: 'GOAL', plan: 'PLAN', assign: 'ASSIGN', start: 'START', log: 'LOG', tool: 'TOOL', blocked: 'BLOCKED', decision_request: 'NEEDS YOU', decision_answer: 'ANSWER', review: 'REVIEW', done: 'DONE', merge: 'MERGED', memory: 'MEMORY', note: 'NOTE' };
  const TAG_CLASS = { blocked: 'amber', decision_request: 'amber', decision_answer: 'green', done: 'green', merge: 'green', review: 'blue', start: 'blue' };
  const PREFIX = { tool: '$ ', log: '> ', start: '>> ', blocked: '! ', decision_request: '? ', decision_answer: '< ', answer: '< ', review: '~ ', done: '+ ', merge: '+ ', memory: '# ', note: '" ', plan: '> ', goal: '> ', assign: '> ' };
  const LINE_COLOR = { tool: '#7dd3fc', log: '#c9d1d9', start: '#86efac', blocked: '#fbbf24', decision_request: '#fbbf24', decision_answer: '#a5b4fc', answer: '#a5b4fc', review: '#fcd34d', done: '#4ade80', merge: '#4ade80', memory: '#d8b4fe', note: '#e5e7eb', plan: '#c9d1d9', goal: '#c9d1d9', assign: '#c9d1d9' };
  const PX = 0, PY = 1, NX = 2, NY = 3;
  const FACE = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const STAND = 0, WALK = 1, SIT = 2, SOFA = 3, POINT = 4;
  const COLS = ['todo', 'doing', 'review', 'done'];
  const COL_LABEL = ['To do', 'Doing', 'Review', 'Done'];
  const COL_TINT = ['#6e7781', '#0f6cbd', '#c27803', '#1a7f37'];
  // Task Wall board on the back-right wall, drawn in local px (1 px = BK world units).
  const BK = 1 / 36, BX0 = 2.4, BZ0 = 3.95, BW = 475, BH = 122, CW = (BW - 30) / 4;
  const DESK_SLOTS = [[5, 2], [7, 2], [10, 2], [12, 2], [5, 5], [7, 5], [10, 5], [12, 5]];
  const HUMAN_SEAT = [9.5, 9.42];
  const QUEUE = [[9.5, 7.36], [8.38, 7.4], [10.62, 7.4], [7.3, 7.55], [11.7, 7.55], [6.2, 7.6]];
  const LOUNGE = [
    { key: 'L0', x: 0.64, y: 5.95, pose: SOFA, face: PX, d0: 8, d1: 14 },
    { key: 'L1', x: 0.64, y: 8.05, pose: SOFA, face: PX, d0: 8, d1: 14 },
    { key: 'L2', x: 1.22, y: 9.5, pose: STAND, face: NX, d0: 5, d1: 10 },
    { key: 'L3', x: 2.6, y: 4.5, pose: STAND, face: PY, d0: 5, d1: 10 },
    { key: 'L4', x: 3.4, y: 7.0, pose: STAND, face: NX, d0: 5, d1: 10 },
    { key: 'L5', x: 2.4, y: 8.1, pose: STAND, face: NY, d0: 5, d1: 10 },
    { key: 'L6', x: 1.32, y: 2.0, pose: STAND, face: NX, d0: 5, d1: 10 },
    { key: 'L7', x: 2.6, y: 1.3, pose: STAND, face: NY, d0: 5, d1: 10 },
    { key: 'L8', x: 5.4, y: 8.8, pose: STAND, face: NX, d0: 5, d1: 10 },
  ];
  const FALLBACK = ['#0f6cbd', '#107c41', '#6b3fa0', '#bc4b09', '#8a5a00', '#b42318', '#0e7c86', '#c239b3', '#5c6bc0', '#00838f'];

  // ================================================================ helpers
  const str = (v) => (v == null ? '' : String(v));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); };
  const easeBack = (t) => { t = clamp(t, 0, 1) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t; };
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  function rgbOf(h) { let s = h.slice(1); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const mixMemo = new Map();
  function mix(a, b, t) {
    const k = a + b + t; let v = mixMemo.get(k);
    if (!v) { const A = rgbOf(a), B = rgbOf(b); v = '#' + [0, 1, 2].map((i) => Math.round(lerp(A[i], B[i], t)).toString(16).padStart(2, '0')).join(''); mixMemo.set(k, v); }
    return v;
  }
  function rgba(h, a) { const c = rgbOf(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  const lum = (h) => { const c = rgbOf(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
  function parseTs(ts) {
    const m = /T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?/i.exec(ts || '');
    if (!m) return null;
    let off = m[4] || '';
    if (/^z$/i.test(off)) off = '+00:00'; else if (off && off.indexOf(':') < 0) off = off.slice(0, 3) + ':' + off.slice(3);
    return { h: +m[1], m: +m[2], hhmm: m[1] + ':' + m[2], off };
  }
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s + 1e-6)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ================================================================ data
  let fetchFailed = false;
  async function loadRaw(bust) {
    if (!(fetchFailed && location.protocol === 'file:')) {
      try {
        const r = await fetch('events.json' + (bust ? '?v=' + Date.now() : ''), { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) { fetchFailed = true; }
    }
    if (!bust) return window.STUDIO_EVENTS || null;
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'events.js?v=' + Date.now();
      s.onload = () => { s.remove(); resolve(window.STUDIO_EVENTS || null); };
      s.onerror = () => { s.remove(); resolve(null); };
      document.head.appendChild(s);
    });
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Event data is not an object');
    const p = raw.project || {};
    const project = { title: str(p.title) || 'Untitled project', goal: str(p.goal), repo: str(p.repo), started: str(p.started) };
    const agents = [], byId = new Map();
    const addAgent = (a, i) => {
      const id = str(a.id).trim(); if (!id || byId.has(id)) return;
      const kind = a.kind === 'lead' || a.kind === 'human' ? a.kind : 'worker';
      const color = HEX.test(str(a.color)) ? str(a.color) : FALLBACK[i % FALLBACK.length];
      const ag = { id, name: str(a.name) || id, title: str(a.title), kind, color, note: str(a.note), seed: hashStr(id) % 997 };
      agents.push(ag); byId.set(id, ag);
    };
    (Array.isArray(raw.agents) ? raw.agents : []).forEach((a, i) => { if (a && typeof a === 'object') addAgent(a, i); });
    const tasks = [], taskById = new Map();
    const addTask = (t) => {
      const id = str(t.id).trim(); if (!id || taskById.has(id)) return;
      const task = { id, title: str(t.title) || id, lane: str(t.lane) || null, deps: Array.isArray(t.deps) ? t.deps.map(str) : [], idx: tasks.length };
      tasks.push(task); taskById.set(id, task);
    };
    (Array.isArray(raw.tasks) ? raw.tasks : []).forEach((t) => { if (t && typeof t === 'object') addTask(t); });
    const events = [];
    (Array.isArray(raw.events) ? raw.events : []).forEach((e) => {
      if (!e || typeof e !== 'object') return;
      const type = Object.prototype.hasOwnProperty.call(SLOT, e.type) ? e.type : 'note';
      let agent = str(e.agent).trim();
      if (!agent) agent = (agents.find((a) => a.kind === 'lead') || agents[0] || { id: 'lead' }).id;
      if (!byId.has(agent)) addAgent({ id: agent, name: agent, kind: 'worker' }, agents.length);
      const task = str(e.task).trim() || null;
      if (task && !taskById.has(task)) addTask({ id: task, title: task, lane: agent });
      events.push({ ts: str(e.ts), agent, type, task, text: str(e.text).trim() || TAG[type], detail: str(e.detail), clock: parseTs(str(e.ts)) });
    });
    for (const t of tasks) if (t.lane && !byId.has(t.lane)) t.lane = null;
    const lead = agents.find((a) => a.kind === 'lead') || agents.find((a) => a.kind !== 'human') || null;
    const human = agents.find((a) => a.kind === 'human') || null;
    const deskAgents = (lead ? [lead] : []).concat(agents.filter((a) => a !== lead && a.kind !== 'human'));
    return { project, agents, byId, tasks, taskById, events, lead, human, deskAgents };
  }

  // ================================================================ timeline
  function buildTimeline(events) {
    const n = events.length, starts = new Float64Array(n), durs = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) { starts[i] = acc; durs[i] = SLOT[events[i].type] || 1.8; acc += durs[i]; }
    return { n, starts, durs, total: Math.round(acc * 1000) / 1000 };
  }
  function indexAt(t) {
    const s = TL.starts; let lo = 0, hi = TL.n - 1;
    if (hi < 0) return -1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid] <= t + 1e-9) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // ================================================================ room layout
  function buildLayout() {
    const blocked = new Uint8Array(W * D), owner = new Array(W * D).fill(null);
    const block = (x0, y0, x1, y1, who) => {
      for (let y = Math.max(0, Math.floor(y0 + 1e-3)); y < Math.min(D, Math.ceil(y1 - 1e-3)); y++)
        for (let x = Math.max(0, Math.floor(x0 + 1e-3)); x < Math.min(W, Math.ceil(x1 - 1e-3)); x++) { blocked[y * W + x] = 1; if (who !== undefined) owner[y * W + x] = who; }
    };
    const desks = [], deskOf = new Map();
    DESK_SLOTS.forEach(([x0, y0], i) => {
      const a = M.deskAgents[i] || null;
      const d = { i, x0, y0, agent: a ? a.id : null, color: a ? a.color : '#aab3bd', seat: [x0 + 1, y0 + 1.3] };
      desks.push(d); if (a) deskOf.set(a.id, d);
      block(x0, y0, x0 + 2, y0 + 1);
      block(x0, y0 + 1, x0 + 2, y0 + 2, a ? a.id : '#');
    });
    M.deskAgents.slice(DESK_SLOTS.length).forEach((a, j) => deskOf.set(a.id, desks[j % desks.length]));
    block(0, 0.6, 0.6, 3.6); block(0, 4.2, 0.8, 4.8); block(0, 5.3, 0.95, 8.7); block(1.25, 6.25, 1.85, 7.75);
    block(0, 9.05, 0.75, 9.95); block(4.2, 9.2, 4.8, 9.8); block(9.12, 7.92, 9.88, 8.58); block(9.05, 8.95, 9.95, 9.95);
    block(10.2, 9.2, 10.65, 9.65); block(15.2, 9.2, 15.8, 9.8);
    const r = mulberry(7), planks = [];
    for (let row = 0; row < D * 2; row++) {
      const y0 = row / 2; let x = -r() * 2.4;
      while (x < W) { const len = 1.7 + r() * 2.6, a = Math.max(0, x), b = Math.min(W, x + len); if (b - a > 0.02) planks.push([a, b, y0, y0 + 0.5, (r() * 3) | 0]); x += len; }
    }
    return { blocked, owner, desks, deskOf, planks };
  }
  const walkable = (c, who) => !L.blocked[c] || L.owner[c] === who;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function accessCell(x, y, who) {
    const cx = clamp(Math.floor(x), 0, W - 1), cy = clamp(Math.floor(y), 0, D - 1), c = cy * W + cx;
    if (walkable(c, who)) return c;
    let best = -1, bd = 1e9;
    for (let r = 1; r <= 4 && best < 0; r++) {
      for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= D || Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) !== r) continue;
        const nc = yy * W + xx; if (!walkable(nc, who)) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y); if (d < bd) { bd = d; best = nc; }
      }
    }
    return best < 0 ? c : best;
  }
  // Grid path from (fx, fy) to target point, preferring straight runs; returns waypoints.
  function route(fx, fy, tg, who) {
    const start = clamp(Math.floor(fy), 0, D - 1) * W + clamp(Math.floor(fx), 0, W - 1);
    const goal = accessCell(tg.x, tg.y, who);
    const pts = [];
    if (start !== goal) {
      const dist = new Int16Array(W * D).fill(-1), q = new Int16Array(W * D);
      let qh = 0, qt = 0; dist[goal] = 0; q[qt++] = goal;
      while (qh < qt) {
        const c = q[qh++], cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= D) continue;
          const nc = ny * W + nx; if (dist[nc] >= 0 || (!walkable(nc, who) && nc !== start)) continue;
          dist[nc] = dist[c] + 1; q[qt++] = nc;
        }
      }
      if (dist[start] < 0) return [[tg.x, tg.y]];
      const cells = [start]; let c = start, pdx = 0, pdy = 0;
      while (c !== goal) {
        const cx = c % W, cy = (c / W) | 0; let nxt = -1, ndx = 0, ndy = 0;
        const order = pdx || pdy ? [[pdx, pdy]].concat(DIRS) : DIRS;
        for (const [dx, dy] of order) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= D) continue;
          const nc = ny * W + nx; if (dist[nc] >= 0 && dist[nc] === dist[c] - 1) { nxt = nc; ndx = dx; ndy = dy; break; }
        }
        if (nxt < 0) break;
        cells.push(nxt); c = nxt; pdx = ndx; pdy = ndy;
      }
      for (const cc of cells) pts.push([cc % W + 0.5, ((cc / W) | 0) + 0.5]);
    } else pts.push([start % W + 0.5, ((start / W) | 0) + 0.5]);
    pts.push([tg.x, tg.y]);
    const out = [];
    for (const p of pts) {
      const n = out.length;
      if (n && Math.abs(out[n - 1][0] - p[0]) < 1e-6 && Math.abs(out[n - 1][1] - p[1]) < 1e-6) continue;
      if (n >= 2) {
        const a = out[n - 2], b = out[n - 1];
        if ((Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(b[0] - p[0]) < 1e-6) || (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(b[1] - p[1]) < 1e-6)) { out[n - 1] = p; continue; }
      }
      out.push(p);
    }
    // Skip the first cell centre when the walker already sits on the line towards the next waypoint.
    if (out.length >= 2) {
      const a = out[0], b = out[1];
      if ((Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(fx - a[0]) < 0.02) || (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(fy - a[1]) < 0.02)) out.shift();
    }
    return out;
  }

  // ================================================================ shared event semantics
  function matchPending(list, ev) {
    if (!list.length) return -1;
    if (ev.task) { const k = list.findIndex((p) => p.task === ev.task); if (k >= 0) return k; }
    return 0;
  }
  const laneOf = (taskId) => { const t = taskId && M.taskById.get(taskId); return t && t.lane ? t.lane : null; };
  const isHuman = (id) => { const a = M.byId.get(id); return !!a && a.kind === 'human'; };

  // ================================================================ choreography (precomputed, deterministic)
  function simulate() {
    const n = Math.ceil((TL.total + 6) / DT) + 2;
    const sims = M.deskAgents.map((a) => ({
      a, id: a.id, isLead: a === M.lead, x: 0, y: 0, dist: 0, pose: STAND, face: PY, path: [], target: null,
      arrived: true, arrivedAt: 0, dwell: 0, rnd: mulberry(hashStr(a.id) ^ 0x9e3779b9), wallUntil: -1, wallCol: 0, busyUntil: -1,
      xs: new Float32Array(n), ys: new Float32Array(n), ds: new Float32Array(n), ps: new Uint8Array(n), fs: new Uint8Array(n),
    }));
    const byId = new Map(sims.map((s) => [s.id, s]));
    const active = new Map(), pending = [];
    let review = null;
    const spots = new Map();
    const spot = (key, make) => { let v = spots.get(key); if (!v) { v = make(); v.key = key; spots.set(key, v); } return v; };
    const deskSpot = (id) => spot('desk:' + id, () => { const d = L.deskOf.get(id); return { x: d.seat[0], y: d.seat[1], pose: SIT, face: NY }; });
    const wallSpot = (c) => spot('wall:' + c, () => ({ x: colCenterX(c), y: 1.05, pose: POINT, face: NY }));
    const podiumSpot = (k) => spot('podium:' + k, () => { const q = QUEUE[Math.min(k, QUEUE.length - 1)]; return { x: q[0], y: q[1], pose: STAND, face: PY }; });
    const reviewSpot = (wid) => spot('review:' + wid, () => { const d = L.deskOf.get(wid); return { x: d.x0 + 1.74, y: d.y0 + 1.66, pose: STAND, face: NY }; });
    const loungeSpot = (s, t) => {
      if (s.target && s.target.lounge && (!s.arrived || t < s.arrivedAt + s.dwell)) return s.target;
      const taken = new Set();
      for (const o of sims) if (o !== s && o.target && o.target.lounge) taken.add(o.target.key);
      const cur = s.target && s.target.key;
      const opts = LOUNGE.filter((l) => !taken.has(l.key) && l.key !== cur);
      const pick = opts.length ? opts[Math.floor(s.rnd() * opts.length)] : LOUNGE[0];
      s.dwell = pick.d0 + s.rnd() * (pick.d1 - pick.d0);
      return spot(pick.key, () => ({ x: pick.x, y: pick.y, pose: pick.pose, face: pick.face, lounge: true }));
    };
    const desired = (s, t) => {
      const pi = pending.findIndex((p) => p.agent === s.id);
      if (pi >= 0) return podiumSpot(pi);
      if (s.isLead && review && t < review.until && review.worker !== s.id && L.deskOf.get(review.worker) && L.deskOf.get(review.worker) !== L.deskOf.get(s.id)) return reviewSpot(review.worker);
      if (t < s.wallUntil) return wallSpot(s.wallCol);
      const act = active.get(s.id);
      if ((act && act.size) || t < s.busyUntil || s.isLead) return deskSpot(s.id);
      return loungeSpot(s, t);
    };
    const apply = (ev, S, d) => {
      const s = byId.get(ev.agent);
      switch (ev.type) {
        case 'goal': case 'plan': case 'assign':
          if (s) { s.wallUntil = S + d + 0.6; s.wallCol = 0; }
          break;
        case 'start':
          if (s) { if (!active.has(s.id)) active.set(s.id, new Set()); active.get(s.id).add(ev.task || '_'); s.busyUntil = Math.max(s.busyUntil, S + d + 3); }
          break;
        case 'log': case 'tool':
          if (s) s.busyUntil = Math.max(s.busyUntil, S + d + 4);
          break;
        case 'blocked': case 'decision_request':
          if (s && !pending.some((p) => p.agent === s.id)) pending.push({ agent: s.id, task: ev.task });
          break;
        case 'decision_answer': {
          const k = matchPending(pending, ev);
          if (k >= 0) { const p = pending.splice(k, 1)[0]; const r = byId.get(p.agent); if (r) r.busyUntil = Math.max(r.busyUntil, S + d + 4); }
          break;
        }
        case 'review': {
          const wid = laneOf(ev.task) || ev.agent;
          review = { task: ev.task, worker: wid, until: S + d + 3 };
          const w = byId.get(wid); if (w) w.busyUntil = Math.max(w.busyUntil, S + d + 3.5);
          break;
        }
        case 'done': case 'merge': {
          for (const set of active.values()) set.delete(ev.task);
          const wid = laneOf(ev.task);
          const w = byId.get(wid);
          if (w && !(active.get(w.id) && active.get(w.id).size)) w.busyUntil = Math.min(w.busyUntil, S + 1.6);
          if (review && review.task === ev.task) review.until = Math.min(review.until, S + 1.3);
          else if (s && s.isLead) { s.wallUntil = S + d + 0.4; s.wallCol = 3; }
          break;
        }
        default: break;
      }
    };
    // initial placement: the lead at its desk, everybody else lounging
    for (const s of sims) {
      if (s.isLead || !LOUNGE.length) { const d = deskSpot(s.id); s.x = d.x; s.y = d.y; s.target = d; s.pose = d.pose; s.face = d.face; continue; }
      const tg = loungeSpot(s, 0);
      s.x = tg.x; s.y = tg.y; s.target = tg; s.pose = tg.pose; s.face = tg.face; s.arrived = true; s.arrivedAt = -s.rnd() * 3;
    }
    let ei = 0;
    for (let k = 0; k < n; k++) {
      const t = k * DT;
      while (ei < TL.n && TL.starts[ei] <= t + 1e-9) { apply(M.events[ei], TL.starts[ei], TL.durs[ei]); ei++; }
      for (const s of sims) {
        const tg = desired(s, t);
        if (tg !== s.target) { s.target = tg; s.path = route(s.x, s.y, tg, s.id); s.arrived = false; }
        let rem = SPEED * DT;
        while (rem > 1e-9 && s.path.length) {
          const pt = s.path[0], dx = pt[0] - s.x, dy = pt[1] - s.y, dd = Math.hypot(dx, dy);
          if (dd > 1e-6) s.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? PX : NX) : (dy > 0 ? PY : NY);
          if (dd <= rem) { s.x = pt[0]; s.y = pt[1]; s.dist += dd; rem -= dd; s.path.shift(); }
          else { s.x += (dx / dd) * rem; s.y += (dy / dd) * rem; s.dist += rem; rem = 0; }
        }
        if (s.path.length) s.pose = WALK;
        else { if (!s.arrived) { s.arrived = true; s.arrivedAt = t; } s.pose = s.target.pose; s.face = s.target.face; }
        s.xs[k] = s.x; s.ys[k] = s.y; s.ds[k] = s.dist; s.ps[k] = s.pose; s.fs[k] = s.face;
      }
    }
    return { n, sims };
  }
  const colCenterX = (c) => BX0 + (6 + c * (CW + 6) + CW / 2) * BK;

  // ================================================================ logical state (folded from events)
  function newState() {
    const tasks = new Map();
    for (const t of M.tasks) tasks.set(t.id, { col: null, seq: 0, assigned: false });
    return { tasks, logs: new Map(), pending: [], memories: [], active: new Map(), review: null, done: 0, seq: 0, last: new Map(), added: [], answerFor: null };
  }
  function pushLog(st, id, entry) { let a = st.logs.get(id); if (!a) { a = []; st.logs.set(id, a); } a.push(entry); if (a.length > 10) a.shift(); }
  function applyEvent(st, i) {
    const ev = M.events[i], a = ev.agent, T = ev.task ? st.tasks.get(ev.task) : null;
    st.added = []; st.answerFor = null;
    const put = (id, col) => {
      const x = st.tasks.get(id); if (!x || x.col === col) return;
      if (!x.col) st.added.push(id);
      if (x.col === 'done') st.done--;
      if (col === 'done') st.done++;
      x.col = col; x.seq = ++st.seq;
    };
    switch (ev.type) {
      case 'plan':
        if (T) put(ev.task, T.col || 'todo'); else for (const [id, x] of st.tasks) if (!x.col) put(id, 'todo');
        break;
      case 'assign':
        if (T) { if (!T.col) put(ev.task, 'todo'); T.assigned = true; } else for (const [id, x] of st.tasks) { if (!x.col) put(id, 'todo'); x.assigned = true; }
        break;
      case 'start':
        if (T) { put(ev.task, 'doing'); T.assigned = true; }
        if (!st.active.has(a)) st.active.set(a, new Set());
        st.active.get(a).add(ev.task || '_');
        break;
      case 'review':
        if (T) put(ev.task, 'review');
        st.review = { task: ev.task, worker: laneOf(ev.task) || a, i };
        break;
      case 'done': case 'merge':
        if (T) put(ev.task, 'done');
        for (const set of st.active.values()) set.delete(ev.task);
        if (st.review && st.review.task === ev.task) st.review = null;
        break;
      case 'blocked': case 'decision_request':
        if (!isHuman(a) && !st.pending.some((p) => p.agent === a)) st.pending.push({ agent: a, task: ev.task, i, text: ev.text });
        break;
      case 'decision_answer': {
        const k = matchPending(st.pending, ev);
        if (k >= 0) {
          const p = st.pending.splice(k, 1)[0];
          st.answerFor = p.agent;
          if (p.agent !== a) pushLog(st, p.agent, { i, type: 'answer', text: (M.byId.get(a) || { name: a }).name + ': ' + ev.text });
        }
        break;
      }
      case 'memory':
        st.memories.push({ i, agent: a, text: ev.text });
        break;
      default: break;
    }
    pushLog(st, a, { i, type: ev.type, text: ev.text });
    st.last.set(a, i);
  }
  function frameState(t) {
    const i = TL.n ? indexAt(t) : -1;
    const st = newState();
    for (let j = 0; j < i; j++) applyEvent(st, j);
    const prevTasks = new Map(); for (const [id, x] of st.tasks) prevTasks.set(id, { col: x.col, seq: x.seq, assigned: x.assigned });
    const prevDone = st.done;
    if (i >= 0) applyEvent(st, i); else st.added = [];
    const ev = i >= 0 ? M.events[i] : null;
    const S = i >= 0 ? TL.starts[i] : 0, dur = i >= 0 ? TL.durs[i] : 1;
    return { t, i, ev, S, dur, age: t - S, st, prevTasks, prevDone };
  }
  const reviewOpen = (st, t) => !!st.review && t < TL.starts[st.review.i] + TL.durs[st.review.i] + 3;
  function currentTask(id, F) {
    const st = F.st;
    if (M.lead && id === M.lead.id && reviewOpen(st, F.t)) return st.review.task;
    const act = st.active.get(id);
    if (act && act.size) { const arr = [...act].filter((x) => x !== '_'); if (arr.length) return arr[arr.length - 1]; }
    const p = st.pending.find((q) => q.agent === id); if (p && p.task) return p.task;
    return null;
  }

  // ================================================================ canvas, camera, primitives
  const $ = (id) => document.getElementById(id);
  const ui = {};
  ['app', 'stage', 'topbar', 'side', 'bottom', 'projTitle', 'projGoal', 'ring', 'ringPct', 'taskCount', 'waiting', 'waitCount', 'clock', 'clockTz', 'liveBadge', 'agentCard', 'team',
    'capWho', 'capTag', 'capText', 'capIdx', 'controls', 'btnPrev', 'btnPlay', 'btnNext', 'scrub', 'ticks', 'scrubFill', 'scrubKnob', 'timeLabel', 'btnLive', 'libPop', 'tip', 'loading']
    .forEach((id) => { ui[id] = $(id); });
  const canvas = ui.stage, g = canvas.getContext('2d');
  const cam = { hw: 30, hh: 15, vz: 33, ox: 0, oy: 0, bx: 0, by: 0, dpr: 1, ui: 1, lw: 1, safe: { l: 0, r: 0, t: 0, b: 0 } };
  const P = (x, y, z) => [cam.ox + (x - y) * cam.hw, cam.oy + (x + y) * cam.hh - z * cam.vz];

  function fitCamera() {
    const dpr = cam.dpr, rect = ui.app.getBoundingClientRect();
    const tb = ui.topbar.getBoundingClientRect(), bt = ui.bottom.getBoundingClientRect(), sd = ui.side.getBoundingClientRect();
    const l = 16, t = tb.bottom - rect.top + 10, b = bt.top - rect.top - 8;
    let r = rect.width - 16;
    if (sd.width > 0 && sd.height > 0) r = sd.left - rect.left - 16;
    cam.safe = { l: l * dpr, r: r * dpr, t: t * dpr, b: b * dpr };
    const bFit = b + Math.min(46, bt.height * 0.5);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y, z] of [[-WT, D, 0], [-WT, D, H], [W, -WT, 0], [W, -WT, H], [-WT, -WT, H], [W, D, -BASE]]) {
      const sx = x - y, sy = (x + y) * 0.5 - z * 1.1;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const hw = Math.max(8, Math.min((r - l) / (x1 - x0), (bFit - t) / (y1 - y0)));
    cam.hw = hw * dpr; cam.hh = hw * 0.5 * dpr; cam.vz = hw * 1.1 * dpr;
    cam.bx = (l + (r - l - (x1 - x0) * hw) / 2 - x0 * hw) * dpr;
    cam.by = (t + (bFit - t - (y1 - y0) * hw) / 2 - y0 * hw) * dpr;
    cam.ui = clamp(hw / 31, 0.82, 1.45) * dpr;
    cam.lw = Math.max(1, 0.8 * dpr);
  }

  function poly(pts, fill) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = fill; g.fill(); }
  const faceMemo = new Map();
  function faces(c) {
    let f = faceMemo.get(c);
    if (!f) { f = { top: mix(c, '#ffffff', 0.14), left: c, right: mix(c, '#000000', 0.15), edge: mix(c, '#000000', 0.34) }; faceMemo.set(c, f); }
    return f;
  }
  function box(x0, y0, z0, sx, sy, sz, color, edge) {
    const x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz, f = faces(color);
    const a = P(x0, y0, z1), b = P(x1, y0, z1), c = P(x1, y1, z1), d = P(x0, y1, z1), e = P(x1, y1, z0), h = P(x0, y1, z0), k = P(x1, y0, z0);
    const hex = () => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(k[0], k[1]); g.lineTo(e[0], e[1]); g.lineTo(h[0], h[1]); g.lineTo(d[0], d[1]); g.closePath(); };
    hex(); g.fillStyle = f.left; g.fill();
    g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(b[0], b[1]); g.lineTo(k[0], k[1]); g.lineTo(e[0], e[1]); g.closePath(); g.fillStyle = f.right; g.fill();
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fillStyle = f.top; g.fill();
    if (edge !== false) { hex(); g.strokeStyle = f.edge; g.lineWidth = cam.lw; g.lineJoin = 'round'; g.stroke(); }
  }
  // Quad on a visible face of an axis-aligned box ('x' = +x face, 'y' = +y face), u/v are 0..1 fractions.
  function facePoly(p, axis, u0, u1, v0, v1, color) {
    const z0 = p.z0 + v0 * p.sz, z1 = p.z0 + v1 * p.sz;
    if (axis === 'x') { const x = p.x0 + p.sx, ya = p.y0 + u0 * p.sy, yb = p.y0 + u1 * p.sy; poly([P(x, ya, z1), P(x, yb, z1), P(x, yb, z0), P(x, ya, z0)], color); }
    else { const y = p.y0 + p.sy, xa = p.x0 + u0 * p.sx, xb = p.x0 + u1 * p.sx; poly([P(xa, y, z1), P(xb, y, z1), P(xb, y, z0), P(xa, y, z0)], color); }
  }
  function planeXZ(x0, y, z0, k) { const p = P(x0, y, z0); g.setTransform(k * cam.hw, k * cam.hh, 0, k * cam.vz, p[0], p[1]); }
  function planeYZ(x, y0, z0, k) { const p = P(x, y0, z0); g.setTransform(k * cam.hw, -k * cam.hh, 0, k * cam.vz, p[0], p[1]); }
  function planeXY(x0, y0, z, k) { const p = P(x0, y0, z); g.setTransform(k * cam.hw, k * cam.hh, -k * cam.hw, k * cam.hh, p[0], p[1]); }
  const resetT = () => g.setTransform(1, 0, 0, 1, 0, 0);
  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const fitMemo = new Map();
  function fit(text, max) {
    const key = g.font + '|' + max.toFixed(1) + '|' + text;
    let v = fitMemo.get(key);
    if (v === undefined) {
      if (g.measureText(text).width <= max) v = text;
      else {
        let lo = 0, hi = text.length;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.measureText(text.slice(0, m) + '…').width <= max) lo = m; else hi = m - 1; }
        v = text.slice(0, lo).trimEnd() + '…';
      }
      if (fitMemo.size > 5000) fitMemo.clear();
      fitMemo.set(key, v);
    }
    return v;
  }
  function wrap(text, max, maxLines) {
    const words = text.split(/\s+/).filter(Boolean), out = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const test = cur ? cur + ' ' + words[i] : words[i];
      if (!cur || g.measureText(test).width <= max) { cur = test; continue; }
      out.push(cur); cur = words[i];
      if (out.length === maxLines - 1) { cur = words.slice(i).join(' '); break; }
    }
    if (cur) out.push(cur);
    return out.slice(0, maxLines).map((l) => fit(l, max));
  }
  function star(x, y, r, color) {
    g.beginPath();
    for (let k = 0; k < 8; k++) { const ang = (k * Math.PI) / 4, rad = k % 2 ? r * 0.38 : r; g.lineTo(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad); }
    g.closePath(); g.fillStyle = color; g.fill();
  }

  // ================================================================ static furniture
  function buildItems() {
    const items = [];
    const add = (x0, y0, z0, x1, y1, z1, draw, extra) => items.push(Object.assign({ x0, y0, z0, x1, y1, z1, draw }, extra || {}));
    add(0, 0.6, 0, 0.6, 3.6, 2.62, drawShelf, { kind: 'shelf' });
    add(0.2, 4.25, 0, 0.7, 4.75, 1.36, () => drawPlant(0.45, 4.5, 1));
    add(4.25, 9.25, 0, 4.75, 9.75, 1.2, () => drawPlant(4.5, 9.5, 0.9));
    add(15.25, 9.25, 0, 15.75, 9.75, 1.36, () => drawPlant(15.5, 9.5, 1));
    add(0, 5.3, 0, 0.3, 8.7, 0.95, () => { box(0, 5.3, 0.06, 0.3, 3.4, 0.89, '#4f8f8a'); });
    add(0.3, 5.55, 0, 0.95, 8.45, 0.48, drawSofaSeat);
    add(0.3, 5.3, 0, 0.95, 5.55, 0.66, () => box(0.3, 5.3, 0.06, 0.65, 0.25, 0.6, '#4f8f8a'));
    add(0.3, 8.45, 0, 0.95, 8.7, 0.66, () => box(0.3, 8.45, 0.06, 0.65, 0.25, 0.6, '#4f8f8a'));
    add(1.25, 6.25, 0, 1.85, 7.75, 0.52, drawCoffeeTable);
    add(0, 9.05, 0, 0.78, 9.95, 1.45, drawCounter);
    add(9.12, 7.92, 0, 9.88, 8.58, 1.2, drawPodium, { kind: 'podium' });
    add(9.05, 8.95, 0, 9.95, 9.72, 0.44, () => { box(9.1, 9.0, 0.06, 0.8, 0.85, 0.32, '#3d4652'); box(9.12, 9.02, 0.38, 0.76, 0.7, 0.06, '#56616f'); });
    add(9.05, 9.72, 0, 9.95, 9.92, 1.08, () => box(9.05, 9.72, 0.06, 0.9, 0.2, 1.02, '#3d4652'));
    add(9.05, 8.98, 0.44, 9.17, 9.72, 0.66, () => box(9.05, 8.98, 0.38, 0.12, 0.74, 0.28, '#465161'));
    add(9.83, 8.98, 0.44, 9.95, 9.72, 0.66, () => box(9.83, 8.98, 0.38, 0.12, 0.74, 0.28, '#465161'));
    add(10.2, 9.2, 0, 10.65, 9.65, 0.66, () => { box(10.38, 9.38, 0, 0.08, 0.08, 0.46, '#9aa4b2', false); box(10.2, 9.2, 0.46, 0.45, 0.45, 0.05, '#d9b383'); box(10.33, 9.36, 0.51, 0.12, 0.12, 0.13, '#ffffff'); });
    for (const d of L.desks) {
      add(d.x0 + 0.04, d.y0 + 0.04, 0, d.x0 + 1.96, d.y0 + 0.96, 1.94, () => drawDesk(d), { kind: 'desk', desk: d });
      add(d.x0 + 0.72, d.y0 + 1.04, 0, d.x0 + 1.28, d.y0 + 1.55, 0.42, () => drawChairSeat(d));
      add(d.x0 + 0.74, d.y0 + 1.55, 0.42, d.x0 + 1.26, d.y0 + 1.66, 1.02, () => drawChairBack(d));
    }
    return items;
  }
  function drawPlant(x, y, s) {
    box(x - 0.19, y - 0.19, 0, 0.38, 0.38, 0.32, '#c8693a');
    box(x - 0.25, y - 0.25, 0.32, 0.5, 0.5, 0.38 * s, '#3f9a52');
    box(x - 0.17, y - 0.17, 0.32 + 0.38 * s, 0.34, 0.34, 0.28 * s, '#4caf62');
    box(x - 0.08, y - 0.08, 0.32 + 0.66 * s, 0.16, 0.16, 0.2 * s, '#62c477');
  }
  function drawSofaSeat() {
    box(0.3, 5.55, 0.06, 0.65, 2.9, 0.3, '#4f8f8a');
    box(0.3, 5.58, 0.36, 0.62, 1.42, 0.12, '#6fb0aa');
    box(0.3, 7.0, 0.36, 0.62, 1.42, 0.12, '#6fb0aa');
  }
  function drawCoffeeTable() {
    for (const [lx, ly] of [[1.3, 6.3], [1.74, 6.3], [1.3, 7.64], [1.74, 7.64]]) box(lx, ly, 0, 0.06, 0.06, 0.34, '#8b6a4a', false);
    box(1.25, 6.25, 0.34, 0.6, 1.5, 0.06, '#d9b383');
    box(1.42, 6.5, 0.4, 0.13, 0.13, 0.12, '#ffffff');
    box(1.4, 7.05, 0.4, 0.3, 0.42, 0.05, '#e05a47', false);
  }
  function drawCounter() {
    box(0, 9.05, 0, 0.75, 0.9, 0.86, '#e9e5de');
    box(0, 9.02, 0.86, 0.78, 0.96, 0.05, '#c9a878');
    box(0.06, 9.16, 0.91, 0.46, 0.44, 0.52, '#2f3640');
    box(0.52, 9.3, 0.95, 0.07, 0.18, 0.2, '#1d2229', false);
    const p = { x0: 0.06, y0: 9.16, z0: 0.91, sx: 0.46, sy: 0.44, sz: 0.52 };
    facePoly(p, 'x', 0.2, 0.36, 0.72, 0.84, '#ef4444');
    box(0.2, 9.68, 0.91, 0.13, 0.13, 0.13, '#ffffff');
  }
  function drawPodium() {
    const waiting = FR && FR.st.pending.length > 0;
    box(9.12, 7.92, 0, 0.76, 0.66, 0.08, '#a97c48');
    box(9.2, 8.0, 0.08, 0.6, 0.5, 0.86, '#f4e6c9');
    box(9.12, 7.92, 0.94, 0.76, 0.66, 0.07, '#b9874f');
    const front = { x0: 9.2, y0: 8.0, z0: 0.08, sx: 0.6, sy: 0.5, sz: 0.86 };
    facePoly(front, 'y', 0.18, 0.82, 0.45, 0.85, waiting ? '#f59e0b' : '#e7c27d');
    planeXZ(9.32, 8.501, 0.8, 1 / 60);
    g.fillStyle = waiting ? '#3b2300' : '#7a5a2a'; g.font = `800 14px ${FONT}`; g.textAlign = 'center'; g.fillText('?', 11, 13); g.textAlign = 'left';
    resetT();
    // bell
    box(9.42, 8.18, 1.01, 0.16, 0.16, 0.03, '#a07a1b', false);
    box(9.44, 8.2, 1.04, 0.12, 0.12, 0.09, waiting ? '#ffd24a' : '#e0b93e');
    box(9.48, 8.24, 1.13, 0.04, 0.04, 0.04, '#a07a1b', false);
  }
  function drawChairSeat(d) {
    const cx = d.x0 + 1, cy = d.y0 + 1.3;
    box(cx - 0.25, cy - 0.04, 0, 0.5, 0.08, 0.05, '#3a4048', false);
    box(cx - 0.04, cy - 0.25, 0, 0.08, 0.5, 0.05, '#3a4048', false);
    box(cx - 0.04, cy - 0.04, 0.05, 0.08, 0.08, 0.29, '#59616c', false);
    box(cx - 0.27, d.y0 + 1.06, 0.34, 0.54, 0.48, 0.08, '#4a525d');
  }
  function drawChairBack(d) {
    const cx = d.x0 + 1;
    box(cx - 0.03, d.y0 + 1.56, 0.42, 0.06, 0.06, 0.12, '#59616c', false);
    box(cx - 0.25, d.y0 + 1.55, 0.52, 0.5, 0.1, 0.48, d.agent ? mix(d.color, '#ffffff', 0.18) : '#8c959f');
  }
  function drawDesk(d) {
    const { x0, y0 } = d;
    box(x0 + 0.1, y0 + 0.1, 0, 0.1, 0.8, 0.66, '#d6d0c6');
    box(x0 + 1.8, y0 + 0.1, 0, 0.1, 0.8, 0.66, '#d6d0c6');
    box(x0 + 0.2, y0 + 0.12, 0.3, 1.6, 0.06, 0.36, '#e2ddd4', false);
    box(x0 + 0.04, y0 + 0.04, 0.66, 1.92, 0.92, 0.08, '#f6f2ea');
    poly([P(x0 + 0.04, y0 + 0.96, 0.725), P(x0 + 1.96, y0 + 0.96, 0.725), P(x0 + 1.96, y0 + 0.96, 0.675), P(x0 + 0.04, y0 + 0.96, 0.675)], d.color);
    box(x0 + 0.82, y0 + 0.2, 0.74, 0.36, 0.22, 0.03, '#3a414b', false);
    box(x0 + 0.96, y0 + 0.24, 0.77, 0.08, 0.06, 0.22, '#4a525e', false);
    box(x0 + 0.2, y0 + 0.16, 0.98, 1.6, 0.16, 0.96, '#3a4350');
    drawScreen(d);
    box(x0 + 0.56, y0 + 0.5, 0.74, 0.86, 0.22, 0.03, '#e6e9ed', false);
    box(x0 + 1.5, y0 + 0.55, 0.74, 0.08, 0.12, 0.025, '#d0d5db', false);
    box(x0 + 1.68, y0 + 0.36, 0.74, 0.13, 0.13, 0.15, d.agent ? d.color : '#c9d1d9');
  }

  // ---------------------------------------------------------------- desk monitor
  const monoW = new Map();
  function charW(size) { const k = size.toFixed(2); let v = monoW.get(k); if (v === undefined) { g.font = `500 ${size}px ${MONO}`; v = g.measureText('MMMMMMMMMM').width / 10; monoW.set(k, v); } return v; }
  function drawScreen(d) {
    const F = FR, k = 1 / 56, w = 81.8, h = 47.6;
    planeXZ(d.x0 + 0.27, d.y0 + 0.322, 1.89, k);
    const a = d.agent ? M.byId.get(d.agent) : null;
    const on = a ? monitorOn(a.id, F) : false;
    g.fillStyle = on ? '#0b1016' : '#4b5666'; g.fillRect(0, 0, w, h);
    if (a && on) {
      g.fillStyle = a.color; g.fillRect(0, 0, w, 7.5);
      g.font = `700 5.4px ${FONT}`; g.fillStyle = lum(a.color) > 0.6 ? '#111111' : '#ffffff';
      const task = currentTask(a.id, F);
      g.fillText(fit(a.name + (task ? ' · ' + task : ''), w - 8), 3.5, 5.6);
      const fs = 5.2, cw = charW(fs), maxC = Math.floor((w - 7) / cw);
      g.font = `500 ${fs}px ${MONO}`;
      const lines = (F.st.logs.get(a.id) || []).slice(-5);
      let y = 14.4;
      for (const ln of lines) {
        let text = (PREFIX[ln.type] || '> ') + ln.text;
        let cursor = false;
        if (ln.i === F.i) { const dur = clamp(text.length / 55, 0.45, 1.15); const nch = Math.floor(clamp(F.age / dur, 0, 1) * text.length); cursor = nch < text.length || ((F.t * 2) | 0) % 2 === 0; text = text.slice(0, nch); }
        if (text.length > maxC) text = text.slice(0, maxC - 1) + '…';
        g.fillStyle = LINE_COLOR[ln.type] || '#c9d1d9';
        g.fillText(text, 3.5, y);
        if (cursor) { g.fillStyle = '#e6edf3'; g.fillRect(3.5 + text.length * cw + 0.6, y - fs * 0.78, cw * 0.8, fs * 0.95); }
        y += 7.3;
      }
      if (F.st.pending.some((p) => p.agent === a.id)) {
        g.fillStyle = '#f59e0b'; g.fillRect(0, h - 8.5, w, 8.5);
        g.fillStyle = '#241500'; g.font = `800 5.4px ${FONT}`; g.fillText('WAITING ON YOU', 3.5, h - 2.6);
      }
      const rv = F.st.review;
      if (rv && rv.worker === a.id && M.lead && a.id !== M.lead.id && reviewOpen(F.st, F.t)) drawDiff(w, h, F.t - TL.starts[rv.i], rv.task || '');
      const st = startAge(a.id, F);
      if (st >= 0 && st < 0.45) { const p = st / 0.45; g.fillStyle = `rgba(255,255,255,${(1 - p) * 0.85})`; const bh = Math.max(1.5, h * easeOut(p)); g.fillRect(0, (h - bh) / 2, w, bh); }
    } else if (a) {
      g.fillStyle = rgba(a.color, 0.75);
      g.fillRect(w / 2 - 9, h / 2 - 4, 5, 5); g.fillRect(w / 2 - 2.5, h / 2 - 7, 5, 5); g.fillRect(w / 2 + 4, h / 2 - 3, 5, 5);
      g.font = `700 5px ${FONT}`; g.fillStyle = 'rgba(230,236,242,0.7)'; g.textAlign = 'center'; g.fillText(a.name.toUpperCase(), w / 2, h / 2 + 11); g.textAlign = 'left';
    }
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    resetT();
  }
  function startAge(id, F) {
    const ev = F.ev;
    return ev && ev.type === 'start' && ev.agent === id ? F.age : -1;
  }
  function monitorOn(id, F) {
    const act = F.st.active.get(id);
    if (act && act.size) return true;
    if (F.st.pending.some((p) => p.agent === id)) return true;
    const last = F.st.last.get(id);
    if (last !== undefined && F.t - TL.starts[last] < 9) return true;
    return !!(M.lead && id === M.lead.id);
  }
  function drawDiff(w, h, age, task) {
    const s = REDUCED ? 1 : easeBack(age / 0.32);
    if (s <= 0.01) return;
    const pw = w * 0.52, ph = h - 13, px = w - pw - 3, py = 10;
    g.save();
    g.translate(px + pw / 2, py + ph / 2); g.scale(s, s); g.translate(-(px + pw / 2), -(py + ph / 2));
    g.fillStyle = '#161b22'; g.fillRect(px, py, pw, ph);
    g.strokeStyle = '#f0b44c'; g.lineWidth = 0.9; g.strokeRect(px, py, pw, ph);
    const r = mulberry(hashStr(task) + 11);
    const adds = 8 + Math.floor(r() * 60), dels = 1 + Math.floor(r() * 14);
    g.font = `700 5.2px ${FONT}`; g.fillStyle = '#e6edf3'; g.fillText('diff ' + task, px + 3, py + 6.6);
    g.fillStyle = '#3fb950'; g.fillText('+' + adds, px + pw - 25, py + 6.6); g.fillStyle = '#f85149'; g.fillText('-' + dels, px + pw - 11, py + 6.6);
    for (let i = 0; i < 6; i++) {
      const kind = r(), y = py + 10 + i * 4.6;
      g.fillStyle = kind < 0.55 ? 'rgba(63,185,80,0.85)' : kind < 0.75 ? 'rgba(248,81,73,0.85)' : 'rgba(139,148,158,0.6)';
      g.fillRect(px + 3, y, 3, 2.4);
      g.fillRect(px + 8, y, (pw - 13) * (0.35 + r() * 0.65), 2.4);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- library shelf
  const DECOR_BOOKS = (() => {
    const r = mulberry(99), out = [], cols = ['#c9b79c', '#9fb3c8', '#b7a4c9', '#a9c2a3', '#d6b38c', '#bfc6cf'];
    let y = 0.72;
    while (y < 3.4) { const t = 0.11 + r() * 0.07; out.push({ lvl: 0, y, t, h: 0.36 + r() * 0.16, c: cols[(r() * cols.length) | 0] }); y += t + 0.012; }
    y = 0.72;
    while (y < 1.9) { const t = 0.11 + r() * 0.07; out.push({ lvl: 1, y, t, h: 0.34 + r() * 0.14, c: cols[(r() * cols.length) | 0] }); y += t + 0.012; }
    return out;
  })();
  const SHELF_Z = [0.06, 0.7, 1.34, 1.98];
  function memoryBook(idx, agentColor) {
    const r = mulberry(1000 + idx * 7919);
    const per = 13, shelfOrder = [2, 3, 1];
    const lvl = shelfOrder[Math.floor(idx / per) % 3];
    const slot = idx % per;
    let y = 3.46;
    const rr2 = mulberry(4242 + Math.floor(idx / per));
    let t = 0;
    for (let s = 0; s <= slot; s++) { t = 0.13 + rr2() * 0.05; y -= t + 0.016; }
    return { lvl, y, t, h: 0.38 + r() * 0.12, c: agentColor };
  }
  function drawBookBox(b, grow) {
    const z = SHELF_Z[b.lvl], h = b.h * grow;
    if (h <= 0.01) return;
    box(0.08, b.y, z, 0.38, b.t, h, b.c);
    const p = { x0: 0.08, y0: b.y, z0: z, sx: 0.38, sy: b.t, sz: h };
    facePoly(p, 'x', 0.18, 0.82, 0.72, 0.8, 'rgba(255,255,255,0.55)');
  }
  function drawShelf() {
    const wood = '#b98a5a', dark = '#8a6440';
    poly([P(0.04, 0.6, 0), P(0.04, 3.6, 0), P(0.04, 3.6, 2.6), P(0.04, 0.6, 2.6)], dark);
    box(0, 0.6, 0, 0.58, 0.08, 2.62, wood);
    const F = FR;
    const mems = F ? F.st.memories : [];
    const books = DECOR_BOOKS.map((b) => ({ b, grow: 1 }));
    mems.forEach((m, idx) => {
      const ag = M.byId.get(m.agent);
      const isNew = F.ev && F.ev.type === 'memory' && m.i === F.i;
      books.push({ b: memoryBook(idx, ag ? ag.color : '#0f6cbd'), grow: isNew && !REDUCED ? easeBack(F.age / 0.45) : 1, mem: true });
    });
    for (let lvl = 0; lvl < 4; lvl++) {
      box(0.04, 0.68, SHELF_Z[lvl] - 0.06, 0.54, 2.84, 0.06, wood, false);
      books.filter((o) => o.b.lvl === lvl).sort((p, q) => p.b.y - q.b.y).forEach((o) => drawBookBox(o.b, o.grow));
      if (lvl === 2) { box(0.14, 0.78, SHELF_Z[2], 0.3, 0.3, 0.06, '#6e7781', false); box(0.2, 0.84, SHELF_Z[2] + 0.06, 0.18, 0.18, 0.2, '#3d8bd4'); }
      if (lvl === 3) { box(0.12, 0.8, SHELF_Z[3], 0.34, 0.42, 0.22, '#d9cbb5'); }
    }
    box(0, 0.6, 2.56, 0.6, 3.0, 0.06, wood);
    box(0, 3.52, 0, 0.58, 0.08, 2.62, wood);
  }

  // ================================================================ room shell & wall art
  function drawBackdrop() {
    const cw = canvas.width, ch = canvas.height;
    const gr = g.createLinearGradient(0, 0, 0, ch);
    gr.addColorStop(0, '#f8fafd'); gr.addColorStop(1, '#ebf0f6');
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    const c = P(W / 2, D / 2, -BASE), rx = (W + D) * 0.55 * cam.hw, ry = (W + D) * 0.3 * cam.hh;
    g.save(); g.translate(c[0], c[1] + 26 * cam.ui); g.scale(1, ry / rx);
    const rg = g.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
    rg.addColorStop(0, 'rgba(56,72,98,0.20)'); rg.addColorStop(1, 'rgba(56,72,98,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawShell() {
    poly([P(0, 0, 0), P(0, D, 0), P(0, D, H), P(0, 0, H)], '#ece6dc');
    poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, H), P(0, 0, H)], '#f8f5ef');
    poly([P(0, 0, 0), P(0, D, 0), P(0, D, 0.85), P(0, 0, 0.85)], '#e4dccf');
    poly([P(0, 0, 0), P(W, 0, 0), P(W, 0, 0.85), P(0, 0, 0.85)], '#f0eadf');
    g.beginPath();
    for (const [a, b] of [[P(0, 0, 0.85), P(0, D, 0.85)], [P(0, 0, 0.85), P(W, 0, 0.85)]]) { g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.strokeStyle = 'rgba(150,120,80,0.25)'; g.lineWidth = cam.lw; g.stroke();
    poly([P(-WT, -WT, H), P(W, -WT, H), P(W, 0, H), P(0, 0, H), P(0, D, H), P(-WT, D, H)], '#d3c7b6');
    poly([P(W, -WT, -BASE), P(W, 0, -BASE), P(W, 0, H), P(W, -WT, H)], '#c4b6a2');
    poly([P(-WT, D, -BASE), P(0, D, -BASE), P(0, D, H), P(-WT, D, H)], '#dbcfbe');
    poly([P(0, D, 0), P(W, D, 0), P(W, D, -BASE), P(0, D, -BASE)], '#c99f6c');
    poly([P(W, 0, 0), P(W, D, 0), P(W, D, -BASE), P(W, 0, -BASE)], '#b0865a');
    poly([P(0, D, 0), P(W, D, 0), P(W, D, -0.07), P(0, D, -0.07)], '#dcb787');
    poly([P(W, 0, 0), P(W, D, 0), P(W, D, -0.07), P(W, 0, -0.07)], '#c79d6c');
    poly([P(0, 0, 0), P(W, 0, 0), P(W, D, 0), P(0, D, 0)], '#e8c597');
    const tones = ['#ebc99b', '#e4bf8d', '#efd3aa'];
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (const pl of L.planks) {
        if (pl[4] !== k) continue;
        const a = P(pl[0], pl[2], 0), b = P(pl[1], pl[2], 0), c = P(pl[1], pl[3], 0), d = P(pl[0], pl[3], 0);
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
      }
      g.fillStyle = tones[k]; g.fill();
    }
    g.beginPath();
    for (const pl of L.planks) { if (pl[0] <= 0) continue; const a = P(pl[0], pl[2], 0), d = P(pl[0], pl[3], 0); g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); }
    for (let row = 1; row < D * 2; row++) { const a = P(0, row / 2, 0), b = P(W, row / 2, 0); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.strokeStyle = 'rgba(120,80,40,0.15)'; g.lineWidth = cam.lw; g.stroke();
    box(0, 0, 0, 0.06, D, 0.16, '#e0d3bf', false);
    box(0, 0, 0, W, 0.06, 0.16, '#ece2d2', false);
  }
  function floorQuad(x0, y0, x1, y1, fill) { poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], fill); }
  function drawDecals() {
    floorQuad(0.15, 5.05, 3.85, 9.95, '#efc9b6'); floorQuad(0.3, 5.2, 3.7, 9.8, '#f6dccd');
    floorQuad(0.7, 0.75, 2.7, 3.45, '#cfdff0'); floorQuad(0.8, 0.85, 2.6, 3.35, '#e1ecf8');
    floorQuad(7.95, 6.95, 11.05, 9.97, '#efc66f'); floorQuad(8.08, 7.08, 10.92, 9.84, '#fdf1d6');
    const sh = 'rgba(92,60,28,0.10)';
    for (const d of L.desks) floorQuad(d.x0 - 0.02, d.y0 + 0.02, d.x0 + 2.04, d.y0 + 1.06, sh);
    floorQuad(-0.02, 0.58, 0.68, 3.66, sh); floorQuad(-0.02, 5.25, 1.02, 8.78, sh); floorQuad(1.2, 6.2, 1.92, 7.82, sh);
    floorQuad(-0.02, 9.0, 0.84, 9.99, sh); floorQuad(9.06, 7.88, 9.94, 8.64, sh); floorQuad(9.0, 8.92, 10.0, 9.99, sh);
    planeXY(8.25, 9.66, 0, 1 / 40);
    g.font = `800 11px ${FONT}`; g.fillStyle = 'rgba(167,91,0,0.55)'; g.fillText('DECISION PODIUM', 0, 0);
    resetT();
    planeXY(1.0, 9.72, 0, 1 / 40);
    g.font = `800 10px ${FONT}`; g.fillStyle = 'rgba(160,82,52,0.5)'; g.fillText('LOUNGE', 0, 0);
    resetT();
  }
  function drawWallArt(F) {
    // clock showing the event's own local time
    const ck = F.ev && F.ev.clock;
    planeXZ(0.72, 0.012, 3.78, 1 / 40);
    g.beginPath(); g.arc(21, 21, 20, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#4b5563'; g.stroke();
    g.fillStyle = '#6e7781';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(21 + Math.sin(a) * 15.5 - 0.9, 21 - Math.cos(a) * 15.5 - 0.9, 1.8, 1.8); }
    if (ck) {
      const ma = (ck.m / 60) * Math.PI * 2, ha = (((ck.h % 12) + ck.m / 60) / 12) * Math.PI * 2;
      g.lineCap = 'round'; g.strokeStyle = '#1f2328';
      g.lineWidth = 2.6; g.beginPath(); g.moveTo(21, 21); g.lineTo(21 + Math.sin(ha) * 9, 21 - Math.cos(ha) * 9); g.stroke();
      g.lineWidth = 1.7; g.beginPath(); g.moveTo(21, 21); g.lineTo(21 + Math.sin(ma) * 14, 21 - Math.cos(ma) * 14); g.stroke();
      g.lineCap = 'butt';
    }
    g.fillStyle = '#0f6cbd'; g.beginPath(); g.arc(21, 21, 2, 0, Math.PI * 2); g.fill();
    if (ck && ck.off) { g.font = `700 6.5px ${FONT}`; g.fillStyle = '#8c959f'; g.textAlign = 'center'; g.fillText('UTC' + ck.off, 21, 50); g.textAlign = 'left'; }
    resetT();
    // poster
    planeXZ(0.4, 0.012, 2.62, 1 / 40);
    g.fillStyle = '#2d333b'; g.fillRect(0, 0, 66, 62); g.fillStyle = '#eef5fc'; g.fillRect(3, 3, 60, 56);
    g.font = `800 7.5px ${FONT}`;
    [['PLAN', '#0f6cbd'], ['BUILD', '#2ea44f'], ['REVIEW', '#c27803'], ['SHIP', '#b42318']].forEach(([w2, c], i) => {
      g.fillStyle = c; g.fillRect(9, 11 + i * 12, 6, 6); g.fillStyle = '#24292f'; g.fillText(w2, 19, 17 + i * 12);
    });
    resetT();
    // library sign
    const mems = F.st.memories.length;
    planeYZ(0.012, 3.5, 3.25, 1 / 40);
    g.fillStyle = '#ffffff'; rr(0, 0, 118, 26, 4); g.fill(); g.strokeStyle = '#d0c4b0'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#5b4632'; g.font = `800 11px ${FONT}`; g.fillText('LIBRARY', 7, 12.5);
    g.font = `600 7.5px ${FONT}`; g.fillStyle = '#8c7a66'; g.fillText(mems === 1 ? '1 memory' : mems + ' memories', 7, 21.5);
    resetT();
    drawGoalBanner(F);
  }
  function drawGoalBanner(F) {
    const w = 224, h = 92, total = M.tasks.length;
    planeYZ(0.012, 9.75, 4.0, 1 / 40);
    g.strokeStyle = '#9aa4b2'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(18, 0); g.lineTo(30, -12); g.lineTo(42, 0); g.moveTo(w - 42, 0); g.lineTo(w - 30, -12); g.lineTo(w - 18, 0); g.stroke();
    rr(0, 0, w, h, 6); g.fillStyle = '#0f6cbd'; g.fill();
    g.fillStyle = '#0b5aa0'; g.fillRect(0, h - 8, w, 8);
    g.fillStyle = 'rgba(255,255,255,0.72)'; g.font = `800 8px ${FONT}`; g.fillText('PROJECT GOAL', 12, 17);
    g.fillStyle = '#ffffff'; g.font = `800 15px ${FONT}`;
    const lines = wrap(M.project.title, w - 92, 2);
    lines.forEach((l, i) => g.fillText(l, 12, 36 + i * 17));
    const done = lerp(F.prevDone, F.st.done, smooth(F.age / 0.8));
    g.font = `600 8.5px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(Math.round(done) + ' of ' + total + ' tasks done', 12, h - 16);
    const cx = w - 40, cy = h / 2 - 2, r = 24, pct = total ? done / total : 0;
    g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    if (pct > 0) { g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); g.stroke(); g.lineCap = 'butt'; }
    g.fillStyle = '#ffffff'; g.font = `800 12px ${FONT}`; g.textAlign = 'center'; g.fillText(Math.round(pct * 100) + '%', cx, cy + 4); g.textAlign = 'left';
    resetT();
  }

  // ---------------------------------------------------------------- Task Wall
  function layoutCards(tasks) {
    const out = new Map(), cols = [[], [], [], []];
    for (const [id, x] of tasks) { const c = COLS.indexOf(x.col); if (c >= 0) cols[c].push([id, x.seq, M.taskById.get(id).idx]); }
    cols.forEach((arr, c) => {
      arr.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
      const n = arr.length, x0 = 6 + c * (CW + 6) + 5, cw = CW - 10, top = 27, avail = BH - 37;
      let mode, per = 1, h, gap;
      if (n <= 2) { mode = 0; h = 38; gap = 4; }
      else if (n === 3) { mode = 3; h = 26.5; gap = 3; }
      else if (n <= 6) { mode = 1; h = 13; gap = 1.6; }
      else { mode = 2; per = n <= 12 ? 2 : 3; gap = 2; const rows = Math.ceil(n / per); h = Math.min(13, (avail - (rows - 1) * gap) / rows); }
      const w = (cw - (per - 1) * 3) / per;
      arr.forEach(([id], k) => { const row = Math.floor(k / per), q = k % per; out.set(id, { x: x0 + q * (w + 3), y: top + row * (h + gap), w, h, mode, col: c }); });
    });
    return out;
  }
  function drawTaskWall(F) {
    planeXZ(BX0, 0.012, BZ0, BK);
    g.fillStyle = '#6e7781'; g.font = `800 10px ${FONT}`; g.fillText('TASK WALL', 2, -5);
    if (M.project.repo) { g.font = `600 8.5px ${FONT}`; g.fillStyle = '#8c959f'; g.textAlign = 'right'; g.fillText(fit(M.project.repo, 320), BW - 2, -5); g.textAlign = 'left'; }
    rr(-4, -4, BW + 8, BH + 8, 7); g.fillStyle = '#c3ccd6'; g.fill();
    rr(-1.5, -1.5, BW + 3, BH + 3, 6); g.fillStyle = '#ffffff'; g.fill();
    const counts = [0, 0, 0, 0];
    for (const [, x] of F.st.tasks) { const c = COLS.indexOf(x.col); if (c >= 0) counts[c]++; }
    for (let c = 0; c < 4; c++) {
      const x = 6 + c * (CW + 6);
      rr(x, 6, CW, BH - 12, 5); g.fillStyle = '#f4f6f8'; g.fill();
      g.fillStyle = COL_TINT[c]; g.beginPath(); g.arc(x + 10, 15.5, 3.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#24292f'; g.font = `800 10.5px ${FONT}`; g.fillText(COL_LABEL[c], x + 17, 19.3);
      const s = String(counts[c]); g.font = `800 9px ${FONT}`;
      const tw = g.measureText(s).width + 10;
      rr(x + CW - tw - 6, 9.6, tw, 12, 6); g.fillStyle = counts[c] ? mix(COL_TINT[c], '#ffffff', 0.82) : '#e6eaef'; g.fill();
      g.fillStyle = counts[c] ? COL_TINT[c] : '#8c959f'; g.textAlign = 'center'; g.fillText(s, x + CW - 6 - tw / 2, 18.8); g.textAlign = 'left';
    }
    const A = layoutCards(F.prevTasks), B = layoutCards(F.st.tasks);
    const e = smooth(F.age / 0.75);
    const list = [];
    const addedOrder = new Map(F.st.added.map((id, k) => [id, k]));
    for (const [id, rb] of B) {
      const ra = A.get(id);
      let r = rb, alpha = 1, scale = 1, moving = false;
      if (ra && (ra.x !== rb.x || ra.y !== rb.y || ra.w !== rb.w || ra.h !== rb.h)) {
        r = { x: lerp(ra.x, rb.x, e), y: lerp(ra.y, rb.y, e), w: lerp(ra.w, rb.w, e), h: lerp(ra.h, rb.h, e), mode: e < 0.5 ? ra.mode : rb.mode, col: rb.col };
        moving = ra.col !== rb.col && e < 1;
      } else if (!ra) {
        const delay = (addedOrder.get(id) || 0) * 0.09, a = clamp((F.age - delay) / 0.35, 0, 1);
        alpha = a; scale = 0.7 + 0.3 * easeBack(a);
      }
      if (alpha > 0) list.push({ id, r, alpha, scale, moving });
    }
    list.sort((p, q) => (p.moving ? 1 : 0) - (q.moving ? 1 : 0));
    for (const it of list) drawCard(it, F);
    resetT();
  }
  function cardScreenPos(F, id) {
    const r = layoutCards(F.st.tasks).get(id); if (!r) return null;
    return P(BX0 + (r.x + r.w / 2) * BK, 0, BZ0 - (r.y + r.h / 2) * BK);
  }
  function drawCard(it, F) {
    const r = it.r, T = M.taskById.get(it.id), x = F.st.tasks.get(it.id);
    const lane = T.lane ? M.byId.get(T.lane) : null, laneColor = lane ? lane.color : '#8c959f';
    const done = x.col === 'done';
    const hl = F.ev && F.ev.task === it.id && F.age < F.dur;
    const actor = F.ev ? M.byId.get(F.ev.agent) : null;
    g.save();
    g.globalAlpha = it.alpha;
    if (it.scale !== 1) { const cx = r.x + r.w / 2, cy = r.y + r.h / 2; g.translate(cx, cy); g.scale(it.scale, it.scale); g.translate(-cx, -cy); }
    if (it.moving) { rr(r.x + 1, r.y + 3, r.w, r.h, 3.5); g.fillStyle = 'rgba(31,35,40,0.16)'; g.fill(); }
    rr(r.x, r.y + 1, r.w, r.h, 3.5); g.fillStyle = 'rgba(31,35,40,0.08)'; g.fill();
    rr(r.x, r.y, r.w, r.h, 3.5); g.fillStyle = done ? '#f1faf3' : '#ffffff'; g.fill();
    g.lineWidth = hl ? 1.8 : 0.8; g.strokeStyle = hl && actor ? actor.color : done ? '#b7e1c1' : '#d0d7de'; g.stroke();
    g.save(); rr(r.x, r.y, r.w, r.h, 3.5); g.clip(); g.fillStyle = laneColor; g.fillRect(r.x, r.y, r.mode === 2 ? 3 : 3.8, r.h); g.restore();
    const av = (ax, ay, s) => {
      if (!x.assigned || !lane) return;
      rr(ax, ay, s, s, s * 0.28); g.fillStyle = lane.color; g.fill();
      g.fillStyle = lum(lane.color) > 0.6 ? '#111' : '#fff'; g.font = `800 ${s * 0.68}px ${FONT}`; g.textAlign = 'center';
      g.fillText(lane.name.charAt(0).toUpperCase(), ax + s / 2, ay + s * 0.76); g.textAlign = 'left';
    };
    if (r.mode === 0 || r.mode === 3) {
      const full = r.mode === 0;
      g.fillStyle = '#1f2328'; g.font = `800 ${full ? 10.5 : 10}px ${FONT}`; g.fillText(it.id, r.x + 8, r.y + 11.5);
      if (done) { const iw = g.measureText(it.id).width; g.fillStyle = '#1a7f37'; g.fillText('✓', r.x + 12 + iw, r.y + 11.5); }
      av(r.x + r.w - 13.5, r.y + 3, 10.5);
      g.fillStyle = '#3d444d'; g.font = `600 ${full ? 9.4 : 9}px ${FONT}`;
      if (full) wrap(T.title, r.w - 13, 2).forEach((l, k) => g.fillText(l, r.x + 8, r.y + 23.5 + k * 10.5));
      else g.fillText(fit(T.title, r.w - 13), r.x + 8, r.y + 22);
    } else if (r.mode === 1) {
      g.fillStyle = '#1f2328'; g.font = `800 9px ${FONT}`; g.fillText(it.id, r.x + 7, r.y + 9.4);
      const iw = g.measureText(it.id).width;
      g.fillStyle = '#3d444d'; g.font = `600 8.4px ${FONT}`; g.fillText(fit(T.title, r.w - iw - 22), r.x + 10 + iw, r.y + 9.4);
      av(r.x + r.w - 10.5, r.y + 2.5, 8);
    } else {
      g.fillStyle = done ? '#1a7f37' : '#1f2328'; g.font = `800 ${Math.min(9, r.h * 0.7)}px ${FONT}`;
      g.fillText((done ? '✓ ' : '') + it.id, r.x + 6, r.y + r.h * 0.7);
      if (x.assigned && lane) { g.fillStyle = lane.color; g.beginPath(); g.arc(r.x + r.w - 6, r.y + r.h / 2, 2.6, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }

  // ================================================================ characters
  function lookOf(a) {
    if (a.look) return a.look;
    a.look = a.kind === 'human'
      ? { human: true, head: '#f2c9a8', hair: '#3b2b25', body: a.color, arm: mix(a.color, '#000000', 0.08), hand: '#f2c9a8', leg: '#2f3d58' }
      : { human: false, head: '#eef1f5', visor: '#1f2937', eye: '#7fe7ff', body: a.color, arm: mix(a.color, '#000000', 0.12), hand: '#cfd6de', leg: '#4b5563', tip: a === M.lead ? '#f2c94c' : a.color };
    return a.look;
  }
  function agentsAt(F) {
    const out = [], t = F.t;
    if (SIM) {
      const kf = clamp(t / DT, 0, SIM.n - 1.001), k0 = Math.floor(kf), u = kf - k0, kn = u < 0.5 ? k0 : k0 + 1;
      for (const s of SIM.sims) {
        const x = lerp(s.xs[k0], s.xs[k0 + 1], u), y = lerp(s.ys[k0], s.ys[k0 + 1], u), dist = lerp(s.ds[k0], s.ds[k0 + 1], u);
        const pose = s.ps[kn], face = s.fs[kn];
        const desk = L.deskOf.get(s.id);
        const atDesk = pose === SIT && desk && Math.abs(x - desk.seat[0]) < 0.05 && Math.abs(y - desk.seat[1]) < 0.05;
        const busy = atDesk && monitorOn(s.id, F);
        out.push({ a: s.a, x, y, pose, face, ph: (dist * Math.PI * 2) / 0.92, t, seed: s.a.seed, typing: busy && ((t + s.a.seed) % 3.4) < 2.6, raise: pose === POINT, atDesk });
      }
    }
    if (M.human) {
      const ev = F.ev, answering = ev && ev.agent === M.human.id && ev.type === 'decision_answer' && F.age < 1.9;
      out.push({ a: M.human, x: HUMAN_SEAT[0], y: HUMAN_SEAT[1], pose: SIT, face: NY, ph: 0, t, seed: M.human.seed, typing: false, raise: answering, atDesk: false });
    }
    return out;
  }
  function charItem(c) {
    const seated = c.pose === SIT || c.pose === SOFA;
    const hr = seated ? 0.3 : 0.36, hf = 0.2, alongX = FACE[c.face][0] !== 0;
    const hx = alongX ? hf : hr, hy = alongX ? hr : hf;
    return { x0: c.x - hx, x1: c.x + hx, y0: c.y - hy, y1: c.y + hy, z0: seated ? (c.pose === SOFA ? 0.48 : 0.42) : 0, z1: 1.72, draw: () => drawAgent(c), c };
  }
  function drawAgent(s) {
    const look = lookOf(s.a), fv = FACE[s.face], fx = fv[0], fy = fv[1], rx = -fy, ry = fx;
    const parts = [];
    const add = (lr, fw, z0, w, d, h, color, mark) => {
      const cx = s.x + rx * lr + fx * fw, cy = s.y + ry * lr + fy * fw;
      const sx = fx !== 0 ? d : w, sy = fx !== 0 ? w : d;
      parts.push({ x0: cx - sx / 2, y0: cy - sy / 2, z0, sx, sy, sz: h, color, mark, k: cx + cy + (z0 + h / 2) * 0.8 });
    };
    const seated = s.pose === SIT || s.pose === SOFA, seatZ = s.pose === SOFA ? 0.48 : 0.42;
    let base, swing = 0;
    if (seated) {
      add(-0.105, 0.2, seatZ - 0.02, 0.15, 0.42, 0.14, look.leg); add(0.105, 0.2, seatZ - 0.02, 0.15, 0.42, 0.14, look.leg);
      add(-0.105, 0.38, 0, 0.15, 0.15, seatZ - 0.02, look.leg); add(0.105, 0.38, 0, 0.15, 0.15, seatZ - 0.02, look.leg);
      base = seatZ;
    } else {
      let bob = 0;
      if (s.pose === WALK) { swing = Math.sin(s.ph); if (!REDUCED) bob = Math.abs(Math.cos(s.ph)) * 0.03; }
      else if (!REDUCED) bob = Math.sin(s.t * 2.1 + s.seed) * 0.006;
      add(-0.105, swing * 0.11, Math.max(0, swing) * 0.03, 0.15, 0.17, 0.5, look.leg);
      add(0.105, -swing * 0.11, Math.max(0, -swing) * 0.03, 0.15, 0.17, 0.5, look.leg);
      base = 0.5 + bob;
    }
    add(0, 0, base, 0.46, 0.28, 0.5, look.body, 'torso');
    const sh = base + 0.5;
    if (seated && s.typing) {
      const j1 = REDUCED ? 0 : Math.sin(s.t * 26 + s.seed) * 0.014, j2 = REDUCED ? 0 : Math.sin(s.t * 23 + s.seed + 2) * 0.014;
      add(-0.29, 0.02, sh - 0.3, 0.12, 0.14, 0.3, look.arm); add(0.29, 0.02, sh - 0.3, 0.12, 0.14, 0.3, look.arm);
      add(-0.27, 0.22, sh - 0.33 + j1, 0.12, 0.32, 0.1, look.arm); add(0.27, 0.22, sh - 0.33 + j2, 0.12, 0.32, 0.1, look.arm);
      add(-0.27, 0.42, sh - 0.33 + j1, 0.11, 0.09, 0.09, look.hand); add(0.27, 0.42, sh - 0.33 + j2, 0.11, 0.09, 0.09, look.hand);
    } else {
      const as = s.pose === WALK ? -swing * 0.1 : 0;
      add(-0.29, -as, sh - 0.42, 0.12, 0.15, 0.42, look.arm); add(-0.29, -as, sh - 0.5, 0.12, 0.13, 0.08, look.hand);
      if (s.raise) { const wave = REDUCED ? 0 : Math.sin(s.t * 7) * 0.03; add(0.29, 0.04 + wave, sh - 0.02, 0.12, 0.15, 0.42, look.arm); add(0.29, 0.04 + wave, sh + 0.4, 0.12, 0.13, 0.09, look.hand); }
      else { add(0.29, as, sh - 0.42, 0.12, 0.15, 0.42, look.arm); add(0.29, as, sh - 0.5, 0.12, 0.13, 0.08, look.hand); }
    }
    add(0, 0, sh, 0.46, 0.44, 0.42, look.head, 'head');
    if (look.human) { add(0, -0.01, sh + 0.37, 0.5, 0.48, 0.09, look.hair); add(0, -0.235, sh + 0.08, 0.5, 0.05, 0.32, look.hair); }
    else { add(0, -0.06, sh + 0.42, 0.05, 0.05, 0.13, '#9aa4b2'); add(0, -0.06, sh + 0.55, 0.11, 0.11, 0.1, look.tip); }
    parts.sort((p, q) => p.k - q.k);
    for (const p of parts) {
      box(p.x0, p.y0, p.z0, p.sx, p.sy, p.sz, p.color);
      if (p.mark === 'head') headMarks(p, s, look);
      else if (p.mark === 'torso' && s.a === M.lead && (s.face === PY || s.face === PX)) facePoly(p, s.face === PY ? 'y' : 'x', 0.6, 0.8, 0.58, 0.78, '#f2c94c');
    }
  }
  function headMarks(p, s, look) {
    const front = s.face === PY ? 'y' : s.face === PX ? 'x' : null;
    const back = s.face === NY ? 'y' : s.face === NX ? 'x' : null;
    const blink = !REDUCED && ((s.t * 0.8 + (s.seed % 7)) % 4.3) < 0.14;
    if (front) {
      if (look.human) {
        facePoly(p, front, 0, 1, 0.8, 1, look.hair);
        facePoly(p, front, 0.22, 0.36, blink ? 0.47 : 0.42, 0.55, '#2b2523'); facePoly(p, front, 0.64, 0.78, blink ? 0.47 : 0.42, 0.55, '#2b2523');
        facePoly(p, front, 0.4, 0.6, 0.2, 0.27, '#b86b55');
      } else {
        facePoly(p, front, 0.08, 0.92, 0.3, 0.68, look.visor);
        facePoly(p, front, 0.2, 0.37, blink ? 0.46 : 0.4, blink ? 0.5 : 0.58, look.eye); facePoly(p, front, 0.63, 0.8, blink ? 0.46 : 0.4, blink ? 0.5 : 0.58, look.eye);
      }
    }
    if (back) {
      if (look.human) facePoly(p, back, 0, 1, 0.22, 1, look.hair);
      else facePoly(p, back, 0.3, 0.7, 0.34, 0.62, mix(look.head, '#000000', 0.13));
    }
    if (look.human) facePoly(p, s.face === PY || s.face === NY ? 'x' : 'y', 0, 1, 0.66, 1, look.hair);
  }
  function drawShadows(chars) {
    for (const c of chars) {
      if (c.pose === SIT && c.atDesk) continue;
      const p = P(c.x, c.y, 0);
      g.save(); g.translate(p[0], p[1]); g.scale(1, 0.5);
      g.beginPath(); g.arc(0, 0, cam.hw * 0.5, 0, Math.PI * 2); g.fillStyle = 'rgba(70,45,20,0.16)'; g.fill();
      g.restore();
    }
  }
  function drawSelection(chars, selId) {
    const c = chars.find((o) => o.a.id === selId); if (!c) return;
    const p = P(c.x, c.y, 0);
    g.save(); g.translate(p[0], p[1]); g.scale(1, 0.5);
    g.beginPath(); g.arc(0, 0, cam.hw * 0.62, 0, Math.PI * 2); g.lineWidth = 2.4 * cam.dpr; g.strokeStyle = rgba(c.a.color, 0.85); g.stroke();
    g.restore();
  }

  // ================================================================ depth-sorted drawing
  function behind(a, b) {
    const e = 1e-4;
    if (a.x1 <= b.x0 + e) return true; if (b.x1 <= a.x0 + e) return false;
    if (a.y1 <= b.y0 + e) return true; if (b.y1 <= a.y0 + e) return false;
    if (a.z1 <= b.z0 + e) return true; if (b.z1 <= a.z0 + e) return false;
    return a.x0 + a.x1 + a.y0 + a.y1 < b.x0 + b.x1 + b.y0 + b.y1;
  }
  function drawSorted(items) {
    for (const it of items) {
      it.sx0 = cam.ox + (it.x0 - it.y1) * cam.hw; it.sx1 = cam.ox + (it.x1 - it.y0) * cam.hw;
      it.sy0 = cam.oy + (it.x0 + it.y0) * cam.hh - it.z1 * cam.vz; it.sy1 = cam.oy + (it.x1 + it.y1) * cam.hh - it.z0 * cam.vz;
      it.deps = null; it.seen = false;
    }
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (a.sx1 <= b.sx0 || b.sx1 <= a.sx0 || a.sy1 <= b.sy0 || b.sy1 <= a.sy0) continue;
        if (behind(a, b)) (b.deps || (b.deps = [])).push(a); else (a.deps || (a.deps = [])).push(b);
      }
    }
    const visit = (it) => { if (it.seen) return; it.seen = true; if (it.deps) for (const d of it.deps) visit(d); it.draw(it); };
    items.slice().sort((a, b) => a.x0 + a.x1 + a.y0 + a.y1 - (b.x0 + b.x1 + b.y0 + b.y1)).forEach(visit);
  }

  // ================================================================ overlays (screen space)
  function headPoint(c, dz) {
    const seated = c.pose === SIT || c.pose === SOFA;
    return P(c.x, c.y, (seated ? (c.pose === SOFA ? 0.48 : 0.42) + 1.0 : 1.5) + 0.25 + (dz || 0));
  }
  function plateOf(c) {
    const s = cam.ui, lead = c.a === M.lead, human = c.a.kind === 'human';
    const seatedDesk = c.pose === SIT && c.atDesk;
    const p = human ? P(c.x + 0.35, c.y + 0.75, 0) : seatedDesk ? P(c.x + 0.28, c.y + 0.42, 0.3) : P(c.x + 0.24, c.y + 0.24, 0);
    const label = (lead ? '★ ' : '') + c.a.name + (human ? ' · you' : '');
    g.font = `700 ${10.5 * s}px ${FONT}`;
    const pw = g.measureText(label).width + 19 * s, ph = 16 * s;
    return { c, label, x: p[0] - pw / 2, y: p[1] + 2 * s, w: pw, h: ph };
  }
  function drawPlate(r) {
    const s = cam.ui, c = r.c;
    g.font = `700 ${10.5 * s}px ${FONT}`;
    rr(r.x, r.y, r.w, r.h, r.h / 2); g.fillStyle = 'rgba(255,255,255,0.93)'; g.fill();
    g.lineWidth = 1.2 * cam.dpr; g.strokeStyle = rgba(c.a.color, 0.7); g.stroke();
    g.fillStyle = c.a.color; g.beginPath(); g.arc(r.x + 8 * s, r.y + r.h / 2, 3.2 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1f2328'; g.textBaseline = 'middle'; g.fillText(r.label, r.x + 14 * s, r.y + r.h / 2 + 0.5 * s); g.textBaseline = 'alphabetic';
  }
  // Lay name plates out top to bottom, nudging any that would overlap an earlier one.
  function layoutPlates(chars) {
    const rects = chars.map(plateOf).sort((a, b) => a.y - b.y || a.x - b.x), placed = [], gap = 2 * cam.dpr;
    for (const r of rects) {
      for (let k = 0; k < 8; k++) {
        const hit = placed.find((o) => r.x < o.x + o.w + gap && r.x + r.w + gap > o.x && r.y < o.y + o.h + gap && r.y + r.h + gap > o.y);
        if (!hit) break;
        r.y = hit.y + hit.h + gap;
      }
      placed.push(r);
    }
    return placed;
  }
  function bang(c, since, t) {
    const s = cam.ui, hp = headPoint(c, 0.32), age = t - since;
    const bob = REDUCED ? 0 : Math.sin(t * 4.2) * 2.6 * s;
    const pop = REDUCED ? 1 : easeBack(age / 0.35);
    if (!REDUCED && age < 1.8) {
      for (let k = 0; k < 2; k++) {
        const a = (age - k * 0.55) / 1.1;
        if (a > 0 && a < 1) { g.beginPath(); g.arc(hp[0], hp[1] + bob, (15 + 26 * a) * s, 0, Math.PI * 2); g.lineWidth = 2.4 * s * (1 - a) + 0.5; g.strokeStyle = `rgba(245,158,11,${(1 - a) * 0.8})`; g.stroke(); }
      }
    }
    const w = 24 * s * pop, h = 28 * s * pop, x = hp[0] - w / 2, y = hp[1] - h / 2 + bob;
    g.save(); g.shadowColor = 'rgba(120,60,0,0.35)'; g.shadowBlur = 8 * s; g.shadowOffsetY = 2 * s;
    rr(x, y, w, h, 7 * s * pop); g.fillStyle = '#f59e0b'; g.fill(); g.restore();
    rr(x, y, w, h, 7 * s * pop); g.lineWidth = 1.6 * s; g.strokeStyle = '#b45309'; g.stroke();
    g.beginPath(); g.moveTo(hp[0] - 5 * s * pop, y + h - 0.5); g.lineTo(hp[0], y + h + 6 * s * pop); g.lineTo(hp[0] + 5 * s * pop, y + h - 0.5); g.closePath(); g.fillStyle = '#f59e0b'; g.fill();
    g.fillStyle = '#ffffff'; g.font = `900 ${20 * s * pop}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', hp[0], y + h / 2 + 1 * s); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  function bubble(px, py, text, style, alpha) {
    if (alpha <= 0.01) return;
    const s = cam.ui, maxW = 236 * s, padX = 10 * s, padY = 8 * s, lh = 16 * s, labelH = style.label ? 13 * s : 0;
    g.font = `600 ${12.5 * s}px ${FONT}`;
    const lines = wrap(text, maxW, 3);
    let w = 0; for (const l of lines) w = Math.max(w, g.measureText(l).width);
    if (style.label) { g.font = `800 ${8.5 * s}px ${FONT}`; w = Math.max(w, g.measureText(style.label).width); }
    const bw = w + padX * 2, bh = lines.length * lh + padY * 2 + labelH - 3 * s, tail = 8 * s;
    const want = style.lean < 0 ? px - bw + 30 * s : px - bw / 2;
    const bx = clamp(want, cam.safe.l, Math.max(cam.safe.l, cam.safe.r - bw)), by = Math.max(cam.safe.t + 4 * s, py - bh - tail);
    const tx = clamp(px, bx + 14 * s, bx + bw - 14 * s), r = 9 * s;
    g.save(); g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo(bx + r, by); g.arcTo(bx + bw, by, bx + bw, by + bh, r); g.arcTo(bx + bw, by + bh, bx, by + bh, r);
    g.lineTo(tx + 7 * s, by + bh); g.lineTo(tx, by + bh + tail); g.lineTo(tx - 7 * s, by + bh);
    g.arcTo(bx, by + bh, bx, by, r); g.arcTo(bx, by, bx + bw, by, r); g.closePath();
    g.shadowColor = 'rgba(31,35,40,0.2)'; g.shadowBlur = 12 * s; g.shadowOffsetY = 3 * s;
    g.fillStyle = '#ffffff'; g.fill();
    g.shadowColor = 'transparent'; g.lineWidth = 1.6 * s; g.strokeStyle = style.border; g.stroke();
    let y = by + padY;
    if (style.label) { g.font = `800 ${8.5 * s}px ${FONT}`; g.fillStyle = style.border; g.fillText(style.label, bx + padX, y + 8 * s); y += labelH; }
    g.font = `600 ${12.5 * s}px ${FONT}`; g.fillStyle = '#1f2328';
    lines.forEach((l, i) => g.fillText(l, bx + padX, y + 11.5 * s + i * lh));
    g.restore();
  }
  function sparkles(x, y, seed, age, count, spread, colors, life) {
    if (REDUCED) return;
    const r = mulberry(seed), s = cam.ui;
    for (let k = 0; k < count; k++) {
      const ang = r() * Math.PI * 2, sp = spread * (0.35 + 0.65 * r()), lf = life * (0.6 + 0.4 * r()), delay = r() * 0.25, col = colors[(r() * colors.length) | 0];
      const a = (age - delay) / lf;
      if (a <= 0 || a >= 1) continue;
      const e = easeOut(a);
      star(x + Math.cos(ang) * sp * e * s, y + Math.sin(ang) * sp * 0.7 * e * s - 18 * a * s, (1 - a) * 4.2 * s + 0.6, col);
    }
  }
  function confetti(x, y, seed, age, count) {
    if (REDUCED || age < 0 || age > 1.6) return;
    const r = mulberry(seed), s = cam.ui, cols = ['#2ea44f', '#0f6cbd', '#f2a93b', '#d1242f', '#8250df', '#ffd24a'];
    for (let k = 0; k < count; k++) {
      const ang = -Math.PI / 2 + (r() - 0.5) * 2.4, sp = (40 + r() * 70) * s, col = cols[(r() * cols.length) | 0], spin = r() * 6;
      const a = age / 1.6, px = x + Math.cos(ang) * sp * a, py = y + Math.sin(ang) * sp * a + 120 * s * a * a;
      g.save(); g.globalAlpha = 1 - a; g.translate(px, py); g.rotate(spin + age * 8); g.fillStyle = col; g.fillRect(-2.6 * s, -1.6 * s, 5.2 * s, 3.2 * s); g.restore();
    }
  }
  function toolGlyph(x, y, age) {
    const a = clamp(age / 1.3, 0, 1); if (a >= 1) return;
    const s = cam.ui, pop = REDUCED ? 1 : easeBack(age / 0.3), yy = y - (REDUCED ? 0 : 14 * s * a), w = 26 * s * pop, h = 18 * s * pop;
    g.save(); g.globalAlpha = 1 - Math.max(0, a - 0.7) / 0.3;
    rr(x - w / 2, yy - h / 2, w, h, 4 * s); g.fillStyle = '#0d1117'; g.fill(); g.lineWidth = 1.2 * s; g.strokeStyle = '#7dd3fc'; g.stroke();
    g.fillStyle = '#7dd3fc'; g.font = `800 ${10 * s * pop}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('>_', x, yy + 0.5 * s);
    g.restore(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  function bookGlyph(x, y, age, color) {
    const a = clamp(age / 1.2, 0, 1); if (a >= 1) return;
    const s = cam.ui, yy = y - (REDUCED ? 0 : 16 * s * a);
    g.save(); g.globalAlpha = 1 - Math.max(0, a - 0.65) / 0.35;
    rr(x - 9 * s, yy - 11 * s, 18 * s, 22 * s, 2.5 * s); g.fillStyle = color; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x - 5 * s, yy - 6 * s, 10 * s, 2.2 * s); g.fillRect(x - 5 * s, yy - 1.5 * s, 7 * s, 2 * s);
    g.restore();
  }
  function magnifier(x, y, age) {
    const s = cam.ui, pop = REDUCED ? 1 : easeBack(age / 0.3), r = 8 * s * pop;
    g.save(); g.lineWidth = 3 * s * pop; g.strokeStyle = '#c27803'; g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(x - 2 * s, y - 2 * s, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x + r * 0.55, y + r * 0.55); g.lineTo(x + r * 1.35, y + r * 1.35); g.stroke();
    g.restore();
  }
  function drawOverlays(F, chars) {
    resetT();
    const byId = new Map(chars.map((c) => [c.a.id, c]));
    hits.agents = [];
    for (const r of layoutPlates(chars)) {
      drawPlate(r);
      const c = r.c, top = P(c.x, c.y, 1.75), foot = P(c.x, c.y, 0);
      hits.agents.push({ id: c.a.id, x0: Math.min(r.x, top[0] - cam.hw * 0.5), y0: top[1] - 6 * cam.ui, x1: Math.max(r.x + r.w, top[0] + cam.hw * 0.5), y1: Math.max(foot[1], r.y + r.h) });
    }
    const marks = () => { for (const p of F.st.pending) { const c = byId.get(p.agent); if (c) bang(c, TL.starts[p.i], F.t); } };
    const ev = F.ev; if (!ev) { marks(); return; }
    const actor = byId.get(ev.agent), age = F.age;
    const fade = clamp(age / 0.2, 0, 1) * (F.i === TL.n - 1 ? 1 : clamp((F.dur - age) / 0.3, 0, 1));
    if (actor) {
      const hp = headPoint(actor);
      if (ev.type === 'log' || ev.type === 'tool') sparkles(hp[0], hp[1], 31 + F.i * 7, age, 7, 22, ['#ffd24a', '#7dd3fc', '#ffffff'], 0.9);
      if (ev.type === 'tool') toolGlyph(hp[0] + 22 * cam.ui, hp[1] - 6 * cam.ui, age);
      if (ev.type === 'memory') { bookGlyph(hp[0], hp[1] - 6 * cam.ui, age, actor.a.color); const idx = F.st.memories.length - 1; if (idx >= 0) { const b = memoryBook(idx, '#000'); const bp = P(0.46, b.y + b.t / 2, SHELF_Z[b.lvl] + b.h / 2); sparkles(bp[0], bp[1], 77 + F.i, age, 9, 26, ['#d8b4fe', '#ffd24a', '#ffffff'], 1.0); } }
      if (ev.type === 'start') sparkles(hp[0], hp[1], 13 + F.i * 3, age - 0.9, 6, 20, ['#86efac', '#ffffff'], 0.9);
      if (ev.type === 'note' || ev.type === 'goal') bubble(hp[0], hp[1], ev.text, { border: actor.a.color }, fade);
      if (ev.type === 'decision_request' || ev.type === 'blocked') bubble(hp[0], headPoint(actor, 0.62)[1], ev.text, { border: '#d97706', label: ev.type === 'blocked' ? 'BLOCKED · NEEDS YOU' : 'QUESTION FOR YOU' }, fade);
      if (ev.type === 'decision_answer') {
        const to = F.st.answerFor ? M.byId.get(F.st.answerFor) : null;
        bubble(hp[0], hp[1], ev.text, { border: '#1a7f37', label: 'ANSWER' + (to ? ' → ' + to.name : ''), lean: actor.a.kind === 'human' ? -1 : 0 }, fade);
      }
      if (ev.type === 'review') { magnifier(hp[0] + 18 * cam.ui, hp[1] - 4 * cam.ui, age); }
    }
    marks();
    if ((ev.type === 'done' || ev.type === 'merge') && ev.task) {
      const cp = cardScreenPos(F, ev.task);
      if (cp) { confetti(cp[0], cp[1], 500 + F.i, age - 0.55, 22); sparkles(cp[0], cp[1], 900 + F.i, age - 0.5, 10, 30, ['#2ea44f', '#ffd24a', '#ffffff'], 1.1); }
      const wk = byId.get(laneOf(ev.task) || ev.agent);
      if (wk) { const hp = headPoint(wk); confetti(hp[0], hp[1], 700 + F.i, age - 0.2, 14); }
    }
  }

  // ================================================================ frame
  let M = null, L = null, TL = { n: 0, starts: new Float64Array(0), durs: new Float64Array(0), total: 0 }, SIM = null, ITEMS = [], FR = null;
  const hits = { agents: [], desks: [], shelf: null };
  let selected = null;
  function renderAt(tIn) {
    if (!M) return -1;
    const t = clamp(Number(tIn) || 0, 0, TL.total);
    const F = frameState(t);
    FR = F;
    cam.ox = cam.bx + (REDUCED ? 0 : Math.sin(t * 0.37) * 0.9 * cam.dpr);
    cam.oy = cam.by + (REDUCED ? 0 : Math.sin(t * 0.53) * 1.4 * cam.dpr);
    resetT(); g.globalAlpha = 1; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    drawBackdrop();
    drawShell();
    drawDecals();
    drawWallArt(F);
    drawTaskWall(F);
    const chars = agentsAt(F);
    drawShadows(chars);
    const selId = selectedId(F);
    if (!RENDER && selId) drawSelection(chars, selId);
    drawSorted(ITEMS.concat(chars.map(charItem)));
    drawOverlays(F, chars);
    recordHits();
    updateHud(F);
    return F.i;
  }
  function recordHits() {
    hits.desks = L.desks.filter((d) => d.agent).map((d) => {
      const a = P(d.x0, d.y0 + 1, 2.06), b = P(d.x0 + 2, d.y0, 0), c = P(d.x0 + 2, d.y0 + 1, 0), e = P(d.x0, d.y0 + 1, 0);
      return { id: d.agent, x0: Math.min(a[0], e[0]), x1: Math.max(b[0], c[0]), y0: Math.min(a[1], P(d.x0 + 2, d.y0, 2.06)[1]), y1: c[1] };
    });
    const s0 = P(0, 3.6, 2.62), s1 = P(0.6, 0.6, 2.62), s2 = P(0.6, 3.6, 0);
    hits.shelf = { x0: s0[0], x1: s1[0], y0: Math.min(s0[1], s1[1]), y1: s2[1] };
  }

  // ================================================================ HUD
  const memo = {};
  function setText(el, key, v) { if (memo[key] !== v) { memo[key] = v; el.textContent = v; } }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function selectedId(F) {
    if (selected && M.byId.has(selected)) return selected;
    if (F.ev) return F.ev.agent;
    return M.lead ? M.lead.id : null;
  }
  function statusOf(id, F) {
    const a = M.byId.get(id), st = F.st;
    if (!a) return { text: '', cls: '' };
    if (a.kind === 'human') {
      const ans = F.ev && F.ev.agent === id && F.ev.type === 'decision_answer';
      if (ans) return { text: 'Answering', cls: 'green' };
      return st.pending.length ? { text: st.pending.length + ' waiting', cls: 'amber' } : { text: 'Owner', cls: '' };
    }
    if (st.pending.some((p) => p.agent === id)) return { text: 'Waiting on you', cls: 'amber' };
    if (M.lead && id === M.lead.id && reviewOpen(st, F.t)) return { text: 'Reviewing ' + (st.review.task || ''), cls: 'blue' };
    const task = currentTask(id, F);
    const act = st.active.get(id);
    if (act && act.size) return { text: 'Working' + (task ? ' · ' + task : ''), cls: 'blue' };
    if (M.lead && id === M.lead.id) return { text: 'Coordinating', cls: '' };
    return { text: 'Idle', cls: '' };
  }
  function updateHud(F) {
    const st = F.st, total = M.tasks.length;
    const shown = lerp(F.prevDone, st.done, smooth(F.age / 0.8));
    const pct = total ? Math.round((shown / total) * 100) : 0;
    if (memo.pct !== pct) { memo.pct = pct; ui.ring.style.setProperty('--p', String(pct)); ui.ringPct.textContent = pct + '%'; }
    setText(ui.taskCount, 'tc', st.done + '/' + total);
    const waiting = st.pending.length;
    setText(ui.waitCount, 'wc', String(waiting));
    if (memo.won !== (waiting > 0)) { memo.won = waiting > 0; ui.waiting.classList.toggle('on', waiting > 0); }
    let pulse = 1, glow = 0;
    if (waiting > 0) {
      const lastReq = st.pending[st.pending.length - 1];
      const age = F.t - TL.starts[lastReq.i];
      if (age >= 0 && age < 1.6 && !REDUCED) { const a = age / 1.6; pulse = 1 + 0.28 * Math.sin(age * 14) * (1 - a); glow = 1 - a; }
    }
    const pk = pulse.toFixed(3) + glow.toFixed(3);
    if (memo.pulse !== pk) { memo.pulse = pk; ui.waiting.style.setProperty('--pulse', pulse.toFixed(3)); ui.waiting.style.setProperty('--glow', glow.toFixed(3)); }
    const ck = F.ev && F.ev.clock;
    setText(ui.clock, 'clk', ck ? ck.hhmm : '--:--');
    setText(ui.clockTz, 'tz', ck && ck.off ? 'Event time · UTC' + ck.off : 'Event time');
    // caption
    const ev = F.ev;
    if (memo.cap !== F.i) {
      memo.cap = F.i;
      ui.capWho.textContent = ''; ui.capTag.textContent = ''; ui.capTag.className = 'cap-tag';
      if (ev) {
        const a = M.byId.get(ev.agent);
        const sw = el('i'); sw.style.setProperty('--c', a ? a.color : '#fff');
        ui.capWho.append(sw, document.createTextNode(a ? a.name : ev.agent));
        ui.capTag.textContent = (ev.task && ev.type !== 'note' ? ev.task + ' · ' : '') + TAG[ev.type];
        if (TAG_CLASS[ev.type]) ui.capTag.classList.add(TAG_CLASS[ev.type]);
        ui.capText.textContent = ev.text;
        ui.capText.title = ev.detail || ev.text;
        ui.capIdx.textContent = (F.i + 1) + '/' + TL.n;
      } else { ui.capText.textContent = 'No events yet. The studio is waiting for the first event.'; ui.capIdx.textContent = ''; }
    }
    renderCard(F);
    renderTeam(F);
    if (!RENDER) {
      const frac = TL.total ? F.t / TL.total : 0;
      const pos = (frac * 100).toFixed(3) + '%';
      if (memo.knob !== pos) { memo.knob = pos; ui.scrubKnob.style.left = pos; ui.scrubFill.style.width = pos; ui.scrub.setAttribute('aria-valuenow', F.t.toFixed(1)); }
      setText(ui.timeLabel, 'tl', fmtTime(F.t) + ' / ' + fmtTime(TL.total));
    }
    if (!ui.libPop.hidden) fillLibrary(F);
  }
  function renderCard(F) {
    const id = selectedId(F); if (!id) return;
    const a = M.byId.get(id); if (!a) return;
    const st = F.st, logs = (st.logs.get(id) || []).slice(-6), status = statusOf(id, F), task = currentTask(id, F);
    const pend = st.pending.find((p) => p.agent === id);
    const now = F.ev && F.ev.agent === id ? F.ev : null;
    const sig = [id, status.text, logs.map((l) => l.i).join(','), pend ? pend.i : -1, task, selected ? 1 : 0, now ? F.i : -1].join('|');
    if (memo.card === sig) return;
    memo.card = sig;
    const root = ui.agentCard; root.textContent = '';
    const head = el('div', 'ac-head');
    const sw = el('span', 'ac-swatch' + (a.kind === 'human' ? ' human' : '')); sw.style.setProperty('--c', a.color);
    const names = el('div', 'ac-names'); names.append(el('div', 'ac-name', (a === M.lead ? '★ ' : '') + a.name), el('div', 'ac-title', a.title || a.kind));
    head.append(sw, names, el('span', 'chip ' + status.cls, status.text));
    root.append(head);
    const row = el('div', 'ac-task'); row.append(el('span', 'ac-k', 'Task'));
    const v = el('span');
    if (task && M.taskById.get(task)) {
      const T = M.taskById.get(task), x = st.tasks.get(task);
      v.append(el('b', null, task + ' '), document.createTextNode(T.title));
      if (x && x.col) v.append(el('em', null, COL_LABEL[COLS.indexOf(x.col)]));
    } else v.textContent = a.kind === 'human' ? 'Answers questions at the Decision Podium' : 'No active task';
    row.append(v); root.append(row);
    if (pend) { const w = el('div', 'ac-wait'); w.append(el('strong', null, 'Waiting on you'), document.createTextNode(pend.text)); root.append(w); }
    const lh = el('div', 'ac-log-h'); lh.append(el('span', 'ac-k', 'Recent activity'));
    const follow = el('button', 'ac-follow', selected ? 'Follow latest' : 'Following latest'); follow.type = 'button'; follow.disabled = !selected;
    follow.addEventListener('click', () => { selected = null; memo.card = ''; requestRender(); });
    lh.append(follow); root.append(lh);
    const ol = el('ol', 'ac-log');
    if (!logs.length) ol.append(el('li', 'empty', 'No activity yet'));
    for (const l of logs) {
      const e = M.events[l.i];
      const cls = l.type === 'tool' ? 't-tool' : l.type === 'decision_request' ? 't-decision' : l.type === 'blocked' ? 't-blocked' : l.type === 'answer' || l.type === 'decision_answer' ? 't-answer' : l.type === 'done' || l.type === 'merge' ? 't-done' : l.type === 'memory' ? 't-memory' : '';
      const li = el('li', cls + (l.i === F.i ? ' now' : ''));
      const sp = el('span', null, (PREFIX[l.type] || '') + l.text); sp.title = l.text;
      li.append(el('time', null, e.clock ? e.clock.hhmm : '--:--'), sp);
      ol.append(li);
    }
    root.append(ol);
    if (now && now.detail) root.append(el('div', 'ac-detail', now.detail));
  }
  function renderTeam(F) {
    const sel = selectedId(F);
    const rows = M.agents.map((a) => { const s = statusOf(a.id, F); return [a.id, s.text, s.cls]; });
    const sig = sel + '|' + rows.map((r) => r.join(':')).join(';');
    if (memo.team === sig) return;
    const rebuild = memo.teamIds !== M.agents.map((a) => a.id).join(',');
    memo.team = sig;
    if (rebuild) {
      memo.teamIds = M.agents.map((a) => a.id).join(',');
      ui.team.textContent = '';
      for (const a of M.agents) {
        const li = el('li', 'tm'); li.dataset.id = a.id; li.tabIndex = 0;
        const dot = el('span', 'tm-dot'); dot.style.setProperty('--c', a.color);
        li.append(dot, el('span', 'tm-name', a.name), el('span', 'tm-status'));
        li.title = a.title;
        ui.team.append(li);
      }
    }
    rows.forEach(([id, text, cls], k) => {
      const li = ui.team.children[k]; if (!li) return;
      li.classList.toggle('sel', id === sel);
      const st = li.lastChild; st.textContent = text; st.className = 'tm-status' + (cls ? ' ' + cls : '');
    });
  }
  function fillLibrary(F) {
    const mems = F.st.memories, key = mems.length + ':' + (mems.length ? mems[mems.length - 1].i : -1);
    if (memo.lib === key) return;
    memo.lib = key;
    const pop = ui.libPop; pop.textContent = '';
    pop.append(el('h3', null, 'Library · ' + (mems.length === 1 ? '1 memory' : mems.length + ' memories')));
    if (!mems.length) { pop.append(el('p', null, 'No memories saved yet. Books appear here when an agent records a lesson.')); return; }
    const ol = el('ol');
    for (const m of mems) {
      const e = M.events[m.i], a = M.byId.get(m.agent), li = el('li');
      li.append(el('small', null, (e.clock ? e.clock.hhmm : '') + (a ? ' ' + a.name : '')), document.createTextNode(m.text));
      ol.append(li);
    }
    pop.append(ol);
  }

  // ================================================================ playback & controls
  let T = 0, playing = false, speed = 1, live = false, liveTimer = 0, dirty = true, lastTs = 0, libPinned = false;
  const requestRender = () => { dirty = true; if (RENDER && M) renderAt(T); };
  function setPlaying(on) {
    playing = !!on && TL.n > 0;
    if (playing && T >= TL.total - 1e-6 && !live) T = 0;
    const ico = ui.btnPlay.firstElementChild;
    ico.className = 'ico ' + (playing ? 'ico-pause' : 'ico-play');
    ui.btnPlay.setAttribute('aria-label', playing ? 'Pause (Space)' : 'Play (Space)');
    dirty = true;
  }
  function seek(t) { T = clamp(t, 0, TL.total); dirty = true; }
  function step(dir) {
    if (!TL.n) return;
    const i = indexAt(T);
    if (dir > 0) seek(i + 1 < TL.n ? TL.starts[i + 1] : TL.total);
    else seek(T - TL.starts[i] > 0.3 ? TL.starts[i] : TL.starts[Math.max(0, i - 1)]);
    setPlaying(false);
  }
  function setSpeed(v) {
    speed = v;
    for (const b of document.querySelectorAll('.speed')) b.classList.toggle('on', parseFloat(b.dataset.speed) === v);
  }
  function loop(ts) {
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (playing) {
      T += dt * speed;
      if (T >= TL.total) { T = TL.total; if (!live) setPlaying(false); }
      dirty = true;
    }
    if (dirty && M) { dirty = false; renderAt(T); }
    requestAnimationFrame(loop);
  }
  function drawTicks() {
    const c = ui.ticks, r = c.getBoundingClientRect(), dpr = cam.dpr;
    if (!r.width) return;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    if (!TL.n) return;
    const pad = 6 * dpr, w = c.width - pad * 2;
    for (let i = 0; i < TL.n; i++) {
      const ev = M.events[i], a = M.byId.get(ev.agent);
      const dec = ev.type === 'decision_request' || ev.type === 'blocked' || ev.type === 'decision_answer';
      const big = dec || ev.type === 'merge' || ev.type === 'done' || ev.type === 'start';
      const px = pad + (TL.starts[i] / TL.total) * w;
      const h = (big ? 0.62 : 0.36) * c.height;
      x.fillStyle = dec ? (ev.type === 'decision_answer' ? '#f5b544' : '#e08a00') : ev.type === 'merge' || ev.type === 'done' ? '#2ea44f' : a ? a.color : '#8c959f';
      x.globalAlpha = big ? 1 : 0.55;
      x.fillRect(Math.round(px - dpr), Math.round((c.height - h) / 2), Math.max(2, Math.round(2 * dpr)), Math.round(h));
    }
    x.globalAlpha = 1;
  }
  function scrubTime(clientX) {
    const r = ui.scrub.getBoundingClientRect(), pad = 6;
    return clamp((clientX - r.left - pad) / Math.max(1, r.width - pad * 2), 0, 1) * TL.total;
  }
  function showTip(text, x, y) {
    const tip = ui.tip; tip.textContent = text; tip.hidden = false;
    const ar = ui.app.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = clamp(x - ar.left - w / 2, 8, ar.width - w - 8) + 'px';
    tip.style.top = clamp(y - ar.top - h - 12, 8, ar.height - h - 8) + 'px';
  }
  function hitAt(px, py) {
    const dpr = cam.dpr, x = px * dpr, y = py * dpr;
    for (let k = hits.agents.length - 1; k >= 0; k--) { const h = hits.agents[k]; if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return { kind: 'agent', id: h.id }; }
    const s = hits.shelf; if (s && x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) return { kind: 'shelf' };
    for (const h of hits.desks) if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return { kind: 'agent', id: h.id };
    return null;
  }
  function placeLibrary() {
    const s = hits.shelf; if (!s) return;
    const pop = ui.libPop, ar = ui.app.getBoundingClientRect(), dpr = cam.dpr;
    pop.style.left = clamp(s.x1 / dpr + 12, 8, ar.width - pop.offsetWidth - 8) + 'px';
    pop.style.top = clamp(s.y0 / dpr, 64, ar.height - pop.offsetHeight - 8) + 'px';
  }
  function openLibrary(pin) {
    libPinned = pin || libPinned;
    if (ui.libPop.hidden) { ui.libPop.hidden = false; memo.lib = ''; }
    if (FR) fillLibrary(FR);
    placeLibrary();
  }
  function closeLibrary() { libPinned = false; ui.libPop.hidden = true; }
  function bindUi() {
    ui.btnPlay.addEventListener('click', () => setPlaying(!playing));
    ui.btnPrev.addEventListener('click', () => step(-1));
    ui.btnNext.addEventListener('click', () => step(1));
    for (const b of document.querySelectorAll('.speed')) b.addEventListener('click', () => setSpeed(parseFloat(b.dataset.speed)));
    ui.btnLive.addEventListener('click', () => setLive(!live));
    let dragging = false;
    ui.scrub.addEventListener('pointerdown', (e) => { dragging = true; ui.scrub.setPointerCapture(e.pointerId); seek(scrubTime(e.clientX)); });
    ui.scrub.addEventListener('pointermove', (e) => {
      const t = scrubTime(e.clientX);
      if (dragging) seek(t);
      if (TL.n) { const ev = M.events[indexAt(t)], a = M.byId.get(ev.agent); showTip((ev.clock ? ev.clock.hhmm + ' · ' : '') + (a ? a.name : ev.agent) + ': ' + ev.text, e.clientX, ui.scrub.getBoundingClientRect().top); }
    });
    const endDrag = () => { dragging = false; };
    ui.scrub.addEventListener('pointerup', endDrag); ui.scrub.addEventListener('pointercancel', endDrag);
    ui.scrub.addEventListener('pointerleave', () => { ui.tip.hidden = true; });
    ui.scrub.addEventListener('keydown', (e) => {
      if (e.key === 'Home') { seek(0); e.preventDefault(); } else if (e.key === 'End') { seek(TL.total); e.preventDefault(); }
    });
    canvas.addEventListener('pointermove', (e) => {
      const r = ui.app.getBoundingClientRect(), h = hitAt(e.clientX - r.left, e.clientY - r.top);
      canvas.style.cursor = h ? 'pointer' : 'default';
      if (h && h.kind === 'shelf') { openLibrary(false); ui.tip.hidden = true; }
      else {
        if (!libPinned) ui.libPop.hidden = true;
        if (h && h.kind === 'agent') { const a = M.byId.get(h.id); showTip(a.name + (a.title ? ' · ' + a.title : ''), e.clientX, e.clientY - 8); } else ui.tip.hidden = true;
      }
    });
    canvas.addEventListener('pointerleave', () => { ui.tip.hidden = true; if (!libPinned) ui.libPop.hidden = true; });
    canvas.addEventListener('click', (e) => {
      const r = ui.app.getBoundingClientRect(), h = hitAt(e.clientX - r.left, e.clientY - r.top);
      if (h && h.kind === 'shelf') { if (libPinned) closeLibrary(); else openLibrary(true); return; }
      closeLibrary();
      selected = h && h.kind === 'agent' ? h.id : null;
      memo.card = ''; requestRender();
    });
    ui.team.addEventListener('click', (e) => { const li = e.target.closest('.tm'); if (li) { selected = li.dataset.id === selected ? null : li.dataset.id; memo.card = ''; requestRender(); } });
    ui.team.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const li = e.target.closest('.tm'); if (li) { selected = li.dataset.id; memo.card = ''; requestRender(); } } });
    document.addEventListener('keydown', (e) => {
      if (RENDER || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); if (!e.repeat) setPlaying(!playing); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'l' || e.key === 'L') setLive(!live);
      else if (e.key === 'Escape') { closeLibrary(); selected = null; memo.card = ''; requestRender(); }
    });
    document.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.key === ' ') e.preventDefault(); });
    window.addEventListener('resize', resize);
  }
  function resize() {
    cam.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const r = ui.app.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * cam.dpr));
    canvas.height = Math.max(1, Math.round(r.height * cam.dpr));
    fitCamera();
    if (!RENDER) drawTicks();
    if (!ui.libPop.hidden) placeLibrary();
    requestRender();
  }

  // ================================================================ model & live mode
  function sameHistory(a, b) {
    if (!a || a.events.length > b.events.length || a.project.title !== b.project.title) return false;
    for (let i = 0; i < a.events.length; i++) { const x = a.events[i], y = b.events[i]; if (x.ts !== y.ts || x.agent !== y.agent || x.type !== y.type || x.text !== y.text) return false; }
    return true;
  }
  function setModel(next) {
    M = next;
    TL = buildTimeline(M.events);
    L = buildLayout();
    SIM = simulate();
    ITEMS = buildItems();
    fitMemo.clear();
    for (const k of Object.keys(memo)) delete memo[k];
    T = clamp(T, 0, TL.total);
    setText(ui.projTitle, 'pt', M.project.title);
    setText(ui.projGoal, 'pg', M.project.goal);
    ui.projGoal.title = M.project.goal;
    document.title = M.project.title + ' · Contoso Agent Studio';
    ui.scrub.setAttribute('aria-valuemax', TL.total.toFixed(1));
    if (!RENDER) drawTicks();
    api.total = TL.total;
    document.documentElement.dataset.events = String(TL.n);
    document.documentElement.dataset.total = TL.total.toFixed(2);
  }
  async function poll() {
    let raw = null;
    try { raw = await loadRaw(true); } catch (e) { raw = null; }
    if (!raw || !live) return;
    let next;
    try { next = normalize(raw); } catch (e) { return; }
    if (sameHistory(M, next)) {
      if (next.events.length === M.events.length && next.tasks.length === M.tasks.length && next.agents.length === M.agents.length) return;
      const atEnd = T >= TL.total - 0.05;
      setModel(next);
      if (atEnd) setPlaying(true);
    } else {
      setModel(next);
    }
    dirty = true;
  }
  function setLive(on) {
    if (RENDER) return;
    live = !!on;
    ui.liveBadge.hidden = !live;
    ui.btnLive.classList.toggle('on', live);
    ui.btnLive.setAttribute('aria-pressed', String(live));
    clearInterval(liveTimer);
    if (live) { liveTimer = setInterval(poll, LIVE_MS); poll(); }
    dirty = true;
  }

  // ================================================================ API, self-test, boot
  let resolveReady, rejectReady;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  ready.catch(() => {});
  const api = { ready, total: 0, renderAt: (t) => { const i = renderAt(t); T = clamp(Number(t) || 0, 0, TL.total); return i; } };
  window.__studio = api;

  function canvasHash() {
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 61) { h ^= d[i]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function selfTest() {
    const errs = [];
    try {
      const tot = TL.total;
      for (let k = 0; k <= 20; k++) renderAt((tot * k) / 20);
      renderAt(tot * 0.37); const a = canvasHash();
      renderAt(tot * 0.81); renderAt(1.0); renderAt(tot * 0.37); const b = canvasHash();
      if (a !== b) errs.push('renderAt is not deterministic');
      if (!(tot > 0)) errs.push('total is 0');
      if (!document.getElementById('capText').textContent) errs.push('empty caption');
      const t0 = performance.now();
      for (let k = 0; k < 60; k++) { renderAt((tot * k) / 60); g.getImageData(0, 0, 1, 1); }
      document.documentElement.dataset.ms = ((performance.now() - t0) / 60).toFixed(2);
    } catch (e) { errs.push(e && e.message ? e.message : String(e)); }
    document.documentElement.dataset.selftest = errs.length ? 'fail' : 'ok';
    document.title = errs.length ? 'FAIL: ' + errs.join('; ') : 'OK';
  }
  window.addEventListener('error', (e) => {
    document.documentElement.dataset.error = e.message || 'error';
    if (SELFTEST) document.title = 'ERROR: ' + (e.message || 'error');
  });

  async function boot() {
    if (RENDER) document.body.classList.add('render');
    if (QS.get('panel') === '0') document.body.classList.add('no-panel');
    bindUi();
    setSpeed(1);
    let raw = null;
    try { raw = await loadRaw(false); } catch (e) { raw = null; }
    let model = null;
    try { model = raw ? normalize(raw) : null; } catch (e) { model = null; }
    if (!model) {
      ui.loading.textContent = 'Could not load events.json (or the events.js fallback).';
      ui.loading.classList.add('error');
      rejectReady(new Error('No event data'));
      return;
    }
    setModel(model);
    resize();
    T = T_PARAM != null ? clamp(T_PARAM, 0, TL.total) : 0;
    renderAt(T);
    ui.loading.hidden = true;
    document.documentElement.dataset.studio = 'ready';
    if (SELFTEST) { selfTest(); renderAt(T); }
    resolveReady(api);
    if (!RENDER) {
      requestAnimationFrame(loop);
      if (QS.get('live') === '1') setLive(true);
      if (T_PARAM == null && QS.get('autoplay') !== '0') setTimeout(() => setPlaying(true), 700);
    }
  }
  boot();
})();
