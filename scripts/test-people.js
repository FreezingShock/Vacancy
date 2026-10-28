// Headless test of the people simulation on the fixture mall (and the real one when src/mall-data.js exists).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const P = require('../src/people.js');

function run(name, nav) {
  const c = P.create(nav, { units: 1, seed: 3, max: 500 });
  c.setFootfall({ target: 300, mood: 0.6 });
  let over = 0, samples = 0, worst = 0, t0 = Date.now();
  const visitsSeen = [];
  c.onVisit = e => visitsSeen.push(e.store.id);
  const frames = 30 * 360;
  for (let f = 0; f < frames; f++) {
    c.update(1 / 30);
    if (f % 30 === 0) {
      for (let i = 0; i < c.hi; i++) {
        if (!c.state[i]) continue;
        assert(Number.isFinite(c.pos[i * 3]) && Number.isFinite(c.pos[i * 3 + 1]), name + ': NaN position');
        if (c.state[i] !== P.STATE.WALK || c.pose[i] === P.POSE.HIDDEN) continue;
        // walkers stay within a corridor's width plus a little slack
        const g = c.graph, x = c.pos[i * 3], y = c.pos[i * 3 + 1], lv = Math.round(c.pos[i * 3 + 2] / (g.levelZ[1] || 7));
        let best = Infinity; samples++;
        for (const e of g.edges) {
          const A = g.nodes[e.a], B = g.nodes[e.b];
          if (e.kind === 'esc' || (A.level !== lv && B.level !== lv)) continue;
          const dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L));
          best = Math.min(best, Math.hypot(A.x + t * dx - x, A.y + t * dy - y) - e.hw);
        }
        worst = Math.max(worst, best); if (best > 2) over++;
      }
    }
  }
  const ms = (Date.now() - t0) / frames;
  const visits = Object.keys(c.stats.visits).length;
  console.log(`${name}: ${c.n} on floor, ${c.stats.spawned} spawned, ${c.stats.left} left, ${visits} stores visited, ${c.stats.rides} escalator rides, ${ms.toFixed(2)} ms/frame, worst corridor overshoot ${worst.toFixed(2)} m, ${(100 * over / samples).toFixed(2)}% of walkers over 2 m`);
  assert(c.n > 200 && c.n <= 320, name + ': crowd size should follow the target');
  assert(c.stats.left > 20, name + ': shoppers should finish and leave');
  assert(visits > 10, name + ': shoppers should visit many stores');
  assert(c.stats.rides > 0, name + ': shoppers should use escalators');
  assert(over / samples < 0.01, name + ': walkers left the corridor');
  assert(ms < 4, name + ': simulation too slow');
  // closing a store stops visits to it
  const first = nav.stores[0].id;
  c.setStores([{ id: first, open: false }]);
  const before = c.stats.visits[first] || 0;
  for (let f = 0; f < 30 * 60; f++) c.update(1 / 30);
  assert.strictEqual(c.stats.visits[first] || 0, before, name + ': closed store got visits');
  // dropping the target drains the crowd
  c.setFootfall({ target: 20 });
  for (let f = 0; f < 30 * 240; f++) c.update(1 / 30);
  assert(c.n < 60, name + ': crowd should shrink when footfall drops');
}

run('fixture', require('../demo/fixture-nav.js')());
const real = path.join(__dirname, '..', 'src', 'mall-data.js');
if (fs.existsSync(real)) {
  global.window = global.window || {};
  require(real);
  run('mall', global.window.Vacancy.peopleNav());
}
console.log('ok: people simulation');
