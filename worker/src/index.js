/**
 * Edge cache in front of Citi Bike's station_status feed.
 *
 * Browsers cannot read the GBFS host (no CORS). This Worker fetches one
 * station_status URL, stores a compact JSON in the Cache API for the feed
 * ttl, and answers every other request in the colo from that cache.
 * Upstream sees about one request per minute per colo. Each viewer request
 * still invokes the Worker; see README.md for the free-tier arithmetic.
 *
 * No secrets. No other upstream hosts. No second try on failure.
 */

// GBFS 1.1. The 2.3 station_status file drops legacy_id, which is the id
// the map matches. One host, no fallback fetch.
// Not exported. A string export on the Worker entry is not a handler, and
// workerd refuses to start.
const UPSTREAM = 'https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json';
const PAGES_ORIGIN = 'https://cascadiacollections.github.io';
const MAX_BODY = 5 * 1024 * 1024;
const TTL = 60;

export function compactStatus(feed) {
  const list = feed && feed.data && Array.isArray(feed.data.stations) ? feed.data.stations : null;
  if (!list) throw new Error('Unexpected station_status payload');

  const byId = new Map();
  for (let i = 0; i < list.length; i++) {
    const st = list[i];
    if (!st) continue;
    const legacy = st.legacy_id;
    const id = /^\d+$/.test(String(legacy)) ? Number(legacy) : st.station_id;
    if (id == null || id === '') continue;
    byId.set(id, [
      id,
      st.num_bikes_available | 0,
      st.num_ebikes_available | 0,
      st.num_docks_available | 0,
      st.is_installed && st.is_renting ? 1 : 0
    ]);
  }

  const s = Array.from(byId.values());
  s.sort(function (a, b) {
    if (typeof a[0] === 'number' && typeof b[0] === 'number') return a[0] - b[0];
    return String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0;
  });

  return { t: feed.last_updated | 0, ttl: TTL, s: s };
}

function log(level, fields) {
  const line = JSON.stringify(fields);
  if (level === 'error') console.error(line);
  else console.log(line);
}

// Workers often hide the socket error on Error.cause. Keep that chain in
// the logs. The client only ever sees a fixed sentence.
function errorText(err) {
  const parts = [];
  const seen = new Set();
  let current = err;
  while (current != null && parts.length < 4 && !seen.has(current)) {
    seen.add(current);
    if (typeof current === 'string') {
      parts.push(current);
      break;
    }
    const name = current.name ? String(current.name) : 'Error';
    const message = current instanceof Error ? current.message : String(current);
    parts.push(name + ': ' + message);
    current = current.cause;
  }
  return parts.join(' | ');
}

function corsHeaders(extra) {
  const headers = new Headers(extra || {});
  headers.set('Access-Control-Allow-Origin', PAGES_ORIGIN);
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
  return headers;
}

function jsonResponse(body, status, cacheControl) {
  const headers = corsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl
  });
  return new Response(JSON.stringify(body), { status: status, headers: headers });
}

function withCors(response) {
  const headers = corsHeaders(response.headers);
  return new Response(response.body, { status: response.status, headers: headers });
}

function cacheKeyFor(request) {
  const url = new URL(request.url);
  url.pathname = '/station_status';
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

function allowedPath(pathname) {
  return pathname === '/' || pathname === '/station_status';
}

export async function handle(request, ctx, deps) {
  const method = request.method;
  const url = new URL(request.url);

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders({ 'Cache-Control': 'public, max-age=86400' }) });
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405, 'no-store');
  }

  if (!allowedPath(url.pathname)) {
    return jsonResponse({ ok: false, error: 'not found' }, 404, 'no-store');
  }

  const cache = deps.cache;
  const key = cacheKeyFor(request);
  const hit = await cache.match(key);
  if (hit) {
    log('info', { message: 'station_status', cache: 'hit' });
    return method === 'HEAD' ? new Response(null, { status: hit.status, headers: hit.headers }) : withCors(hit);
  }

  let upstream;
  try {
    upstream = await deps.fetch(UPSTREAM, {
      headers: { Accept: 'application/json', 'User-Agent': 'citibike-status-worker' }
    });
  } catch (err) {
    log('error', { message: 'upstream failed', host: new URL(UPSTREAM).hostname, error: errorText(err) });
    return jsonResponse({ ok: false, error: 'upstream unavailable' }, 502, 'no-store');
  }

  if (!upstream.ok) {
    if (upstream.body && upstream.body.cancel) {
      try { upstream.body.cancel(); } catch (e) { /* ignore */ }
    }
    log('error', { message: 'upstream status', status: upstream.status });
    return jsonResponse({ ok: false, error: 'upstream HTTP ' + upstream.status }, 502, 'no-store');
  }

  const declared = Number(upstream.headers.get('content-length') || 0);
  if (declared > MAX_BODY) {
    if (upstream.body && upstream.body.cancel) upstream.body.cancel();
    log('error', { message: 'upstream too large', bytes: declared });
    return jsonResponse({ ok: false, error: 'upstream payload too large' }, 502, 'no-store');
  }

  let text;
  try {
    text = await upstream.text();
  } catch (err) {
    log('error', { message: 'upstream read failed', error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ ok: false, error: 'upstream read failed' }, 502, 'no-store');
  }
  if (text.length > MAX_BODY) {
    return jsonResponse({ ok: false, error: 'upstream payload too large' }, 502, 'no-store');
  }

  let compact;
  try {
    compact = compactStatus(JSON.parse(text));
  } catch (err) {
    log('error', { message: 'upstream parse failed', error: err instanceof Error ? err.message : String(err) });
    return jsonResponse({ ok: false, error: 'unexpected station_status payload' }, 502, 'no-store');
  }

  const response = jsonResponse(compact, 200, 'public, max-age=' + TTL);
  log('info', { message: 'station_status', cache: 'miss', stations: compact.s.length, t: compact.t });
  ctx.waitUntil(cache.put(key, response.clone()));
  if (method === 'HEAD') return new Response(null, { status: 200, headers: response.headers });
  return response;
}

export default {
  async fetch(request, env, ctx) {
    // deps.fetch() would set `this` to deps. Workers fetch then throws
    // TypeError: Illegal invocation. Call it as a function.
    return handle(request, ctx, {
      cache: caches.default,
      fetch: (input, init) => fetch(input, init)
    });
  }
};
