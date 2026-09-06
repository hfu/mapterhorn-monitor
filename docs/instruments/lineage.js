(function () {
  const STYLE_URL = 'https://hfu.github.io/mapterhorn-japan-bridge/style.json';
  // martin's own TileJSON endpoint (no {z}/{x}/{y} template) -- a
  // raster-dem source with encoding:'custom' only actually renders when
  // pointed at this `url` form, mirroring exactly how the production
  // viewer's own 'mapterhorn' source is declared (style.json). A `tiles:
  // [...]` XYZ-template array source (otherwise equivalent -- same
  // tileSize/encoding/factors) builds and reports itself as loaded, but
  // its color-relief layer never draws a single pixel; confirmed by
  // isolating this exact difference against a live map instance. Root
  // cause not fully understood (not documented either place checked --
  // MapLibre's style-spec docs and a web search), but the fix is real
  // and repeatable.
  const LINEAGE_TILEJSON_URL = 'https://stars.optgeo.org/mapterhorn-japan-bridge-lineage';

  // Palette mirrors hfu-mapterhorn/pipelines/lineage_inspect.py's own
  // PALETTE exactly (keep the two in sync by eye -- there's no shared
  // source of truth between the Python diagnostic tool and this JS
  // instrument). Global tier -> (source, resolution): 0=jpnational1
  // (DEM1A, 1m), 1-3=jpnational5 A/B/C (DEM5, 5m), 4-5=jpnational10 A/B
  // (DEM10, 10m), 6=jpnationalsea (GLO-30 fallback). Distinct hues per
  // resolution family (blue=1m, greens=5m, oranges=10m, grey=sea) so a
  // glance shows both "which family" and "which product" won at a pixel.
  const TIERS = [
    { value: 0, color: [30, 60, 200], label: '1m (DEM1A, jpnational1)' },
    { value: 1, color: [0, 130, 0], label: '5m A (DEM5A)' },
    { value: 2, color: [110, 200, 90], label: '5m B (DEM5B)' },
    { value: 3, color: [190, 235, 170], label: '5m C (DEM5C)' },
    { value: 4, color: [200, 120, 0], label: '10m A (DEM10A)' },
    { value: 5, color: [240, 190, 120], label: '10m B (DEM10B)' },
    { value: 6, color: [150, 150, 150], label: 'Sea (GLO-30 fallback)' }
  ];

  // The lineage PNG's R channel carries the raw category byte (0-6, or
  // 255 for nodata -- mapterhorn-japan-bridge DECISIONS.md D93/D94/D107,
  // utils.save_lineage_tile). A raster-dem source can only be paired with
  // a 'hillshade' or 'color-relief' layer, and color-relief-color is a
  // `type: color` paint property whose value must be an
  // `['interpolate', ['linear'], ['elevation'], stop, color, ...]`
  // expression -- `['elevation']` is a dedicated expression operator
  // (only legal inside color-relief-color) that reads whatever the
  // layer's raster-dem source's own `encoding` decodes; there is no
  // separate "mix" paint property to name channels with, so the
  // decode is entirely up to the source (here: encoding:'custom' with
  // redFactor:1 and the rest 0, giving the raw R channel byte 0-255
  // directly as "elevation"). Confirmed against maplibre-gl 5.24.0 by
  // trial (a plain 'raster' layer type and 'raster-color'/
  // 'color-relief-mix'/literal-array forms were all rejected) and cross-
  // checked against the MapLibre style spec's actual color-relief docs.
  //
  // `interpolate` only blends linearly between stops, so to get hard-
  // edged categorical colors out of it, each tier gets TWO adjacent
  // stops sharing its color (i and i+0.99) -- interpolating between two
  // identical colors is a no-op, so the tier's whole [i, i+0.99] span
  // reads as one flat color, and only the last 1% of its span blends
  // into the next tier (imperceptible at tile resolution). The final
  // stop (7, transparent) makes every value from 7 up to 255 (nodata)
  // read as transparent -- interpolate clamps to the last stop's color
  // beyond it, so nodata never gets silently painted the same color as
  // the top real tier (sea).
  function buildColorReliefExpression() {
    const expr = ['interpolate', ['linear'], ['elevation']];
    TIERS.forEach((tier, i) => {
      const color = `rgb(${tier.color.join(',')})`;
      expr.push(i, color, i + 0.99, color);
    });
    expr.push(TIERS.length, 'rgba(0,0,0,0)');
    return expr;
  }

  async function render(container) {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'mjbmon-map-wrap';
    container.appendChild(wrap);

    const mapDiv = document.createElement('div');
    mapDiv.className = 'mjbmon-map';
    mapDiv.style.position = 'relative';
    mapDiv.style.minHeight = '520px';
    wrap.appendChild(mapDiv);

    const legend = document.createElement('div');
    legend.className = 'mjbmon-map-legend';
    legend.innerHTML =
      TIERS.map(
        (tier) =>
          `<div class="mjbmon-map-legend-row"><span class="mjbmon-map-legend-swatch" style="background:rgb(${tier.color.join(',')})"></span>${tier.label}</div>`
      ).join('') +
      '<div class="mjbmon-map-legend-row" style="margin-top:6px;"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="mjbmon-lineage-toggle" checked />Show lineage overlay</label></div>';
    mapDiv.appendChild(legend);

    let style;
    try {
      style = await fetch(STYLE_URL).then((response) => response.json());
    } catch (error) {
      mapDiv.textContent = 'Failed to fetch the production viewer style.json.';
      return undefined;
    }

    style.sources.mjbmon_lineage = {
      type: 'raster-dem',
      url: LINEAGE_TILEJSON_URL,
      tileSize: 512,
      encoding: 'custom',
      redFactor: 1,
      greenFactor: 0,
      blueFactor: 0,
      baseShift: 0
    };

    const lineageLayer = {
      id: 'mjbmon-lineage',
      type: 'color-relief',
      source: 'mjbmon_lineage',
      minzoom: 8,
      paint: {
        'color-relief-color': buildColorReliefExpression(),
        'color-relief-opacity': 0.7
      }
    };
    // Stack the lineage color layer directly above hillshade (so terrain
    // shading still comes through beneath it) but below bvmap's own
    // labels/roads/admin layers (so place names stay legible on top) --
    // appending at the very end would bury every label under a flat
    // color wash instead.
    const hillshadeIndex = style.layers.findIndex((layer) => layer.id === 'hillshade');
    if (hillshadeIndex === -1) {
      style.layers.push(lineageLayer);
    } else {
      style.layers.splice(hillshadeIndex + 1, 0, lineageLayer);
    }

    const map = new maplibregl.Map({
      container: mapDiv,
      style,
      center: [141.35889, 42.71694], // 風不死岳, matches the production viewer's own default (D87)
      zoom: 11,
      pitch: 50,
      maxPitch: 85,
      localIdeographFontFamily: 'sans-serif'
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    map.addControl(new maplibregl.TerrainControl({ source: 'mapterhorn', exaggeration: 1 }), 'top-right');
    map.on('error', (event) => console.error('[mjbmon] lineage map error', event && event.error));
    map.on('load', () => {
      map.setTerrain({ source: 'mapterhorn', exaggeration: 1 });
    });

    const toggle = legend.querySelector('#mjbmon-lineage-toggle');
    toggle.addEventListener('change', () => {
      map.setLayoutProperty('mjbmon-lineage', 'visibility', toggle.checked ? 'visible' : 'none');
    });

    return () => {
      map.remove();
    };
  }

  MJBMON.registerInstrument({
    key: 'lineage',
    name: 'Lineage',
    parentKey: 'root',
    autoRefresh: false,
    order: 6,
    render
  });
})();
