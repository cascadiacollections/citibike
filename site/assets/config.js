// Live station counts for the map. This is the only line the page reads.
// See worker/DEPLOY.md.
//
// Clear this string to keep the page on the committed snapshot: no poll,
// and no pretend live activity. A Worker that fails does the same.
export const STATUS_WORKER_URL = 'https://citibike-status.cascadiacollections.workers.dev/station_status';
