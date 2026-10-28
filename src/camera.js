// Camera controls for Vacancy: an eased builder camera plus a freefly / walk mode.
// Renderer-agnostic: it only touches camera.position, camera.rotation, camera.fov and camera.aspect,
// so it works with a Three.js PerspectiveCamera and needs no import. Y is up, the mall floor is the XZ plane.
//
//   import { createCameraController, makeUnselectable } from './src/camera.js';
//   const cam = createCameraController({ camera, domElement: renderer.domElement, bounds: {...} });
//   // each frame: cam.update(dt)
//
// Builder: Shift+left-drag pans, Q/E rotate, wheel zooms toward the cursor, WASD/arrows pan,
//          right- or middle-drag orbits and tilts.
// Freefly: F toggles. Click the view to capture the mouse, WASD moves, Shift sprints, G switches walk/fly,
//          Space/C go up/down while flying. F again flies back to the builder view.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const angleDelta = (from, to) => ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;

const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// Stops text and images from being selected or dragged anywhere in the game, except in form fields.
export function makeUnselectable(root = document.body) {
  const doc = root.ownerDocument;
  if (!doc.getElementById('vacancy-no-select')) {
    const style = doc.createElement('style');
    style.id = 'vacancy-no-select';
    style.textContent =
      'html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}' +
      'img,canvas,svg{-webkit-user-drag:none;user-drag:none}' +
      'input,textarea,[contenteditable="true"]{-webkit-user-select:text;user-select:text}';
    doc.head.appendChild(style);
  }
  const block = (e) => { if (!isTyping(e.target)) e.preventDefault(); };
  root.addEventListener('selectstart', block);
  root.addEventListener('dragstart', block);
  return () => { root.removeEventListener('selectstart', block); root.removeEventListener('dragstart', block); };
}

export function createCameraController(opts) {
  const { camera, domElement } = opts;
  const o = {
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, // where the builder target and freefly body may go
    start: { x: 0, z: 0, yaw: Math.PI * 0.25, pitch: 0.9, dist: 90 },
    minDist: 12, maxDist: 220,
    minPitch: 0.25, maxPitch: 1.45,
    eyeHeight: 1.7,            // walk eye height above getFloorY
    minFlyHeight: 0.4,         // flying never goes below floor + this
    maxFlyHeight: 60,
    getFloorY: () => 0,        // (x, z, currentY) => floor height under that point; return the level the player stands on
    collide: null,             // (fromX, fromZ, toX, toZ, y) => [x, z]; slide along walls here
    walkSpeed: 4.2, sprintMult: 2.1, flySpeed: 14,
    lookSensitivity: 0.0022,
    onModeChange: null,        // (mode: 'builder' | 'freefly', sub: 'walk' | 'fly') => void
    ...opts,
  };
  o.bounds = { ...{ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, ...opts.bounds };
  o.start = { ...{ x: 0, z: 0, yaw: Math.PI * 0.25, pitch: 0.9, dist: 90 }, ...opts.start };
  camera.rotation.order = 'YXZ';

  // Builder state: goal values are set by input, current values chase them with easing.
  const goal = { x: o.start.x, z: o.start.z, yaw: o.start.yaw, pitch: o.start.pitch, dist: o.start.dist };
  const cur = { ...goal };
  // Freefly state.
  const fly = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, walking: true, bob: 0 };

  let mode = 'builder';
  let trans = null;           // active pose transition between modes
  let enabled = true;
  const keys = new Set();
  const pointer = { down: false, button: -1, x: 0, y: 0, moved: 0, mode: null };
  const api = { dragged: false };

  // ---- builder helpers ----
  const fovTan = () => Math.tan((camera.fov * Math.PI) / 360);
  const clampGoal = () => {
    const b = o.bounds;
    goal.x = clamp(goal.x, b.minX, b.maxX);
    goal.z = clamp(goal.z, b.minZ, b.maxZ);
    goal.dist = clamp(goal.dist, o.minDist, o.maxDist);
    goal.pitch = clamp(goal.pitch, o.minPitch, o.maxPitch);
  };
  const builderPose = (s) => {
    const cp = Math.cos(s.pitch);
    return {
      x: s.x + Math.sin(s.yaw) * cp * s.dist,
      y: Math.sin(s.pitch) * s.dist,
      z: s.z + Math.cos(s.yaw) * cp * s.dist,
      yaw: s.yaw, pitch: -s.pitch,
    };
  };
  // Point on the floor plane under a screen position (ndc -1..1), for a builder state.
  const groundUnder = (s, ndcX, ndcY) => {
    const p = builderPose(s);
    const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw), sp = Math.sin(s.pitch), cp = Math.cos(s.pitch);
    const f = [-sy * cp, -sp, -cy * cp];
    const r = [cy, 0, -sy];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const t = fovTan(), a = camera.aspect || 1;
    const d = [0, 1, 2].map((i) => f[i] + ndcX * t * a * r[i] + ndcY * t * u[i]);
    if (d[1] >= -1e-4) return null;
    const k = -p.y / d[1];
    return { x: p.x + d[0] * k, z: p.z + d[2] * k };
  };
  const pxToWorld = () => (2 * fovTan() * goal.dist) / (domElement.clientHeight || 1);
  const panGoal = (rightAmt, forwardAmt) => {
    const sy = Math.sin(goal.yaw), cy = Math.cos(goal.yaw);
    goal.x += cy * rightAmt - sy * forwardAmt;
    goal.z += -sy * rightAmt - cy * forwardAmt;
  };

  // ---- applying poses ----
  const applyPose = (p) => {
    camera.position.set(p.x, p.y, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0);
  };
  const currentCameraPose = () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x });
  const flyPose = () => ({ x: fly.x, y: fly.y, z: fly.z, yaw: fly.yaw, pitch: fly.pitch });

  // ---- mode switching ----
  const notify = () => o.onModeChange && o.onModeChange(mode, fly.walking ? 'walk' : 'fly');
  function beginTransition(to, duration) {
    trans = { from: currentCameraPose(), to, t: 0, dur: duration };
  }
  function enterFreefly() {
    if (mode === 'freefly') return;
    const floor = o.getFloorY(cur.x, cur.z, 0);
    fly.x = cur.x; fly.z = cur.z; fly.y = floor + o.eyeHeight;
    fly.yaw = cur.yaw; fly.pitch = -0.08; fly.vx = fly.vy = fly.vz = 0; fly.walking = true;
    mode = 'freefly';
    beginTransition(flyPose(), 1.1);
    notify();
  }
  function exitFreefly() {
    if (mode !== 'freefly') return;
    if (document.pointerLockElement === domElement) document.exitPointerLock();
    // Land the builder view on where the player stood, facing the way they were facing.
    goal.x = cur.x = fly.x; goal.z = cur.z = fly.z; goal.yaw = cur.yaw = fly.yaw;
    clampGoal();
    cur.x = goal.x; cur.z = goal.z;
    cur.pitch = goal.pitch; cur.dist = goal.dist;
    mode = 'builder';
    beginTransition(builderPose(cur), 1.0);
    notify();
  }
  api.toggleFreefly = () => (mode === 'freefly' ? exitFreefly() : enterFreefly());
  api.setFreefly = (on) => (on ? enterFreefly() : exitFreefly());
  api.toggleWalk = () => {
    if (mode !== 'freefly') return;
    fly.walking = !fly.walking;
    notify();
  };

  // ---- input ----
  const onKeyDown = (e) => {
    if (!enabled || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    if (k === 'KeyF' && !e.repeat) { api.toggleFreefly(); e.preventDefault(); return; }
    if (k === 'KeyG' && !e.repeat) { api.toggleWalk(); return; }
    if (/^(Key[WASDQEC]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right))$/.test(k)) {
      keys.add(k);
      if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    }
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onBlur = () => { keys.clear(); pointer.down = false; };

  const onPointerDown = (e) => {
    if (!enabled) return;
    pointer.moved = 0;
    pointer.x = e.clientX; pointer.y = e.clientY;
    api.dragged = false;
    if (mode === 'freefly') {
      if (e.button === 0 && document.pointerLockElement !== domElement && domElement.requestPointerLock) {
        const p = domElement.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      }
      pointer.down = true; pointer.button = e.button; pointer.mode = 'look';
      return;
    }
    if (e.button === 0 && e.shiftKey) pointer.mode = 'pan';
    else if (e.button === 1 || e.button === 2) pointer.mode = 'orbit';
    else { pointer.mode = null; return; }
    pointer.down = true; pointer.button = e.button;
    domElement.setPointerCapture && domElement.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    if (!enabled) return;
    const locked = document.pointerLockElement === domElement;
    if (mode === 'freefly') {
      if (!locked && !pointer.down) return; // without pointer lock, drag to look
      const dx = locked ? e.movementX : e.clientX - pointer.x;
      const dy = locked ? e.movementY : e.clientY - pointer.y;
      pointer.x = e.clientX; pointer.y = e.clientY;
      fly.yaw -= dx * o.lookSensitivity;
      fly.pitch = clamp(fly.pitch - dy * o.lookSensitivity, -1.45, 1.45);
      if (trans) trans.to = flyPose();
      return;
    }
    if (!pointer.down) return;
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    if (pointer.moved > 4) api.dragged = true;
    if (pointer.mode === 'pan') {
      // Grab the floor: it follows the cursor one to one, whatever the zoom or tilt.
      const k = pxToWorld();
      panGoal(-dx * k, dy * k / Math.sin(goal.pitch));
      clampGoal();
    } else if (pointer.mode === 'orbit') {
      goal.yaw -= dx * 0.006;
      goal.pitch = clamp(goal.pitch + dy * 0.005, o.minPitch, o.maxPitch);
    }
  };
  const onPointerUp = (e) => {
    pointer.down = false;
    if (domElement.hasPointerCapture && domElement.hasPointerCapture(e.pointerId)) domElement.releasePointerCapture(e.pointerId);
  };
  const onWheel = (e) => {
    if (!enabled || mode !== 'builder') return;
    e.preventDefault();
    const rect = domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const before = groundUnder(goal, nx, ny);
    goal.dist = clamp(goal.dist * Math.exp(delta * 0.0013), o.minDist, o.maxDist);
    const after = groundUnder(goal, nx, ny);
    if (before && after) { goal.x += before.x - after.x; goal.z += before.z - after.z; }
    clampGoal();
  };
  const onContextMenu = (e) => e.preventDefault();
  const onLockChange = () => { pointer.down = false; };

  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);

  // ---- per-frame ----
  function updateBuilder(dt) {
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.2 : 1;
    const side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    if (side || fwd) {
      const len = Math.hypot(side, fwd);
      const speed = goal.dist * 0.7 * fast * dt / len; // pan speed scales with zoom so it always feels the same on screen
      panGoal(side * speed, fwd * speed);
    }
    const spin = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    if (spin) goal.yaw -= spin * 1.7 * dt; 
    clampGoal();
    const t = damp(10, dt);
    cur.x = lerp(cur.x, goal.x, t); cur.z = lerp(cur.z, goal.z, t);
    cur.yaw = lerp(cur.yaw, goal.yaw, damp(9, dt));
    cur.pitch = lerp(cur.pitch, goal.pitch, damp(9, dt));
    cur.dist = lerp(cur.dist, goal.dist, damp(8, dt));
  }
  function updateFreefly(dt) {
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') ? o.sprintMult : 1;
    const side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const up = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0);
    const sy = Math.sin(fly.yaw), cy = Math.cos(fly.yaw);
    const speed = (fly.walking ? o.walkSpeed : o.flySpeed) * sprint;
    // Walking stays on the floor; flying moves along the look direction.
    const cp = fly.walking ? 1 : Math.cos(fly.pitch), sp = fly.walking ? 0 : Math.sin(fly.pitch);
    let tx = (cy * side - sy * cp * fwd), tz = (-sy * side - cy * cp * fwd), ty = sp * fwd + (fly.walking ? 0 : up);
    const len = Math.hypot(tx, ty, tz) || 1;
    const want = side || fwd || up ? speed / Math.max(1, len) : 0;
    const a = damp(want ? 9 : 12, dt);
    fly.vx = lerp(fly.vx, tx * want, a); fly.vy = lerp(fly.vy, ty * want, a); fly.vz = lerp(fly.vz, tz * want, a);
    let nx = fly.x + fly.vx * dt, nz = fly.z + fly.vz * dt;
    const b = o.bounds;
    nx = clamp(nx, b.minX, b.maxX); nz = clamp(nz, b.minZ, b.maxZ);
    if (o.collide) { const r = o.collide(fly.x, fly.z, nx, nz, fly.y); nx = r[0]; nz = r[1]; }
    const moved = Math.hypot(nx - fly.x, nz - fly.z);
    fly.x = nx; fly.z = nz;
    const floor = o.getFloorY(fly.x, fly.z, fly.y);
    if (fly.walking) {
      fly.bob += moved * 2.1;
      const target = floor + o.eyeHeight + Math.sin(fly.bob) * 0.04 * Math.min(1, moved / (dt * o.walkSpeed + 1e-6));
      fly.y = lerp(fly.y, target, damp(14, dt)); // stairs and escalators ease instead of snapping
    } else {
      fly.y = clamp(fly.y + fly.vy * dt, floor + o.minFlyHeight, o.maxFlyHeight);
    }
    if (!fly.walking && fly.y < floor + o.minFlyHeight) fly.y = floor + o.minFlyHeight;
  }
  api.update = (dt) => {
    dt = Math.min(dt, 0.1);
    if (enabled) (mode === 'builder' ? updateBuilder : updateFreefly)(dt);
    if (trans) {
      trans.t += dt / trans.dur;
      const target = mode === 'builder' ? builderPose(cur) : flyPose();
      trans.to = target;
      const e = smooth(clamp(trans.t, 0, 1));
      const a = trans.from, b = target;
      applyPose({
        x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e),
        yaw: a.yaw + angleDelta(a.yaw, b.yaw) * e, pitch: lerp(a.pitch, b.pitch, e),
      });
      if (trans.t >= 1) trans = null;
      return;
    }
    applyPose(mode === 'builder' ? builderPose(cur) : flyPose());
  };

  // ---- public API ----
  Object.defineProperties(api, {
    mode: { get: () => mode },
    walking: { get: () => fly.walking },
    transitioning: { get: () => !!trans },
    pointerLocked: { get: () => document.pointerLockElement === domElement },
    // Where the builder camera is looking (floor point), for UI such as a minimap.
    target: { get: () => ({ x: cur.x, z: cur.z }) },
    player: { get: () => ({ x: fly.x, y: fly.y, z: fly.z, yaw: fly.yaw }) },
  });
  api.focusOn = (x, z, dist) => {
    if (mode !== 'builder') return;
    goal.x = x; goal.z = z;
    if (dist != null) goal.dist = dist;
    clampGoal();
  };
  api.setBounds = (b) => { o.bounds = { ...o.bounds, ...b }; clampGoal(); };
  api.setEnabled = (v) => { enabled = !!v; if (!enabled) keys.clear(); };
  api.snap = () => { Object.assign(cur, goal); trans = null; applyPose(mode === 'builder' ? builderPose(cur) : flyPose()); };
  api.dispose = () => {
    domElement.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    domElement.removeEventListener('wheel', onWheel);
    domElement.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('pointerlockchange', onLockChange);
  };

  clampGoal();
  api.snap();
  return api;
}
