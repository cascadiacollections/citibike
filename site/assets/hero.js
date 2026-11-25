import { STATUS_WORKER_URL } from './config.js';
import { project } from './project.js';
import { decodeStations, totals } from './stations.js';
import { bikeDeltas, tickerLine } from './diff.js';

var INSTALL = 'npm install citibike';
var POLL_MS = 60000;
var MAX_BACKOFF_MS = 10 * 60 * 1000;
var IDLE_MS = 30 * 60 * 1000;
var PARTICLE_POOL = 36;

var hero = document.querySelector('.hero-scene');
var canvas = document.getElementById('city');
var fallback = document.getElementById('hero-fallback');
var freshness = document.getElementById('freshness');
var ticker = document.getElementById('ticker');
var copyBtn = document.getElementById('copy-install');
var copyState = document.getElementById('copy-state');
var zoomBox = document.getElementById('zoom');
var tip = document.getElementById('station-tip');

var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
var themeQuery = window.matchMedia('(prefers-color-scheme: dark)');

var list = [];
var snapshotIso = '';
var mode = 'loading';
var liveUnix = 0;
var heroOnScreen = true;
var sceneReady = false;
var reduced = function () { return motionQuery.matches; };

bindCopy();
requestAnimationFrame(function () {
  requestAnimationFrame(loadSnapshot);
});

function bindCopy() {
  if (!copyBtn) return;
  copyBtn.addEventListener('click', function () {
    noteInteraction();
    writeClipboard(INSTALL).then(function () {
      copyState.textContent = 'Copied';
      setTimeout(function () { copyState.textContent = 'Copy'; }, 2000);
    }).catch(function () {
      copyState.textContent = 'Copy the command above';
      setTimeout(function () { copyState.textContent = 'Copy'; }, 2500);
    });
  });
}

function writeClipboard(text) {
  function legacy() {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try {
        var ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (ok) resolve();
        else reject(new Error('copy failed'));
      } catch (err) {
        document.body.removeChild(area);
        reject(err);
      }
    });
  }
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).catch(legacy);
  }
  return legacy();
}

function stamp(date) {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function renderFreshness() {
  if (!freshness) return;
  if (mode === 'loading') {
    freshness.textContent = 'Loading station snapshot…';
    return;
  }
  if (mode === 'missing') {
    freshness.textContent = 'Station snapshot unavailable';
    return;
  }
  var taken = stamp(new Date(snapshotIso));
  if (mode === 'saver') freshness.textContent = 'snapshot from ' + taken + ' · live updates off (data saver)';
  else if (mode === 'down') freshness.textContent = 'snapshot from ' + taken + ' · live feed unavailable';
  else if (mode === 'stale') freshness.textContent = 'live data from ' + stamp(new Date(liveUnix * 1000)) + ' · refresh failed';
  else if (mode === 'live') freshness.textContent = 'live · feed updated ' + stamp(new Date(liveUnix * 1000));
  else freshness.textContent = 'snapshot from ' + taken;
}

function setStat(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value.toLocaleString(undefined);
}

function paintStats() {
  var sum = totals(list);
  setStat('stat-stations', sum.stations);
  setStat('stat-bikes', sum.bikes);
  setStat('stat-ebikes', sum.ebikes);
}

function saveDataOn() {
  return !!(navigator.connection && navigator.connection.saveData);
}

function loadSnapshot() {
  fetch('data/stations.json', { headers: { Accept: 'application/json' } })
    .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function (payload) {
      list = decodeStations(payload);
      snapshotIso = payload.generatedAt;
      mode = saveDataOn() ? 'saver' : 'snapshot';
      paintStats();
      renderFreshness();
      if (hasWebGL()) scheduleScene();
      else markStatic();
      startPolling();
    })
    .catch(function () {
      mode = 'missing';
      renderFreshness();
      markStatic();
    });
}

function hasWebGL() {
  try {
    var probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (err) {
    return false;
  }
}

function markStatic() {
  hero.classList.add('no-webgl');
}

function scheduleScene() {
  var go = function () { initScene().catch(markStatic); };
  if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 1200 });
  else setTimeout(go, 180);
}

function initScene() {
  return import('../vendor/three-r187.js').then(function (three) {
    buildScene(three);
  });
}

function buildScene(three) {
  var WebGLRenderer = three.WebGLRenderer;
  var Scene = three.Scene;
  var PerspectiveCamera = three.PerspectiveCamera;
  var InstancedMesh = three.InstancedMesh;
  var BoxGeometry = three.BoxGeometry;
  var MeshBasicMaterial = three.MeshBasicMaterial;
  var Color = three.Color;
  var Vector3 = three.Vector3;
  var Object3D = three.Object3D;
  var OrbitControls = three.OrbitControls;

  var n = list.length;
  var xs = new Float64Array(n);
  var zs = new Float64Array(n);
  var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (var i = 0; i < n; i++) {
    var p = project(list[i].lat, list[i].lon);
    xs[i] = p[0];
    zs[i] = p[1];
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  }
  var span = Math.max(maxX - minX, maxZ - minZ);
  var cx = (minX + maxX) / 2;
  var cz = (minZ + maxZ) / 2;
  // Thick enough to read as a city from above, short enough that height
  // doesn't turn every station into a needle.
  var foot = Math.max(nearestFoot(xs, zs, span), span / 150);

  var currentH = new Float32Array(n);
  var targetH = new Float32Array(n);
  var indexById = new Map();
  for (var k = 0; k < n; k++) indexById.set(list[k].id, k);

  function heightFor(bikes) {
    var stub = foot * 0.45;
    if (bikes <= 0) return stub;
    return stub + Math.min(1, Math.sqrt(bikes / 36)) * foot * 3.4;
  }

  var renderer;
  try {
    renderer = new WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
  } catch (err) {
    markStatic();
    return;
  }
  renderer.setClearColor(themeQuery.matches ? 0x101a28 : 0xc3d7ea, 1);
  renderer.toneMapping = 0;

  var scene = new Scene();
  var camera = new PerspectiveCamera(34, 1, span / 500, span * 30);
  camera.position.set(cx, span * 1.28, cz + span * 0.34);

  var controls = new OrbitControls(camera, canvas);
  controls.target.set(cx, 0, cz - span * 0.02);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.7;
  controls.minDistance = span * 0.18;
  controls.maxDistance = span * 2.6;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = 1.2;
  controls.autoRotate = !reduced();
  controls.autoRotateSpeed = 0.45;
  controls.update();

  canvas.removeEventListener('wheel', controls._onMouseWheel);
  canvas.addEventListener('wheel', function (event) {
    if (!event.ctrlKey && !event.metaKey) return;
    controls._onMouseWheel(event);
  }, { passive: false });
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';

  var geo = new BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  var mesh = new InstancedMesh(geo, new MeshBasicMaterial(), n);
  mesh.frustumCulled = false;
  var blue = new Color('#146ec4');
  var amber = new Color('#e08a24');
  var idle = new Color('#8c98a8');
  var empty = new Color('#5d6e84');
  var tint = new Color();
  var dummy = new Object3D();
  var barsDirty = false;

  function paintColor(i) {
    var s = list[i];
    if (!s.active) tint.copy(idle);
    else if (s.bikes <= 0) tint.copy(empty);
    else tint.copy(blue).lerp(amber, Math.max(0, Math.min(1, s.ebikes / s.bikes)));
    mesh.setColorAt(i, tint);
  }

  function writeBar(i) {
    dummy.position.set(xs[i], 0, zs[i]);
    dummy.scale.set(foot, Math.max(currentH[i], 0.0001), foot);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    barsDirty = true;
  }

  for (var b = 0; b < n; b++) {
    var h0 = heightFor(list[b].bikes);
    currentH[b] = h0;
    targetH[b] = h0;
    writeBar(b);
    paintColor(b);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  var pGeo = new BoxGeometry(1, 1, 1);
  var particles = new InstancedMesh(pGeo, new MeshBasicMaterial(), PARTICLE_POOL);
  particles.frustumCulled = false;
  var upColor = new Color('#f4fbff');
  var downColor = new Color('#ffd27a');
  var slots = [];
  for (var s = 0; s < PARTICLE_POOL; s++) {
    slots.push({ on: false, age: 0, dur: 900, x: 0, z: 0, y0: 0, dir: 1 });
    particles.setColorAt(s, upColor);
    dummy.scale.set(0, 0, 0);
    dummy.position.set(0, -999, 0);
    dummy.updateMatrix();
    particles.setMatrixAt(s, dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate = true;
  scene.add(particles);

  var projected = new Vector3();
  var animating = false;
  var running = false;
  var raf = 0;
  var lastNow = 0;
  var dragged = false;
  var down = false;
  var downX = 0;
  var downY = 0;
  var pinned = false;
  var pickQueued = false;
  var pickEvent = null;

  function resize() {
    var w = hero.clientWidth;
    var h = hero.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function stepHeights() {
    if (!animating) return;
    var moving = false;
    for (var i = 0; i < n; i++) {
      var d = targetH[i] - currentH[i];
      if (Math.abs(d) < 0.00015) {
        if (currentH[i] !== targetH[i]) {
          currentH[i] = targetH[i];
          writeBar(i);
        }
      } else {
        currentH[i] += d * 0.22;
        writeBar(i);
        moving = true;
      }
    }
    animating = moving;
  }

  function spawn(index, delta) {
    if (reduced() || !delta) return;
    var slot = null;
    for (var i = 0; i < slots.length; i++) if (!slots[i].on) { slot = slots[i]; break; }
    if (!slot) return;
    slot.on = true;
    slot.age = 0;
    slot.dur = 850;
    slot.x = xs[index];
    slot.z = zs[index];
    slot.y0 = currentH[index];
    slot.dir = delta < 0 ? 1 : -1;
    particles.setColorAt(indexOfSlot(slot), slot.dir > 0 ? upColor : downColor);
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
  }

  function indexOfSlot(slot) {
    return slots.indexOf(slot);
  }

  function stepParticles(dtMs) {
    var rise = span * 0.07;
    var any = false;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (!slot.on) continue;
      any = true;
      slot.age += dtMs;
      var t = slot.age / slot.dur;
      if (t >= 1) {
        slot.on = false;
        dummy.scale.set(0, 0, 0);
        dummy.position.set(0, -999, 0);
      } else {
        var y = slot.dir > 0 ? slot.y0 + rise * t : slot.y0 + rise * (1 - t);
        var pulse = Math.sin(Math.PI * t) * foot * 2.4;
        dummy.position.set(slot.x, y, slot.z);
        dummy.scale.set(pulse, pulse, pulse);
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    if (any) particles.instanceMatrix.needsUpdate = true;
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    var dt = lastNow ? Math.min(48, now - lastNow) : 16;
    lastNow = now;
    controls.autoRotate = !reduced();
    controls.update(dt / 1000);
    if (!reduced()) stepHeights();
    stepParticles(dt);
    if (barsDirty) {
      mesh.instanceMatrix.needsUpdate = true;
      barsDirty = false;
    }
    renderer.render(scene, camera);
  }

  function shouldRender() {
    return sceneReady && heroOnScreen && !document.hidden;
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) {
      lastNow = 0;
      raf = requestAnimationFrame(frame);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function hideTip() {
    tip.hidden = true;
    pinned = false;
  }

  function showTip(index, clientX, clientY) {
    var station = list[index];
    tip.hidden = false;
    tip.replaceChildren();
    var title = document.createElement('strong');
    title.textContent = station.name;
    var detail = document.createElement('span');
    var prefix = station.active ? '' : 'Not in service · ';
    detail.textContent = prefix + station.bikes + ' bikes · ' + station.ebikes + ' e-bikes · ' + station.docks + ' docks';
    tip.append(title, detail);
    var bounds = hero.getBoundingClientRect();
    var left = clientX - bounds.left + 14;
    var top = clientY - bounds.top + 16;
    tip.style.left = '0px';
    tip.style.top = '0px';
    var tw = tip.offsetWidth || 200;
    var th = tip.offsetHeight || 56;
    if (left + tw > bounds.width - 8) left = clientX - bounds.left - tw - 14;
    if (top + th > bounds.height - 8) top = clientY - bounds.top - th - 12;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }

  function pick(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    var ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    var ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    var best = -1;
    var bestD = 22 * 22;
    for (var i = 0; i < n; i++) {
      projected.set(xs[i], currentH[i] * 0.55, zs[i]);
      projected.project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      var dx = (projected.x - ndcX) * rect.width * 0.5;
      var dy = (projected.y - ndcY) * rect.height * 0.5;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    return best;
  }

  function queuePick(event, fromTap) {
    pickEvent = { x: event.clientX, y: event.clientY, tap: fromTap, type: event.pointerType };
    if (pickQueued) return;
    pickQueued = true;
    requestAnimationFrame(function () {
      pickQueued = false;
      if (!pickEvent) return;
      var id = pick(pickEvent.x, pickEvent.y);
      if (id >= 0) {
        showTip(id, pickEvent.x, pickEvent.y);
        pinned = pickEvent.tap && pickEvent.type !== 'mouse';
      } else if (pickEvent.tap || !pinned) {
        hideTip();
      }
    });
  }

  canvas.addEventListener('pointerdown', function (event) {
    down = true;
    dragged = false;
    downX = event.clientX;
    downY = event.clientY;
    noteInteraction();
  });
  window.addEventListener('pointermove', function (event) {
    if (!sceneReady) return;
    if (down && Math.hypot(event.clientX - downX, event.clientY - downY) > 6) dragged = true;
    if (event.pointerType !== 'mouse' || dragged) return;
    var rect = canvas.getBoundingClientRect();
    var inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) {
      if (!pinned) hideTip();
      return;
    }
    queuePick(event, false);
  });
  window.addEventListener('pointerup', function (event) {
    if (!down) return;
    var wasDrag = dragged;
    down = false;
    dragged = false;
    if (!wasDrag) queuePick(event, true);
  });
  canvas.addEventListener('pointerleave', function () {
    if (!pinned) hideTip();
  });

  document.getElementById('zoom-in').addEventListener('click', function () {
    noteInteraction();
    dolly(0.82);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    noteInteraction();
    dolly(1.22);
  });

  function dolly(factor) {
    var tx = controls.target.x, ty = controls.target.y, tz = controls.target.z;
    var x = camera.position.x - tx;
    var y = camera.position.y - ty;
    var z = camera.position.z - tz;
    var dist = Math.hypot(x, y, z) || 1;
    var next = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist * factor));
    var scale = next / dist;
    camera.position.set(tx + x * scale, ty + y * scale, tz + z * scale);
    controls.update();
  }

  themeQuery.addEventListener('change', function () {
    renderer.setClearColor(themeQuery.matches ? 0x101a28 : 0xc3d7ea, 1);
  });
  motionQuery.addEventListener('change', function () {
    controls.autoRotate = !reduced();
    if (reduced()) {
      for (var i = 0; i < n; i++) {
        currentH[i] = targetH[i];
        writeBar(i);
      }
      animating = false;
    }
  });

  if (window.ResizeObserver) new ResizeObserver(resize).observe(hero);
  else window.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('webglcontextlost', function (event) {
    event.preventDefault();
    sceneReady = false;
    setRunning(false);
    hero.classList.remove('is-live');
    hero.classList.add('no-webgl');
    zoomBox.hidden = true;
    fallback.hidden = false;
  });

  var observer = new IntersectionObserver(function (entries) {
    heroOnScreen = entries[0].isIntersecting;
    setRunning(shouldRender());
    if (heroOnScreen) resumePoll();
    else clearTimeout(pollTimer);
  }, { threshold: 0.08 });
  observer.observe(hero);

  document.addEventListener('visibilitychange', function () {
    setRunning(shouldRender());
    if (document.hidden) clearTimeout(pollTimer);
    else resumePoll();
  });

  // Hand the live poll a way to move bars without importing three again.
  sceneApi = {
    apply: function (rows) {
      var previous = {};
      for (var i = 0; i < n; i++) previous[list[i].id] = list[i].bikes;
      var deltas = bikeDeltas(previous, rows);
      var byId = new Map();
      for (var r = 0; r < rows.length; r++) byId.set(rows[r][0], rows[r]);
      var colorsDirty = false;
      for (var j = 0; j < n; j++) {
        var row = byId.get(list[j].id);
        if (!row) continue;
        list[j].bikes = row[1] | 0;
        list[j].ebikes = row[2] | 0;
        list[j].docks = row[3] | 0;
        if (row.length > 4) list[j].active = row[4] === 1;
        targetH[j] = heightFor(list[j].bikes);
        if (reduced()) {
          currentH[j] = targetH[j];
          writeBar(j);
        } else if (currentH[j] !== targetH[j]) {
          animating = true;
        }
        paintColor(j);
        colorsDirty = true;
      }
      if (colorsDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (barsDirty) {
        mesh.instanceMatrix.needsUpdate = true;
        barsDirty = false;
      }
      var spawned = 0;
      var top = null;
      for (var d = 0; d < deltas.length && spawned < 24; d++) {
        if (!indexById.has(deltas[d].id)) continue;
        spawn(indexById.get(deltas[d].id), deltas[d].delta);
        if (!top) top = deltas[d];
        spawned++;
      }
      if (top) ticker.textContent = tickerLine(top.delta, list[indexById.get(top.id)].name);
      paintStats();
    }
  };

  sceneReady = true;
  hero.classList.add('is-live');
  zoomBox.hidden = false;
  canvas.removeAttribute('aria-hidden');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Map of every Citi Bike station in New York City. Bar height is bikes available, color shifts toward amber as more of them are e-bikes. Drag to rotate, pinch or ctrl-scroll to zoom.');
  fallback.alt = '';
  setRunning(shouldRender());
  renderer.render(scene, camera);
}

function nearestFoot(xs, zs, span) {
  var cell = span / 40 || 0.01;
  var grid = new Map();
  var count = xs.length;
  for (var i = 0; i < count; i++) {
    var key = Math.floor(xs[i] / cell) + ',' + Math.floor(zs[i] / cell);
    var bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  }
  var dists = [];
  for (var a = 0; a < count; a += 4) {
    var gx = Math.floor(xs[a] / cell);
    var gz = Math.floor(zs[a] / cell);
    var best = Infinity;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var bucket = grid.get((gx + dx) + ',' + (gz + dz));
        if (!bucket) continue;
        for (var b = 0; b < bucket.length; b++) {
          var j = bucket[b];
          if (j === a) continue;
          var dist = Math.hypot(xs[a] - xs[j], zs[a] - zs[j]);
          if (dist > 0 && dist < best) best = dist;
        }
      }
    }
    if (best < Infinity) dists.push(best);
  }
  dists.sort(function (p, q) { return p - q; });
  var typical = dists.length ? dists[Math.floor(dists.length * 0.2)] : span / 80;
  return Math.max(span / 420, Math.min(typical * 0.42, span / 90));
}

var sceneApi = null;
var pollTimer = 0;
var pollFailures = 0;
var lastOk = 0;
var inflight = false;
var sawLive = false;

function canPoll() {
  return !!STATUS_WORKER_URL && !saveDataOn() && !document.hidden && heroOnScreen && (Date.now() - lastInteraction < IDLE_MS);
}

function arm(ms) {
  clearTimeout(pollTimer);
  if (!STATUS_WORKER_URL || saveDataOn()) return;
  pollTimer = setTimeout(tick, ms);
}

function jitter(ms) {
  return Math.round(ms * (0.85 + Math.random() * 0.3));
}

function resumePoll() {
  if (!canPoll()) return;
  if (pollFailures > 0) {
    arm(jitter(Math.min(MAX_BACKOFF_MS, POLL_MS * Math.pow(2, pollFailures))));
    return;
  }
  var since = Date.now() - lastOk;
  if (!lastOk || since >= POLL_MS) arm(jitter(700));
  else arm(POLL_MS - since);
}

function startPolling() {
  if (!STATUS_WORKER_URL) return;
  if (saveDataOn()) return;
  ['pointerdown', 'keydown', 'wheel'].forEach(function (type) {
    window.addEventListener(type, noteInteraction, { passive: true });
  });
  resumePoll();
}

var lastInteraction = Date.now();
function noteInteraction() {
  var idle = Date.now() - lastInteraction >= IDLE_MS;
  lastInteraction = Date.now();
  if (idle) resumePoll();
}

function tick() {
  if (inflight || !canPoll()) return;
  inflight = true;
  fetch(STATUS_WORKER_URL, { headers: { Accept: 'application/json' }, cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (body) {
      if (!body || !Array.isArray(body.s)) throw new Error('bad payload');
      pollFailures = 0;
      lastOk = Date.now();
      sawLive = true;
      liveUnix = body.t | 0;
      mode = 'live';
      if (sceneApi) sceneApi.apply(body.s);
      else applyStatsOnly(body.s);
      renderFreshness();
      arm(jitter(POLL_MS));
    })
    .catch(function () {
      pollFailures++;
      mode = sawLive ? 'stale' : 'down';
      renderFreshness();
      arm(jitter(Math.min(MAX_BACKOFF_MS, POLL_MS * Math.pow(2, pollFailures))));
    })
    .then(function () { inflight = false; });
}

function applyStatsOnly(rows) {
  var previous = {};
  for (var i = 0; i < list.length; i++) previous[list[i].id] = list[i].bikes;
  var deltas = bikeDeltas(previous, rows);
  var byId = new Map();
  for (var r = 0; r < rows.length; r++) byId.set(rows[r][0], rows[r]);
  for (var j = 0; j < list.length; j++) {
    var row = byId.get(list[j].id);
    if (!row) continue;
    list[j].bikes = row[1] | 0;
    list[j].ebikes = row[2] | 0;
    list[j].docks = row[3] | 0;
    if (row.length > 4) list[j].active = row[4] === 1;
  }
  paintStats();
  for (var d = 0; d < deltas.length; d++) {
    for (var k = 0; k < list.length; k++) {
      if (list[k].id !== deltas[d].id) continue;
      ticker.textContent = tickerLine(deltas[d].delta, list[k].name);
      return;
    }
  }
}
