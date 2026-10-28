/* A small stand-in mall for the people demo and tests, in the shape Vacancy.peopleNav() returns (meters).
   Two floors: a main walk with two cross walks, a court in the middle, a food court upstairs, escalators and four entrances. */
(function (root) {
  function build() {
    var H = 7, nav = { levels: [{ id: 0, z: 0 }, { id: 1, z: H }], corridors: [], courts: [], stores: [], escalators: [], entrances: [] };
    var walks = [[[-160, 0], [160, 0]], [[-100, -70], [-100, 70]], [[100, -70], [100, 70]], [[0, -70], [0, 70]]];
    [0, 1].forEach(function (lv) {
      walks.forEach(function (p) { nav.corridors.push({ level: lv, pts: p, halfWidth: 4 }); });
      var n = 0;
      // shops either side of each walk
      walks.forEach(function (p, wi) {
        var ax = p[0][0] === p[1][0] ? 'y' : 'x', a = p[0], b = p[1], L = Math.abs(ax === 'x' ? b[0] - a[0] : b[1] - a[1]);
        for (var s = -L / 2 + 14; s < L / 2 - 10; s += 22) {
          [-1, 1].forEach(function (side) {
            var cx = ax === 'x' ? s + (a[0] + b[0]) / 2 : a[0], cy = ax === 'x' ? a[1] : s + (a[1] + b[1]) / 2;
            if (Math.abs(cx) < 14 && Math.abs(cy) < 14) return;
            var d = ax === 'x' ? [cx, cy + side * 4.5] : [cx + side * 4.5, cy], ins = ax === 'x' ? [cx, cy + side * 7] : [cx + side * 7, cy];
            var food = lv === 1 && wi === 0 && side === 1 && n % 3 === 0;
            nav.stores.push({ id: 'L' + lv + '-' + wi + '-' + (n++), level: lv, door: d, inside: ins, kind: food ? 'food' : (n % 17 === 0 ? 'anchor' : 'shop'), appeal: 0.25 + ((n * 37) % 70) / 100, open: (n % 5) !== 0 });
          });
        }
      });
      nav.courts.push({ level: lv, x: 0, y: 0, r: 12, kind: 'court' });
    });
    nav.courts.push({ level: 1, x: 60, y: 8, r: 7, kind: 'food' });
    [[-50, 0], [50, 0]].forEach(function (e) { nav.escalators.push({ a: { level: 0, x: e[0], y: e[1] }, b: { level: 1, x: e[0], y: e[1] } }); });
    [[-160, 0], [160, 0], [0, -70], [0, 70]].forEach(function (e) { nav.entrances.push({ level: 0, x: e[0], y: e[1], kind: 'parking' }); });
    return nav;
  }
  if (typeof module === 'object' && module.exports) module.exports = build; else root.VacancyFixtureNav = build;
})(typeof self !== 'undefined' ? self : this);
