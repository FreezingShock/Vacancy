/* Vacancy people: shoppers with agendas that walk the mall's corridor graph.
   Two parts, usable on their own:
   1. A renderer-free simulation (create). Plain numbers in, typed arrays out, runs in Node for tests.
   2. An optional Three.js renderer (createRenderer) that draws the crowd as instanced low-poly people.
   Units are plan units on the ground plane (x,y). Levels are integer ids; each has an elevation z.
   See docs/people.md for the nav data shape. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VacancyPeople = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- small helpers ----------
  function rngFrom(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  // Binary min-heap on (key, value) pairs, reused between runs to avoid garbage.
  function Heap() { this.k = []; this.v = []; this.n = 0; }
  Heap.prototype.push = function (key, val) {
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  };
  Heap.prototype.pop = function () {
    const top = this.v[0], key = this.k[--this.n], val = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= key) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = key; this.v[i] = val;
    return top;
  };

  // ---------- navigation graph ----------
  
  function buildGraph(nav, U) {
    U = U || 4;
    const q4 = U / 4, SNAP = 1.5 * q4;
    const g = { nodes: [], edges: [], adj: [], trees: {}, levelZ: {} };
    (nav.levels || []).forEach(l => { g.levelZ[l.id] = l.z || 0; });
    const used = (lv) => { if (!(lv in g.levelZ)) g.levelZ[lv] = lv * 50; };

    function nodeAt(x, y, level) {
      used(level);
      for (let i = 0; i < g.nodes.length; i++) {
        const n = g.nodes[i];
        if (n.level === level && Math.abs(n.x - x) < SNAP && Math.abs(n.y - y) < SNAP) return i;
      }
      g.nodes.push({ x, y, level, hw: 4 * q4 });
      g.adj.push([]);
      return g.nodes.length - 1;
    }
    function addEdge(a, b, hw, kind) {
      if (a === b) return -1;
      const A = g.nodes[a], B = g.nodes[b];
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      if (len < 0.01 && kind !== 'esc') return -1;
      g.edges.push({ a, b, len, hw, kind, dead: false });
      return g.edges.length - 1;
    }
    function splitEdge(ei, ni) {
      const e = g.edges[ei];
      if (e.a === ni || e.b === ni) return;
      const b = e.b;
      e.b = ni;
      const A = g.nodes[e.a], N = g.nodes[ni];
      e.len = Math.hypot(N.x - A.x, N.y - A.y);
      addEdge(ni, b, e.hw, e.kind);
    }
    function segInter(p1, p2, p3, p4) {
      const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-9) return null;
      const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
      const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
      const m1 = SNAP / Math.hypot(d1x, d1y), m2 = SNAP / Math.hypot(d2x, d2y);
      if (t > m1 && t < 1 - m1 && u > m2 && u < 1 - m2) return [p1.x + t * d1x, p1.y + t * d1y];
      return null;
    }

    // 1. corridor polylines
    for (const c of nav.corridors || []) {
      const hw = c.halfWidth || 10 * q4;
      let prev = -1;
      for (const p of c.pts) {
        const ni = nodeAt(p[0], p[1], c.level);
        if (prev >= 0) addEdge(prev, ni, hw, 'corridor');
        prev = ni;
      }
    }
    // 2. crossings and T-junctions become nodes
    for (let guard = 0; guard < 2000; guard++) {
      let changed = false;
      const E = g.edges;
      outer:
      for (let i = 0; i < E.length; i++) {
        const ei = E[i];
        if (ei.kind !== 'corridor') continue;
        const A = g.nodes[ei.a], B = g.nodes[ei.b];
        for (let j = i + 1; j < E.length; j++) {
          const ej = E[j];
          if (ej.kind !== 'corridor') continue;
          const C = g.nodes[ej.a], D = g.nodes[ej.b];
          if (A.level !== C.level) continue;
          const x = segInter(A, B, C, D);
          if (x) {
            const ni = nodeAt(x[0], x[1], A.level);
            splitEdge(i, ni); splitEdge(j, ni);
            changed = true; break outer;
          }
        }
        for (let n = 0; n < g.nodes.length; n++) {
          const N = g.nodes[n];
          if (N.level !== A.level || n === ei.a || n === ei.b) continue;
          const q = project(A, B, N.x, N.y);
          if (q.d < SNAP && q.t > 0 && q.t < 1) { splitEdge(i, n); changed = true; break outer; }
        }
      }
      if (!changed) break;
    }
    function project(A, B, x, y) {
      const dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy || 1;
      const t = clamp(((x - A.x) * dx + (y - A.y) * dy) / L, 0, 1);
      const qx = A.x + t * dx, qy = A.y + t * dy;
      return { t, x: qx, y: qy, d: Math.hypot(qx - x, qy - y) };
    }
    // Nearest corridor edge on a level; returns the node on it (splitting the edge if needed).
    function snapToCorridor(x, y, level) {
      let best = null, bi = -1;
      for (let i = 0; i < g.edges.length; i++) {
        const e = g.edges[i];
        if (e.kind !== 'corridor' || g.nodes[e.a].level !== level) continue;
        const q = project(g.nodes[e.a], g.nodes[e.b], x, y);
        if (!best || q.d < best.d) { best = q; bi = i; }
      }
      if (!best) return -1;
      const ni = nodeAt(best.x, best.y, level);
      splitEdge(bi, ni);
      return ni;
    }
    // A point that may sit off the corridor: the corridor node plus a short link to the exact spot.
    function attach(x, y, level, hw) {
      const c = snapToCorridor(x, y, level);
      if (c < 0) return nodeAt(x, y, level);
      const C = g.nodes[c];
      if (Math.hypot(C.x - x, C.y - y) < SNAP) return c;
      const p = nodeAt(x, y, level);
      if (p !== c) addEdge(c, p, hw || 3.5 * q4, 'link');
      return p;
    }
    g.attach = attach;

    // 3. escalators
    g.esc = [];
    for (const s of nav.escalators || []) {
      const a = attach(s.a.x, s.a.y, s.a.level, 6 * q4), b = attach(s.b.x, s.b.y, s.b.level, 6 * q4);
      const ei = addEdge(a, b, 4 * q4, 'esc');
      if (ei >= 0) g.esc.push(ei);
    }
    // 4. entrances, courts and store doors
    g.entrances = (nav.entrances || []).map(e => ({ node: attach(e.x, e.y, e.level, 8 * q4), x: e.x, y: e.y, level: e.level, kind: e.kind || 'parking', weight: e.weight || 1 }));
    g.courts = (nav.courts || []).map(c => ({ node: attach(c.x, c.y, c.level, 8 * q4), x: c.x, y: c.y, r: c.r || 20, level: c.level, kind: c.kind || 'court' }));
    g.stores = [];
    g.storeById = {};
    g.q4 = q4;
    for (const s of nav.stores || []) addStore(g, s);
    finish(g);
    return g;
  }

  function addStore(g, s) {
    const node = g.attach(s.door[0], s.door[1], s.level, 3.5 * g.q4);
    const ins = s.inside || [s.door[0], s.door[1]];
    const st = { id: s.id, level: s.level, node, door: s.door, inside: ins, kind: s.kind || 'shop', appeal: s.appeal == null ? 0.5 : s.appeal, open: s.open !== false };
    g.stores.push(st); g.storeById[s.id] = st;
    return st;
  }
  function finish(g) {
    g.adj = g.nodes.map(() => []);
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i];
      const cost = e.kind === 'esc' ? e.len + 40 : e.len;
      g.adj[e.a].push({ to: e.b, e: i, cost });
      g.adj[e.b].push({ to: e.a, e: i, cost });
      g.nodes[e.a].hw = Math.max(g.nodes[e.a].hw, e.hw);
      g.nodes[e.b].hw = Math.max(g.nodes[e.b].hw, e.hw);
    }
    g.trees = {};
  }
  // Shortest-path tree toward a target node, cached. nxt[n] is the next node on the way to the target.
  var heap = new Heap();
  function tree(g, target) {
    let t = g.trees[target];
    if (t) return t;
    const N = g.nodes.length;
    const dist = new Float64Array(N).fill(Infinity), nxt = new Int32Array(N).fill(-1), ne = new Int32Array(N).fill(-1);
    dist[target] = 0; heap.n = 0; heap.push(0, target);
    while (heap.n) {
      const key = heap.k[0], u = heap.pop();
      if (key > dist[u]) continue;
      for (const a of g.adj[u]) {
        const nd = dist[u] + a.cost;
        if (nd < dist[a.to]) { dist[a.to] = nd; nxt[a.to] = u; ne[a.to] = a.e; heap.push(nd, a.to); }
      }
    }
    return (g.trees[target] = { dist, nxt, ne });
  }

  // ---------- the crowd ----------
  // agent states
  var S = { OFF: 0, WALK: 1, ENTER: 2, INSIDE: 3, EXIT: 4, SPOT: 5, DWELL: 6, ESCWAIT: 7, ESC: 8, IDLE: 9 };
  // render poses
  var POSE = { WALK: 0, IDLE: 1, SIT: 2, HIDDEN: 3, RIDE: 4 };

  function create(nav, opts) {
    opts = opts || {};
    const rnd = rngFrom(opts.seed == null ? 12345 : opts.seed);
    const U = opts.units || 4;
    const g = buildGraph(nav, U);                 // plan units per metre
    const speedMul = opts.speedMul || 3;       // the game runs faster than real life
    const dwellMul = opts.dwell == null ? 1 : opts.dwell;
    const cap = opts.max || 600;
    const R = 4.5 * U / 4;                     // personal space radius
    const crowd = {
      graph: g, cap, units: U, n: 0, hi: 0, time: 0,
      pos: new Float32Array(cap * 3), heading: new Float32Array(cap), pose: new Uint8Array(cap),
      phase: new Float32Array(cap), mov: new Float32Array(cap),
      look: { gen: new Uint32Array(cap), skin: new Uint8Array(cap), hair: new Uint8Array(cap), shirt: new Uint8Array(cap), pants: new Uint8Array(cap), bag: new Uint8Array(cap), bags: new Uint8Array(cap), height: new Float32Array(cap), girth: new Float32Array(cap), child: new Uint8Array(cap) },
      state: new Uint8Array(cap),
      target: 0, mood: 0.5,
      stats: { spawned: 0, left: 0, visits: {}, passed: 0, rides: 0 },
      onVisit: null
    };
    const A = new Array(cap);
    crowd.agents = A;
    for (let i = 0; i < cap; i++) A[i] = { on: false };
    const free = [];
    for (let i = cap - 1; i >= 0; i--) free.push(i);
    const escGate = {};
    let spawnAcc = 0, leaveAcc = 0, genCounter = 1;

    // spatial hash
    const HS = 4096, head = new Int32Array(HS), nextI = new Int32Array(cap);
    const cellOf = (x, y, lv) => ((((x / R) | 0) * 73856093) ^ (((y / R) | 0) * 19349663) ^ (lv * 83492791)) & (HS - 1);

    function levelZ(lv) { return g.levelZ[lv] || 0; }
    function pickWeighted(items, wf) {
      let tot = 0; const w = items.map(it => { const v = Math.max(0, wf(it)); tot += v; return v; });
      if (tot <= 0) return null;
      let r = rnd() * tot;
      for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
      return items[items.length - 1];
    }
    function pickEntrance() { return pickWeighted(g.entrances, e => e.weight); }

    // What a visit will be: entrance, a few shops weighted by appeal and nearness, maybe food, maybe a rest at a court, then home.
    function makeAgenda(ent, mood) {
      const open = g.stores.filter(s => s.open);
      const shops = open.filter(s => s.kind !== 'food');
      const food = open.filter(s => s.kind === 'food');
      const steps = [];
      const base = 1.5 + 3.5 * mood;
      const nStops = Math.max(2, Math.round(base * (0.5 + rnd())));
      let prev = ent.node;
      const taken = new Set();
      const foodAt = Math.max(1, Math.floor(nStops / 2));
      let ate = false;
      for (let k = 0; k < nStops && shops.length; k++) {
        const pt = tree(g, prev);
        const s = pickWeighted(shops, st => taken.has(st.id) ? 0 : Math.pow(0.12 + st.appeal, 1.3) * (st.kind === 'anchor' ? 1.5 : 1) / (1 + (pt.dist[st.node] === Infinity ? 1e6 : pt.dist[st.node]) / 280));
        if (!s) break;
        taken.add(s.id);
        steps.push({ t: 's', store: s, node: s.node, dur: (s.kind === 'anchor' ? 25 + rnd() * 35 : 8 + rnd() * 20) * dwellMul });
        prev = s.node;
        if (!ate && k + 1 >= foodAt && rnd() < 0.55) { ate = true; addFood(steps, prev); prev = steps[steps.length - 1].node; }
        if (rnd() < 0.2 && g.courts.length) {
          const c = pickWeighted(g.courts, c => c.kind === 'food' ? 0.3 : 1);
          steps.push({ t: 'c', court: c, node: c.node, dur: (6 + rnd() * 14) * dwellMul, sit: rnd() < 0.6 });
          prev = c.node;
        }
      }
      if (!ate && rnd() < 0.3) addFood(steps, prev);
      if (!steps.length) {
        const c = g.courts.length ? pickWeighted(g.courts, () => 1) : null;
        if (c) steps.push({ t: 'c', court: c, node: c.node, dur: (6 + rnd() * 10) * dwellMul, sit: true });
      }
      // home by the same door half the time, otherwise the nearest other one
      const ex = rnd() < 0.5 ? ent : pickEntrance();
      steps.push({ t: 'x', node: ex.node, ent: ex });
      return steps;
      function addFood(steps, from) {
        const pt = tree(g, from);
        if (food.length) {
          const f = pickWeighted(food, st => Math.pow(0.12 + st.appeal, 1.3) / (1 + (pt.dist[st.node] === Infinity ? 1e6 : pt.dist[st.node]) / 280));
          steps.push({ t: 's', store: f, node: f.node, dur: (5 + rnd() * 8) * dwellMul });
        }
        const fc = g.courts.filter(c => c.kind === 'food');
        if (fc.length) {
          const c = fc[(rnd() * fc.length) | 0];
          steps.push({ t: 'c', court: c, node: c.node, dur: (14 + rnd() * 20) * dwellMul, sit: true });
        }
      }
    }

    function spawnGroup() {
      const ent = pickEntrance();
      if (!ent || !free.length) return 0;
      const r = rnd();
      let size = r < 0.55 ? 1 : r < 0.85 ? 2 : r < 0.95 ? 3 : 4;
      size = Math.min(size, free.length);
      const agenda = makeAgenda(ent, crowd.mood);
      const sp = (1.15 + rnd() * 0.45) * U * speedMul;
      for (let m = 0; m < size; m++) {
        const i = free.pop(), a = A[i];
        const child = size > 2 && m === size - 1 && rnd() < 0.5;
        a.on = true; a.i = i;
        a.x = ent.x + (rnd() - 0.5) * 6; a.y = ent.y + (rnd() - 0.5) * 6;
        a.vx = 0; a.vy = 0; a.h = rnd() * 6.28;
        a.cur = ent.node; a.tgt = -1; a.edge = -1; a.dest = -1;
        a.lv = ent.level; a.ez = levelZ(ent.level);
        a.lane = (0.3 + rnd() * 0.6);
        a.sp = sp * (child ? 0.8 : 0.95 + rnd() * 0.1);
        a.agenda = agenda; a.step = -1; a.state = S.WALK; a.t = 0;
        a.t0 = m * 0.3; a.leaving = false; a.bags = 0; a.slow = 1; a.phase = rnd() * 6.28; a.mov = 0;
        a.spot = null; a.store = null; a.ride = null; a.sit = false;
        const L = crowd.look;
        L.gen[i] = genCounter++;
        L.skin[i] = (rnd() * 6) | 0; L.hair[i] = (rnd() * 7) | 0; L.shirt[i] = (rnd() * 11) | 0; L.pants[i] = (rnd() * 5) | 0;
        L.bag[i] = (rnd() * 6) | 0; L.bags[i] = 0; L.child[i] = child ? 1 : 0;
        L.height[i] = child ? 0.68 : 0.92 + rnd() * 0.18; L.girth[i] = child ? 0.75 : 0.9 + rnd() * 0.25;
        advance(a);
        crowd.n++; crowd.stats.spawned++;
        if (i + 1 > crowd.hi) crowd.hi = i + 1;
      }
      return size;
    }
    function despawn(a) {
      a.on = false; crowd.state[a.i] = S.OFF; crowd.pose[a.i] = POSE.HIDDEN;
      free.push(a.i); crowd.n--; crowd.stats.left++;
      while (crowd.hi > 0 && !A[crowd.hi - 1].on) crowd.hi--;
    }
    // Move on to the next step of the agenda.
    function advance(a) {
      a.step++;
      const s = a.agenda[a.step];
      if (!s) { despawn(a); return; }
      a.dest = s.node; a.tgt = -1; a.state = S.WALK;
      if (s.t !== 'x' && tree(g, a.dest).nxt[a.cur] < 0 && a.cur !== a.dest) { a.step++; if (a.step >= a.agenda.length) { despawn(a); return; } advance2(a); }
    }
    function advance2(a) { a.step--; advance(a); }
    function leaveNow(a, force) {
      // Shoppers mid-door or on an escalator finish that first, then head out.
      if (!force && (a.state === S.ENTER || a.state === S.INSIDE || a.state === S.EXIT || a.state === S.ESC || a.state === S.ESCWAIT)) { a.after = true; return; }
      const ent = pickEntrance();
      a.agenda = [{ t: 'x', node: ent.node, ent }]; a.step = -1; a.leaving = true; a.after = false;
      a.state = S.WALK; advance(a);
    }

    function arrive(a) {
      const s = a.agenda[a.step];
      if (!s) { despawn(a); return; }
      if (s.t === 'x') { despawn(a); return; }
      if (s.t === 's') {
        const st = s.store;
        if (st.open && rnd() < 0.92) {
          a.state = S.ENTER; a.store = st; a.sx = st.inside[0]; a.sy = st.inside[1];
          crowd.stats.visits[st.id] = (crowd.stats.visits[st.id] || 0) + 1;
          if (crowd.onVisit) crowd.onVisit({ store: st, agent: a.i, time: crowd.time });
        } else {
          crowd.stats.passed++;
          a.state = S.IDLE; a.t = 1.2 + rnd() * 2; a.face = Math.atan2(st.inside[1] - a.y, st.inside[0] - a.x);
        }
      } else if (s.t === 'c') {
        const c = s.court, ang = rnd() * 6.283, rr = c.r * 0.8 * Math.sqrt(rnd());
        a.sx = c.x + Math.cos(ang) * rr; a.sy = c.y + Math.sin(ang) * rr;
        a.state = S.SPOT; a.sit = c.kind === 'food' || s.sit;
      }
    }

    function nextHop(a) {
      if (a.cur === a.dest) return false;
      const t = tree(g, a.dest), nx = t.nxt[a.cur];
      if (nx < 0) return false;
      a.tgt = nx; a.edge = t.ne[a.cur];
      return true;
    }

    function stepAgent(a, dt) {
      const i = a.i, nodes = g.nodes;
      let moving = true, tx = a.x, ty = a.y, sp = a.sp, free_ = false;
      switch (a.state) {
        case S.WALK: {
          if (a.after && a.tgt < 0) leaveNow(a, true);
          if (a.state !== S.WALK) { moving = false; break; }
          if (a.tgt < 0) {
            if (a.cur === a.dest) { arrive(a); if (a.state === S.WALK) { moving = false; break; } }
            else if (!nextHop(a)) { advance(a); moving = false; break; }
          }
          if (a.state !== S.WALK) { moving = false; break; }
          const e = g.edges[a.edge];
          if (e.kind === 'esc') { a.state = S.ESCWAIT; a.t = 0; moving = false; break; }
          const Aa = nodes[a.cur], B = nodes[a.tgt];
          const dx = B.x - Aa.x, dy = B.y - Aa.y, L = Math.hypot(dx, dy) || 1;
          const nx = dy / L, ny = -dx / L;
          const db = Math.hypot(B.x - a.x, B.y - a.y);
          const fade = clamp(db / (e.hw * 2), 0, 1);
          const off = a.lane * (e.hw - 2.5 * U / 4) * fade * (e.kind === 'corridor' ? 1 : 0.3);
          tx = B.x + nx * off; ty = B.y + ny * off;
          if (db < 1.8 * U / 4 + a.sp * dt * 0.5) { a.cur = a.tgt; a.tgt = -1; if (a.cur === a.dest) { moving = false; arrive(a); } }
          break;
        }
        case S.ENTER: case S.EXIT: case S.SPOT:
          tx = a.sx; ty = a.sy; free_ = true;
          if (Math.hypot(tx - a.x, ty - a.y) < 1.2 * U / 4 + a.sp * dt * 0.5) {
            if (a.state === S.ENTER) { a.state = S.INSIDE; a.t = a.agenda[a.step].dur * (0.8 + a.t0 * 0.2); a.x = tx; a.y = ty; }
            else if (a.state === S.EXIT) { a.cur = a.store.node; a.state = S.WALK; if (a.after) { a.after = false; leaveNow(a, true); } else advance(a); }
            else { a.state = S.DWELL; a.t = a.agenda[a.step].dur * (0.9 + rnd() * 0.2); }
            moving = false;
          }
          break;
        case S.INSIDE:
          a.t -= dt; moving = false;
          if (a.t <= 0) {
            const st = a.store;
            if (st.kind !== 'food' && rnd() < 0.6) { a.bags++; crowd.look.bags[i] = Math.min(255, a.bags); }
            a.x = st.inside[0]; a.y = st.inside[1]; a.sx = st.door[0]; a.sy = st.door[1]; a.state = S.EXIT;
          }
          break;
        case S.DWELL:
          a.t -= dt; moving = false;
          if (a.t <= 0) { a.sit = false; if (a.after) { a.after = false; leaveNow(a, true); } else advance(a); }
          break;
        case S.IDLE:
          a.t -= dt; moving = false;
          if (a.t <= 0) { if (a.after) { a.after = false; leaveNow(a, true); } else advance(a); }
          break;
        case S.ESCWAIT: {
          moving = false;
          const e = g.edges[a.edge], key = a.edge * 2 + (a.cur === e.a ? 0 : 1);
          const gate = escGate[key] || 0;
          if (crowd.time >= gate) {
            escGate[key] = crowd.time + 0.5;
            const P = nodes[a.cur], Q = nodes[a.tgt];
            a.ride = { t: 0, len: Math.max(2 * U, Math.hypot(Q.x - P.x, Q.y - P.y)), sx: P.x, sy: P.y, ex: Q.x, ey: Q.y, z0: levelZ(P.level), z1: levelZ(Q.level) };
            a.state = S.ESC; crowd.stats.rides++;
          }
          break;
        }
        case S.ESC: {
          moving = false;
          const r = a.ride;
          r.t += dt * (opts.escSpeed || 10 * U / 4) / r.len;
          const t = Math.min(1, r.t);
          a.x = lerp(r.sx, r.ex, t); a.y = lerp(r.sy, r.ey, t); a.ez = lerp(r.z0, r.z1, t);
          a.h = Math.atan2(r.ey - r.sy, r.ex - r.sx);
          if (t >= 1) { a.cur = a.tgt; a.tgt = -1; a.lv = nodes[a.cur].level; a.ez = r.z1; a.state = S.WALK; a.ride = null; }
          break;
        }
        default: moving = false;
      }
      // ---- steering ----
      const crowded = a.state === S.WALK || a.state === S.ENTER || a.state === S.EXIT || a.state === S.SPOT || a.state === S.ESCWAIT || a.state === S.IDLE || a.state === S.DWELL;
      let sx = 0, sy = 0, slow = 1;
      if (crowded) {
        const cx = (a.x / R) | 0, cy = (a.y / R) | 0;
        const fx = a.vx, fy = a.vy, fm = Math.hypot(fx, fy);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const k = (((cx + ox) * 73856093) ^ ((cy + oy) * 19349663) ^ (a.lv * 83492791)) & (HS - 1);
          for (let j = head[k]; j >= 0; j = nextI[j]) {
            if (j === i) continue;
            const b = A[j], dx = a.x - b.x, dy = a.y - b.y;
            if (b.lv !== a.lv) continue;
            const d = Math.hypot(dx, dy);
            if (d >= R || d < 0.001) { if (d < 0.001) { sx += (rnd() - 0.5); sy += (rnd() - 0.5); } continue; }
            const f = (R - d) / R;
            sx += dx / d * f; sy += dy / d * f;
            if (moving && fm > 0.01 && (-dx * fx - dy * fy) / (d * fm) > 0.75) slow = Math.min(slow, 0.35 + 0.65 * d / R);
          }
        }
      }
      a.slow += (slow - a.slow) * Math.min(1, dt * 6);
      let dvx = 0, dvy = 0;
      if (moving) {
        const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy) || 1;
        const v = sp * a.slow * (free_ ? 0.8 : 1) * Math.min(1, d / (2 * U / 4) + 0.3);
        dvx = dx / d * v; dvy = dy / d * v;
      }
      if (a.state !== S.ESC && a.state !== S.INSIDE) {
        const k = moving ? sp * 1.1 : sp * 0.35;
        dvx += sx * k; dvy += sy * k;
        const sm = Math.min(1, dt * 5);
        a.vx += (dvx - a.vx) * sm; a.vy += (dvy - a.vy) * sm;
        const px = a.x, py = a.y;
        a.x += a.vx * dt; a.y += a.vy * dt;
        // stay inside the corridor while walking one
        if (a.state === S.WALK && a.tgt >= 0) {
          const e = g.edges[a.edge];
          if (e.kind !== 'esc') {
            const Aa = nodes[a.cur], B = nodes[a.tgt];
            const dx = B.x - Aa.x, dy = B.y - Aa.y, L = Math.hypot(dx, dy) || 1;
            const nx = dy / L, ny = -dx / L, t = ((a.x - Aa.x) * dx + (a.y - Aa.y) * dy) / (L * L);
            const lat = (a.x - Aa.x) * nx + (a.y - Aa.y) * ny, lim = e.hw - 1.2 * U / 4;
            if (t > -0.05 && t < 1.05 && Math.abs(lat) > lim) {
              const fix = lat - Math.sign(lat) * lim;
              a.x -= nx * fix; a.y -= ny * fix;
            }
          }
        }
        const mv = Math.hypot(a.x - px, a.y - py);
        a.phase += mv / (0.75 * U) * Math.PI;
        a.mov += ((mv / dt > 0.25 * U ? 1 : 0) - a.mov) * Math.min(1, dt * 8);
        // face where we go
        const spd = Math.hypot(a.vx, a.vy);
        let want = a.h;
        if (a.state === S.IDLE && a.face !== undefined) want = a.face;
        else if (spd > 0.15 * U) want = Math.atan2(a.vy, a.vx);
        let dh = want - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        a.h += dh * Math.min(1, dt * 8);
      } else {
        a.mov += (0 - a.mov) * Math.min(1, dt * 8);
      }
    }

    crowd.setFootfall = function (f) {
      if (f.target != null) crowd.target = clamp(Math.round(f.target), 0, cap);
      if (f.mood != null) crowd.mood = clamp(f.mood, 0, 1);
    };
    // Update leases and appeal in place. Unknown ids are added to the graph.
    crowd.setStores = function (arr) {
      let grew = false;
      for (const s of arr) {
        const st = g.storeById[s.id];
        if (st) {
          if (s.appeal != null) st.appeal = s.appeal;
          if (s.open != null) st.open = s.open;
          if (s.kind) st.kind = s.kind;
        } else { addStore(g, s); grew = true; }
      }
      if (grew) finish(g); else g.trees = {};
    };
    crowd.update = function (dtIn) {
      let left = Math.min(dtIn, 0.5);
      while (left > 1e-6) {
        const dt = Math.min(left, 0.05);
        left -= dt;
        crowd.time += dt;
        // crowd size follows the target
        const gap = crowd.target - crowd.n;
        if (gap > 0) {
          spawnAcc += Math.min(10, Math.max(0.5, gap * 0.4)) * dt;
          while (spawnAcc >= 1 && crowd.n < crowd.target) { spawnAcc -= 1; spawnGroup(); }
        } else spawnAcc = 0;
        if (crowd.n > crowd.target * 1.1 + 3) {
          leaveAcc += 6 * dt;
          while (leaveAcc >= 1) {
            leaveAcc -= 1;
            for (let tries = 0; tries < 8; tries++) {
              const a = A[(rnd() * crowd.hi) | 0];
              if (a && a.on && !a.leaving) { leaveNow(a); break; }
            }
          }
        } else leaveAcc = 0;
        // hash the crowd
        head.fill(-1);
        for (let i = 0; i < crowd.hi; i++) {
          const a = A[i];
          if (!a.on || a.state === S.INSIDE || a.state === S.ESC) continue;
          const k = cellOf(a.x, a.y, a.lv);
          nextI[i] = head[k]; head[k] = i;
        }
        for (let i = 0; i < crowd.hi; i++) { const a = A[i]; if (a.on) stepAgent(a, dt); }
      }
      // publish
      const P = crowd.pos;
      for (let i = 0; i < crowd.hi; i++) {
        const a = A[i];
        if (!a.on) { crowd.pose[i] = POSE.HIDDEN; crowd.state[i] = S.OFF; continue; }
        P[i * 3] = a.x; P[i * 3 + 1] = a.y; P[i * 3 + 2] = a.state === S.ESC ? a.ez : levelZ(a.lv);
        crowd.heading[i] = a.h; crowd.phase[i] = a.phase; crowd.mov[i] = a.mov; crowd.state[i] = a.state;
        crowd.pose[i] = a.state === S.INSIDE ? POSE.HIDDEN : a.state === S.ESC || a.state === S.ESCWAIT && false ? POSE.RIDE
          : a.state === S.DWELL && a.sit ? POSE.SIT : (a.state === S.DWELL || a.state === S.IDLE || (a.state === S.ESCWAIT)) ? POSE.IDLE : a.mov < 0.1 ? POSE.IDLE : POSE.WALK;
      }
    };
    return crowd;
  }

  // ---------- Three.js renderer ----------
  var SKIN = [0xf1c9a5, 0xe0ac84, 0xc68863, 0xa86b47, 0x7b4a2e, 0x4f2f1e];
  var HAIR = [0x1c1a1a, 0x3b2a20, 0x5a3a24, 0x8a5a32, 0xc9a45a, 0xa7a29a, 0x7a2f1d];
  var SHIRT = [0xc0643e, 0xd9a441, 0x7d8450, 0xefe4cf, 0x5f7f98, 0x9fb08a, 0x7a4e63, 0x3b3a3e, 0xa4452c, 0xcdb48a, 0x4c8079];
  var PANTS = [0x4a5d78, 0xb89f78, 0x3b3a3e, 0xe6dcc6, 0x6b4a36];
  var BAG = [0xc0643e, 0xefe4cf, 0x7d8450, 0xd9a441, 0x5f7f98, 0x3b3a3e];

  function createRenderer(THREE, crowd, o) {
    o = o || {};
    const scene = o.scene, U = crowd.units, M = U; // model is authored in metres, scaled by units per metre
    const toWorld = o.toWorld || ((x, y, z, out) => { out[0] = x; out[1] = z; out[2] = y; });
    const yawFix = o.yawOffset || 0;
    const cam = o.camera || null, lod2 = Math.pow(o.lodDist || 700, 2);
    const cap = crowd.cap;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    function inst(geo, m, colored) {
      const mesh = new THREE.InstancedMesh(geo, m || mat, cap);
      mesh.frustumCulled = false; mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (colored !== false) { mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      if (scene) scene.add(mesh);
      return mesh;
    }
    const gTorso = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8); gTorso.scale(1, 1, 0.62); gTorso.translate(0, 1.13, 0);
    const gHead = new THREE.SphereGeometry(0.115, 8, 6); gHead.translate(0, 1.58, 0);
    const gHair = new THREE.SphereGeometry(0.124, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62); gHair.translate(0, 1.59, -0.01);
    const gLeg = new THREE.BoxGeometry(0.15, 0.82, 0.17); gLeg.translate(0, -0.41, 0);
    const gArm = new THREE.BoxGeometry(0.09, 0.58, 0.1); gArm.translate(0, -0.29, 0);
    const gBag = new THREE.BoxGeometry(0.2, 0.26, 0.1); gBag.translate(0, -0.13, 0);
    const gShadow = new THREE.CircleGeometry(0.32, 10); gShadow.rotateX(-Math.PI / 2);
    const mShadow = new THREE.MeshBasicMaterial({ color: 0x2a1c14, transparent: true, opacity: 0.28, depthWrite: false });
    const mesh = {
      torso: inst(gTorso), head: inst(gHead), hair: inst(gHair), legL: inst(gLeg), legR: inst(gLeg),
      armL: inst(gArm), armR: inst(gArm), bag: inst(gBag), shadow: inst(gShadow, mShadow, false)
    };
    const all = Object.keys(mesh).map(k => mesh[k]);
    const seen = new Uint32Array(cap), col = new THREE.Color(), w = [0, 0, 0];

    function paint(i) {
      const L = crowd.look, sh = SHIRT[L.shirt[i]], pn = PANTS[L.pants[i]];
      const set = (m, hex) => { col.setHex(hex); m.setColorAt(i, col); };
      set(mesh.torso, sh); set(mesh.armL, sh); set(mesh.armR, sh);
      set(mesh.legL, pn); set(mesh.legR, pn);
      set(mesh.head, SKIN[L.skin[i]]); set(mesh.hair, HAIR[L.hair[i]]); set(mesh.bag, BAG[L.bag[i]]);
      seen[i] = L.gen[i];
    }
    // M = T(p) * Ry(psi) * T(pivot) * Rx(theta) * T(local) * S(sx,sy,sz), written column-major.
    function put(m, i, px, py, pz, c, s, ox, oy, oz, th, lx, ly, lz, sx, sy, sz) {
      const ct = Math.cos(th), st = Math.sin(th), a = m.instanceMatrix.array, o = i * 16;
      const rx = lx, ry = ct * ly - st * lz, rz = st * ly + ct * lz;
      const tx = ox + rx, ty = oy + ry, tz = oz + rz;
      a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
      a[o + 4] = s * st * sy; a[o + 5] = ct * sy; a[o + 6] = c * st * sy; a[o + 7] = 0;
      a[o + 8] = s * ct * sz; a[o + 9] = -st * sz; a[o + 10] = c * ct * sz; a[o + 11] = 0;
      a[o + 12] = px + c * tx + s * tz; a[o + 13] = py + ty; a[o + 14] = pz - s * tx + c * tz; a[o + 15] = 1;
    }
    function hide(i) {
      for (const m of all) {
        const a = m.instanceMatrix.array, o = i * 16;
        for (let k = 0; k < 16; k++) a[o + k] = 0;
        a[o + 15] = 1;
      }
    }
    function update() {
      const hi = crowd.hi, P = crowd.pos;
      for (const m of all) m.count = hi;
      const cx = cam ? cam.position.x : 0, cy = cam ? cam.position.y : 0, cz = cam ? cam.position.z : 0;
      for (let i = 0; i < hi; i++) {
        const pose = crowd.pose[i];
        if (pose === POSE.HIDDEN || crowd.state[i] === 0) { hide(i); continue; }
        if (seen[i] !== crowd.look.gen[i]) paint(i);
        toWorld(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], w);
        const h = crowd.heading[i], psi = Math.PI / 2 - h + yawFix, c = Math.cos(psi), s = Math.sin(psi);
        const L = crowd.look, ht = L.height[i] * M, gi = L.girth[i];
        let swing = 0, bob = 0, lift = 0, sitAng = 0, legZ = 0;
        const near = !cam || ((w[0] - cx) * (w[0] - cx) + (w[1] - cy) * (w[1] - cy) + (w[2] - cz) * (w[2] - cz)) < lod2;
        if (pose === POSE.WALK && near) {
          const amp = crowd.mov[i]; swing = Math.sin(crowd.phase[i]) * 0.55 * amp; bob = Math.abs(Math.sin(crowd.phase[i])) * 0.03 * amp * ht;
        } else if (pose === POSE.SIT) { sitAng = -1.45; lift = -0.37 * ht; legZ = 0.1 * ht; }
        const px = w[0], py = w[1] + bob + lift, pz = w[2];
        const sy = L.height[i] * M, sxz = gi * M;
        // body
        put(mesh.torso, i, px, py, pz, c, s, 0, 0, 0, 0, 0, 0, 0, sxz, sy, sxz);
        put(mesh.head, i, px, py, pz, c, s, 0, 0, 0, 0, 0, 0, 0, sxz, sy, sxz);
        put(mesh.hair, i, px, py, pz, c, s, 0, 0, 0, 0, 0, 0, 0, sxz, sy, sxz);
        const hipY = 0.82 * sy, shY = 1.40 * sy;
        put(mesh.legL, i, px, py, pz, c, s, -0.1 * sxz, hipY, 0, sitAng || swing, 0, 0, legZ, sxz, sy, sxz);
        put(mesh.legR, i, px, py, pz, c, s, 0.1 * sxz, hipY, 0, sitAng || -swing, 0, 0, legZ, sxz, sy, sxz);
        const aL = pose === POSE.SIT ? -0.5 : -swing * 0.8, aR = pose === POSE.SIT ? -0.5 : swing * 0.8;
        put(mesh.armL, i, px, py, pz, c, s, -0.27 * sxz, shY, 0, aL, 0, 0, 0, sxz, sy, sxz);
        put(mesh.armR, i, px, py, pz, c, s, 0.27 * sxz, shY, 0, aR, 0, 0, 0, sxz, sy, sxz);
        if (L.bags[i] > 0) put(mesh.bag, i, px, py, pz, c, s, 0.27 * sxz, shY, 0, aR, 0, -0.56 * sy, 0.02, M, M, M);
        else { const a = mesh.bag.instanceMatrix.array, o = i * 16; for (let k = 0; k < 16; k++) a[o + k] = 0; a[o + 15] = 1; }
        put(mesh.shadow, i, w[0], w[1] + 0.02 * M, w[2], 1, 0, 0, 0, 0, 0, 0, 0, 0, M * gi, 1, M * gi);
      }
      for (const m of all) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
    function dispose() {
      for (const m of all) { if (scene) scene.remove(m); m.dispose(); }
      [gTorso, gHead, gHair, gLeg, gArm, gBag, gShadow].forEach(x => x.dispose()); mat.dispose(); mShadow.dispose();
    }
    return { update, dispose, meshes: mesh };
  }

  return { create, createRenderer, buildGraph, STATE: S, POSE, version: '0.1.0' };
});
