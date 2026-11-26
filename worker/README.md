# citibike station status Worker

A single Cloudflare Worker that lets the docs site read Citi Bike's `station_status` feed. The feed sends no `Access-Control-Allow-Origin` header, so a browser cannot fetch it. This Worker fetches only:

`https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json`

`gbfs.citibikenyc.com` is the same feed behind CloudFront, but its IPv6 addresses refuse port 443. A Worker follows those addresses and the fetch throws. `gbfs.lyft.com` has no IPv6 addresses. The 1.1 file still includes `legacy_id`, which the map uses. The 2.3 file does not.

It stores a compact JSON body in the [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) for 60 seconds, which is the feed's `ttl`. Responses set `Cache-Control: public, max-age=60` and `Access-Control-Allow-Origin: https://cascadiacollections.github.io`. Any other path returns 404. There are no secrets and no bindings.

The page reads the Worker URL from `STATUS_WORKER_URL` in `site/assets/config.js`. That constant ships empty. Until it is set, or any time the Worker errors, the page stays on the committed snapshot and says `snapshot from <time>`.

## Cost

Figures below are from the Workers limits and pricing docs as of November 2026.

The cache cuts **origin** traffic, not Worker invocations. Every poll still runs the Worker. The Cache API then serves the compact JSON, so Citi Bike's feed is fetched about once a minute per colo that has a viewer, regardless of how many browsers are open.

| | Workers Free |
| --- | --- |
| Requests | 100,000 / day |
| CPU time | 10 ms / invocation |
| Workers Logs | 200,000 events / day included (this Worker samples logs at 10% and traces at 1%) |

The page polls every 60 seconds, and only while the tab is visible, the hero is on screen, Save-Data is off, and someone has interacted in the last 30 minutes. A visitor who looks for a few minutes costs a handful of requests.

100,000 requests a day is about 70 browsers leaving the hero open around the clock, or about 30,000 short visits. A docs page fits in that. Past it, Cloudflare answers with error 1027 and the page keeps showing the snapshot. Nothing in this repo retries hard enough to hammer the feed: backoff caps at 10 minutes, and the edge cache holds the origin to roughly one request per minute per colo (a few thousand origin requests a day across the colos people actually hit).

The paid plan is $5 a month, which includes 10 million requests, then $0.30 per extra million. There is no egress charge. Set a [Workers spending limit](https://developers.cloudflare.com/workers/platform/limits/) before turning the paid plan on if you want a hard ceiling.

Parsing the ~1 MB status feed is the only heavy step, and it runs on cache miss. Locally that parse is a few milliseconds. The free plan's 10 ms CPU limit has some slack for an occasional overrun, but a consistent overrun shows up as error 1102 on the miss path. Hits return the cached response and do almost no CPU.

## Deploy

This is not deployed by GitHub Actions, and it is not published to npm. The exact steps (`npx wrangler login`, `npx wrangler deploy`, the curl check, and the one line in `site/assets/config.js`) are in [DEPLOY.md](./DEPLOY.md).
