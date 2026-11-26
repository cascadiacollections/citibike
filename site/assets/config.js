// Live station counts for the map. This is the only line to change after
// the Worker deploy. See worker/DEPLOY.md.
//
// Leave the string empty until then. An empty value keeps the page on the
// committed snapshot: no poll, and no pretend live activity. A Worker that
// fails does the same.
export const STATUS_WORKER_URL = '';
