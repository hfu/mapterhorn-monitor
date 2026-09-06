(function () {
  const STYLE_URL = 'https://hfu.github.io/mapterhorn-japan-bridge/style.json';
  // martin's own TileJSON endpoint (no {z}/{x}/{y} template) -- matches
  // how the production viewer's own 'mapterhorn' source is declared
  // (style.json), and needed for maplibre-gl to pick up the real
  // minzoom/maxzoom (8/16) from martin's TileJSON response so zooming
  // past 16 overzooms cleanly instead of requesting tiles that don't
  // exist.
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
  // utils.save_lineage_tile; G/B are always 0). A raster-dem source can
  // only be paired with a 'hillshade' or 'color-relief' layer, and
  // color-relief-color takes an
  // `['interpolate', ['linear'], ['elevation'], stop, color, ...]`
  // expression (['elevation'] is a dedicated operator, only legal inside
  // color-relief-color) reading whatever the source's own raster-dem
  // `encoding` decodes.
  //
  // encoding:'custom' (redFactor/greenFactor/blueFactor/baseShift, the
  // spec's documented way to decode an arbitrary channel combination)
  // LOOKS like the right tool here, and maplibre-gl 5.24.0's style
  // *validator* accepts it -- but the *renderer* silently never draws a
  // single pixel through it, in every combination tried (factor scaling,
  // `tiles` vs `url` source form, a same-source hillshade companion
  // layer). Switching the exact same source to encoding:'terrarium' --
  // undocumented for this data, since these bytes were never meant to be
  // read that way -- immediately produced real, varied color-relief
  // output. Confirmed live by isolating the source's `encoding` value as
  // the only variable. Conclusion: encoding:'custom' is unimplemented in
  // this MapLibre version's actual renderer despite being spec'd and
  // validator-accepted (MapLibre Native's own docs already disclose it's
  // missing on Android/iOS; this suggests web isn't fully there either).
  //
  // So: decode via terrarium's real formula instead --
  // elevation = R*256 + G + B/256 - 32768 -- and simply compute where
  // each category byte (0-6) lands under that formula (spaced exactly
  // 256 apart, since G=B=0 always). `interpolate` only blends linearly,
  // so to get hard-edged categorical colors out of it, each tier gets
  // two stops 253 apart sharing its color (leaving a 3-unit blend margin
  // out of each 256-wide band -- imperceptible at tile resolution).
  // nodata (R=255) decodes to +32512, far outside the real tiers'
  // -32768..-31232 span, so a single stop right after the last real tier
  // catches it (and anything else stray) as transparent via clamping,
  // with no risk of it reading as a real tier's color.
  const TERRARIUM_OFFSET = -32768;
  function terrariumValueForByte(byte) {
    return byte * 256 + TERRARIUM_OFFSET;
  }
  function buildColorReliefExpression() {
    const expr = ['interpolate', ['linear'], ['elevation']];
    TIERS.forEach((tier) => {
      const color = `rgb(${tier.color.join(',')})`;
      const start = terrariumValueForByte(tier.value);
      expr.push(start, color, start + 253, color);
    });
    expr.push(terrariumValueForByte(TIERS.length), 'rgba(0,0,0,0)');
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
      encoding: 'terrarium'
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
    // Stack the lineage color layer above EVERY bvmap fill/line layer
    // (water, land-use, buildings, roads, contours -- 110+ of them,
    // stacked well above hillshade itself) but below its first label:
    // inserting right after 'hillshade' (this instrument's original,
    // wrong placement) left the lineage wash sitting *underneath*
    // bvmap's own water/land fills, which then painted over it
    // completely -- confirmed live, the published overlay was invisible
    // even though tiles were fetching fine. bvmap's own layer order
    // happens to put every fill/line layer before its first symbol
    // (label) layer, so "right before the first symbol layer" is
    // exactly the fills-covered-but-labels-on-top position this needs.
    const firstSymbolIndex = style.layers.findIndex((layer) => layer.type === 'symbol');
    if (firstSymbolIndex === -1) {
      style.layers.push(lineageLayer);
    } else {
      style.layers.splice(firstSymbolIndex, 0, lineageLayer);
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
