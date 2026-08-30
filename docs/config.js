window.MJBMON_CONFIG = {
  // v1: same-origin relative paths (this repo's own docs/data/, committed by
  // hand or by CI). Planned evolution (per sas0's advice, 2026-08-31): a
  // slate-side script pushes fresh snapshots to a dedicated branch of this
  // repo, and this config switches to the raw.githubusercontent.com URL for
  // that branch (CORS: * confirmed by sas0 -- no backend needed either way).
  PROGRESS_URL: './data/progress.json',
  AGG_TILES_URL: './data/agg_tiles.json',
  BUILD_LOG_URL: './data/build_log.json'
};
