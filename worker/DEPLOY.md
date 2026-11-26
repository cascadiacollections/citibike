# Deploy the station status Worker

The docs site cannot read `gbfs.citibikenyc.com` from a browser. This Worker fetches that one station_status feed, keeps a compact copy in the Cache API for 60 seconds, and allows `https://cascadiacollections.github.io`.

GitHub Actions does not deploy it, and npm does not publish it. `wrangler.toml` is the Workers Free plan: the name `citibike-status`, a compatibility date, a `workers.dev` hostname, sampled logs, and nothing else. There is no cron trigger and no paid binding. Leave it that way. The page polls; the Worker does not.

From the repository root, on your machine (not in CI):

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

`login` opens a browser and stores credentials on this machine. The first deploy asks you to pick a `workers.dev` subdomain if the account does not have one yet. That subdomain is free. Accept it. `deploy` then prints a URL like `https://citibike-status.<account>.workers.dev`.

Check the deploy. Use the hostname that `deploy` printed:

```bash
curl -sS -D - -o /tmp/citibike-status.json \
  -H 'Origin: https://cascadiacollections.github.io' \
  'https://citibike-status.<account>.workers.dev/station_status'
```

A good response is HTTP 200, with these headers:

```text
access-control-allow-origin: https://cascadiacollections.github.io
cache-control: public, max-age=60
content-type: application/json; charset=utf-8
```

The body is JSON with `t` (unix seconds), `ttl` (60), and `s` (one row per station). A second curl within that minute should also be 200. Citi Bike is fetched about once a minute in each Cloudflare location that has a viewer, not once per browser.

Then point the site at that URL. The page reads it from one line in `site/assets/config.js`:

```js
export const STATUS_WORKER_URL = 'https://citibike-status.<account>.workers.dev/station_status';
```

Commit that change and merge it to `main`. The Pages workflow republishes the site when `site/**` changes.

The constant ships as `''`. While it is empty, the map stays on `site/data/stations.json`. It does not poll, and it does not show bike changes that did not happen. To turn live updates off again, set the constant back to `''` and merge.
