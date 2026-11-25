/**
 * Full-bleed map of Citi Bike stations.
 *
 * Projection matches scripts/snapshot-stations.js: equirectangular, origin
 * near midtown, longitude scaled by cos(lat) so the island shapes stay honest.
 * Bar height is bikes available. Color runs from blue (classic) to yellow-green
 * (mostly e-bikes). three.js is imported from the vendored bundle.
 */

import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  OrbitControls,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer
} from '../vendor/three-map.js';

var ORIGIN_LAT = 40.735;
var ORIGIN_LON = -73.985;
var COS_LAT = Math.cos(ORIGIN_LAT * Math.PI / 180);
var WORLD = 210;

var CLASSIC = { light: 0x0b5cab, dark: 0x5cb8ff };
var ELECTRIC = { light: 0x6d8f0e, dark: 0xc6f252 };
var EMPTY = { light: 0x8ea0b2, dark: 0x4a5c6e };

function project(lat, lon) {
  return [
    (lon - ORIGIN_LON) * COS_LAT * WORLD,
    -(lat - ORIGIN_LAT) * WORLD
  ];
}

function mixHex(a, b, t) {
  var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  var r = ar + (br - ar) * t;
  var g = ag + (bg - ag) * t;
  var bl = ab + (bb - ab) * t;
  return (r << 16) + (g << 8) + bl;
}

function isDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function barColor(bikes, ebikes, dark) {
  var palette = dark ? 'dark' : 'light';
  if (bikes <= 0) return EMPTY[palette];
  var t = Math.max(0, Math.min(1, ebikes / bikes));
  return mixHex(CLASSIC[palette], ELECTRIC[palette], t) | 0;
}

function heightFor(bikes) {
  return 0.6 + Math.sqrt(Math.max(0, bikes)) * 1.15;
}

export function mountCity(canvas, tip, stations) {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  var parent = canvas.parentElement;
  var renderer = new WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'default'
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  var scene = new Scene();
  var camera = new PerspectiveCamera(34, 1, 0.1, 2000);

  var hemi = new HemisphereLight(0xd6e8ff, 0x1c2836, 0.85);
  var ambient = new AmbientLight(0xffffff, 0.35);
  var sun = new DirectionalLight(0xffffff, 1.45);
  sun.position.set(60, 120, 40);
  scene.add(hemi, ambient, sun);

  var geometry = new BoxGeometry(1, 1, 1);
  var material = new MeshStandardMaterial({
    roughness: 0.46,
    metalness: 0.04,
    color: 0xffffff
  });
  var mesh = new InstancedMesh(geometry, material, stations.length);
  mesh.frustumCulled = false;
  var dummy = new Object3D();
  var color = new Color();
  var placed = [];

  var minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (var i = 0; i < stations.length; i++) {
    var row = stations[i];
    var p = project(row[1], row[2]);
    var h = heightFor(row[3]);
    dummy.position.set(p[0], h / 2, p[1]);
    dummy.scale.set(0.4, h, 0.4);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHex(barColor(row[3], row[4], isDark()));
    mesh.setColorAt(i, color);
    placed.push(p);
    if (p[0] < minX) minX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxZ) maxZ = p[1];
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  var centerX = (minX + maxX) / 2;
  var centerZ = (minZ + maxZ) / 2;
  var halfW = (maxX - minX) / 2;
  var halfD = (maxZ - minZ) / 2;

  var controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduced.matches;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.autoRotate = !reduced.matches;
  controls.autoRotateSpeed = 0.18;
  controls.minPolarAngle = 0.28;
  controls.maxPolarAngle = 1.25;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.75;
  // OrbitControls sets touch-action: none, which traps the page scroll on a
  // full-bleed canvas. Vertical pans scroll the page; horizontal drags and
  // pinches are handled below. Mouse drag and wheel stay on OrbitControls.
  canvas.style.touchAction = 'pan-y';

  function frameCamera() {
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    var narrow = w < 720;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // The copy card covers the lower left, so look a bit south and west of
    // the system. That lifts the whole city into the open upper-right.
    var targetX = centerX + (narrow ? halfW * 0.05 : -halfW * 0.05);
    var targetZ = centerZ + halfD * (narrow ? 0.42 : 0.38);
    controls.target.set(targetX, 0.4, targetZ);
    var vFov = camera.fov * Math.PI / 180;
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    var dist = Math.max(halfD / Math.tan(vFov / 2), halfW / Math.tan(hFov / 2));
    dist *= narrow ? 1.15 : 1.24;
    var phi = narrow ? 0.62 : 0.58;
    var theta = 0.08;
    camera.position.set(
      targetX + dist * Math.sin(phi) * Math.sin(theta),
      dist * Math.cos(phi),
      targetZ + dist * Math.sin(phi) * Math.cos(theta)
    );
    controls.minDistance = dist * 0.28;
    controls.maxDistance = dist * 2.4;
    controls.update();
  }

  var framedNarrow = null;
  function resize() {
    var w = canvas.clientWidth || 1;
    var h = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h, false);
    var narrow = w < 720;
    if (framedNarrow === null || narrow !== framedNarrow) {
      frameCamera();
      framedNarrow = narrow;
    } else {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function paintColors() {
    var dark = isDark();
    for (var n = 0; n < stations.length; n++) {
    color.setHex(barColor(stations[n][3], stations[n][4], dark));
    mesh.setColorAt(n, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    hemi.intensity = dark ? 0.7 : 0.95;
    hemi.color.set(dark ? 0x9ec4ea : 0xf4f8fc);
    hemi.groundColor.set(dark ? 0x101820 : 0xc5d5e4);
    ambient.intensity = dark ? 0.28 : 0.45;
    sun.intensity = dark ? 1.55 : 1.15;
  }

  var raycaster = new Raycaster();
  var pointer = new Vector2();
  var hover = -1;
  var pending = null;

  function pick(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObject(mesh);
    if (!hits.length || hits[0].instanceId == null) return -1;
    return hits[0].instanceId;
  }

  function hideTip() {
    hover = -1;
    tip.hidden = true;
    canvas.style.cursor = '';
  }

  function showTip(id, clientX, clientY) {
    if (id < 0) return hideTip();
    hover = id;
    var row = stations[id];
    tip.replaceChildren();
    var name = document.createElement('strong');
    name.textContent = row[0];
    var counts = document.createElement('span');
    counts.textContent = row[3] + ' bikes · ' + row[4] + ' e-bikes · ' + row[5] + ' docks';
    tip.append(name, counts);
    tip.hidden = false;
    var rect = parent.getBoundingClientRect();
    var x = clientX - rect.left + 14;
    var y = clientY - rect.top + 14;
    tip.style.left = '0px';
    tip.style.top = '0px';
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    if (x + tw > rect.width - 8) x = clientX - rect.left - tw - 14;
    if (y + th > rect.height - 8) y = clientY - rect.top - th - 14;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    canvas.style.cursor = 'pointer';
  }

  function flushHover() {
    if (!pending) return;
    var ev = pending;
    pending = null;
    showTip(pick(ev.clientX, ev.clientY), ev.clientX, ev.clientY);
  }

  canvas.addEventListener('pointermove', function (ev) {
    if (ev.pointerType !== 'mouse' || ev.buttons) {
      if (ev.buttons) hideTip();
      return;
    }
    pending = ev;
  });
  canvas.addEventListener('pointerleave', function (ev) {
    if (ev.pointerType === 'mouse') hideTip();
  });

  var touch = null;
  var offset = new Vector3();
  var tmp = new Vector3();

  function applyCamera(nextPos) {
    camera.position.copy(nextPos);
    controls.update();
  }

  function rotateBy(dx) {
    var angle = -dx * 0.0055;
    offset.copy(camera.position).sub(controls.target);
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var x = offset.x * cos - offset.z * sin;
    var z = offset.x * sin + offset.z * cos;
    tmp.set(controls.target.x + x, controls.target.y + offset.y, controls.target.z + z);
    applyCamera(tmp);
  }

  function dollyBy(scale) {
    offset.copy(camera.position).sub(controls.target);
    var dist = offset.length() * scale;
    var min = controls.minDistance || 1;
    var max = controls.maxDistance || 10000;
    if (dist < min) dist = min;
    if (dist > max) dist = max;
    offset.setLength(dist);
    tmp.copy(controls.target).add(offset);
    applyCamera(tmp);
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType !== 'touch') return;
    controls.enabled = false;
    if (!touch) {
      touch = { ids: [], start: [], mode: 'undecided', moved: 0 };
    }
    touch.ids.push(ev.pointerId);
    touch.start.push({ id: ev.pointerId, x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY });
    if (touch.ids.length === 2) touch.mode = 'pinch';
  }, true);

  canvas.addEventListener('pointermove', function (ev) {
    if (!touch || touch.ids.indexOf(ev.pointerId) === -1) return;
    var slot = null;
    for (var s = 0; s < touch.start.length; s++) {
      if (touch.start[s].id === ev.pointerId) slot = touch.start[s];
    }
    if (!slot) return;
    var dx = ev.clientX - slot.x;
    var dy = ev.clientY - slot.y;
    touch.moved = Math.max(touch.moved, Math.abs(dx), Math.abs(dy));
    if (touch.mode === 'undecided' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      touch.mode = Math.abs(dx) > Math.abs(dy) ? 'rotate' : 'scroll';
    }
    if (touch.mode === 'rotate') {
      rotateBy(ev.clientX - slot.lx);
    } else if (touch.mode === 'pinch' && touch.start.length >= 2) {
      var a = touch.start[0];
      var b = touch.start[1];
      var prev = Math.hypot(a.lx - b.lx, a.ly - b.ly) || 1;
      if (a.id === ev.pointerId) { a.lx = ev.clientX; a.ly = ev.clientY; }
      if (b.id === ev.pointerId) { b.lx = ev.clientX; b.ly = ev.clientY; }
      var next = Math.hypot(a.lx - b.lx, a.ly - b.ly) || 1;
      if (prev > 0 && Math.abs(next - prev) > 1) dollyBy(prev / next);
      return;
    }
    slot.lx = ev.clientX;
    slot.ly = ev.clientY;
  }, { passive: true });

  function endTouch(ev) {
    if (!touch) return;
    var wasTap = touch.mode !== 'rotate' && touch.mode !== 'pinch' && touch.moved < 8 && touch.ids.length === 1;
    touch.ids = touch.ids.filter(function (id) { return id !== ev.pointerId; });
    touch.start = touch.start.filter(function (p) { return p.id !== ev.pointerId; });
    if (!touch.ids.length) {
      controls.enabled = true;
      if (wasTap) showTip(pick(ev.clientX, ev.clientY), ev.clientX, ev.clientY);
      touch = null;
    } else if (touch.ids.length < 2 && touch.mode === 'pinch') {
      touch.mode = 'undecided';
    }
  }
  canvas.addEventListener('pointerup', endTouch, true);
  canvas.addEventListener('pointercancel', function (ev) {
    if (touch) {
      touch.moved = 99;
      endTouch(ev);
    }
    controls.enabled = true;
  }, true);

  var onScreen = true;
  var raf = 0;
  var running = true;

  function hidden() {
    return document.hidden || !onScreen;
  }

  function tick() {
    raf = 0;
    if (!running || hidden()) return;
    controls.update();
    renderer.render(scene, camera);
    if (pending) flushHover();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (!raf && running && !hidden()) raf = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      start();
    }
  });

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      onScreen = entries.some(function (entry) { return entry.isIntersecting; });
      if (onScreen) start();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.02 });
    observer.observe(canvas);
  }

  var resizeObserver = null;
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(function () { resize(); });
    resizeObserver.observe(parent);
  } else {
    window.addEventListener('resize', resize);
  }

  function onMotion() {
    controls.autoRotate = !reduced.matches;
    controls.enableDamping = !reduced.matches;
  }
  if (reduced.addEventListener) reduced.addEventListener('change', onMotion);
  else if (reduced.addListener) reduced.addListener(onMotion);

  function onTheme() {
    paintColors();
  }
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', onTheme);
  else if (darkQuery.addListener) darkQuery.addListener(onTheme);

  canvas.addEventListener('webglcontextlost', function (ev) {
    ev.preventDefault();
    running = false;
    if (raf) cancelAnimationFrame(raf);
    canvas.dispatchEvent(new CustomEvent('city-context-lost'));
  });

  paintColors();
  resize();
  renderer.render(scene, camera);
  start();

  return {
    stop: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (resizeObserver) resizeObserver.disconnect();
    }
  };
}
