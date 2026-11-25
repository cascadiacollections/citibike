/**
 * Landing-page behavior that must not block first paint.
 * The copy button is wired immediately. The station snapshot and the
 * three.js scene start on the frame after first paint.
 */
(function () {
  var copyBtn = document.getElementById('copy-install');
  var hint = copyBtn && copyBtn.querySelector('.copy-hint');

  function fallbackCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy failed');
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        area.remove();
      }
    });
  }

  function copyText(text) {
    var modern = (navigator.clipboard && window.isSecureContext)
      ? navigator.clipboard.writeText(text)
      : Promise.reject(new Error('clipboard unavailable'));
    return modern.catch(function () { return fallbackCopy(text); });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var text = copyBtn.getAttribute('data-copy') || 'npm install citibike';
      copyText(text).then(function () {
        if (!hint) return;
        hint.textContent = 'Copied';
        window.setTimeout(function () { hint.textContent = 'Copy'; }, 1600);
      }).catch(function () {
        if (hint) hint.textContent = 'Select the command';
      });
    });
  }

  function hasWebGL() {
    try {
      var probe = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl')));
    } catch (err) {
      return false;
    }
  }

  function formatNum(n) {
    return Number(n).toLocaleString('en-US');
  }

  function formatWhen(unix) {
    return new Date(unix * 1000).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function fillStats(data) {
    var bikes = 0;
    var ebikes = 0;
    var rows = data.stations || [];
    for (var i = 0; i < rows.length; i++) {
      bikes += rows[i][3] || 0;
      ebikes += rows[i][4] || 0;
    }
    var root = document.getElementById('hero-stats');
    if (!root) return;
    var map = {
      stations: formatNum(rows.length),
      bikes: formatNum(bikes),
      ebikes: formatNum(ebikes),
      when: formatWhen(data.generatedAt)
    };
    Object.keys(map).forEach(function (key) {
      var el = root.querySelector('[data-stat="' + key + '"]');
      if (el) el.textContent = map[key];
    });
  }

  function start() {
    var canvas = document.getElementById('city-canvas');
    var fallback = document.getElementById('city-fallback');
    var tip = document.getElementById('station-tip');
    var hero = document.querySelector('.hero');
    var webgl = hasWebGL();
    if (!webgl && canvas) canvas.hidden = true;

    fetch('data/stations.json').then(function (res) {
      if (!res.ok) throw new Error('snapshot ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.stations)) throw new Error('bad snapshot');
      fillStats(data);
      if (!webgl || !canvas || !tip) return;
      canvas.setAttribute('aria-label',
        'Interactive map of ' + data.stations.length + ' Citi Bike stations in New York City. Bar height is bikes available. Greener bars have more e-bikes. Drag to rotate, scroll or pinch to zoom. Hover or tap a station for its name and counts.');
      return import('./city-scene.js').then(function (mod) {
        mod.mountCity(canvas, tip, data.stations);
        if (hero) hero.classList.add('is-ready');
        if (fallback) fallback.setAttribute('aria-hidden', 'true');
        canvas.removeAttribute('aria-hidden');
        canvas.addEventListener('city-context-lost', function () {
          if (hero) hero.classList.remove('is-ready');
          canvas.hidden = true;
          if (fallback) fallback.removeAttribute('aria-hidden');
        });
      });
    }).catch(function () {
      if (canvas) canvas.hidden = true;
      if (hero) hero.classList.remove('is-ready');
    });
  }

  requestAnimationFrame(function () {
    requestAnimationFrame(start);
  });
})();
