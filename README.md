# mapterhorn-monitor

Live production dashboard for
[`mapterhorn-japan-bridge`](https://github.com/hfu/mapterhorn-japan-bridge),
the elevation-tile pipeline that builds Japan-national terrain and
lineage PMTiles. Static site, published via GitHub Pages at
[hfu.github.io/mapterhorn-monitor](https://hfu.github.io/mapterhorn-monitor/).

Built on [Open MCT](https://nasa.github.io/openmct/) (NASA's telemetry
dashboard framework) plus [MapLibre GL](https://maplibre.org/) for the
map-based instruments. No backend: everything reads static JSON from
`docs/data/`, refreshed by hand from the pipeline's operator machine
roughly every 15 minutes during an active build.

## Instruments

- **Progress Trend** — aggregation/downsampling completion over time.
- **Current Stage** — what the pipeline is doing right now, with an
  estimated completion time.
- **Status Map** — tile coverage by processing stage, plotted over Japan.
- **Resources** — disk, memory, and load on the build machine.
- **Mission Timeline** — planned vs. actual step durations for the
  current run.
- **Live Viewer** — the production terrain viewer, embedded directly.

Cycle mode (the button in the toolbar, or arrow keys) rotates through
instruments fullscreen for unattended monitoring.

## Data

`docs/data/progress.json`, `agg_tiles.json`, and `history.json` are
committed snapshots, not live telemetry — see `docs/config.js` for the
fetch paths and `docs/core.js` for how instruments consume them. There
is no build step; `docs/` is served as-is by GitHub Pages.

## Related

- [`mapterhorn-japan-bridge`](https://github.com/hfu/mapterhorn-japan-bridge) —
  the pipeline this dashboard monitors (`DECISIONS.md`/`HANDOVER.md`
  there have the full operational history).
- [`hfu/mapterhorn`](https://github.com/hfu/mapterhorn) — the fork of
  [`mapterhorn/mapterhorn`](https://github.com/mapterhorn/mapterhorn)
  that does the actual tile processing.
