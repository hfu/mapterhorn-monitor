(function () {
  const config = window.MJBMON_CONFIG || {};

  const DONE_COLOR = '#5fae8c';
  const PENDING_COLOR = '#e46a4a';

  // Real tile-coverage rectangles, not point markers -- aggregation items
  // sit at whatever native zoom their source density calls for (mostly
  // z8-z12, per PIPELINE_DESIGN.md), so rectangles of very different sizes
  // stack on top of each other once zoomed out. Low fill-opacity keeps
  // overlapping regions legible (denser overlap reads as a deeper color)
  // instead of the small tiles just disappearing under the large ones.
  function toGeoJson(rows) {
    return {
      type: 'FeatureCollection',
      features: rows.map(([w, s, e, n, z, done]) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s]
            ]
          ]
        },
        properties: { z, done }
      }))
    };
  }

  const INFO_PLACEHOLDER_HTML =
    '<div class="mjbmon-map-legend-row" style="margin:0;color:#95a8be;">Hover over a tile on the map for details.</div>';

  function renderInfoPanel(panel, feature) {
    if (!feature) {
      panel.innerHTML = INFO_PLACEHOLDER_HTML;
      return;
    }
    const { z, done } = feature.properties;
    const statusText = done ? 'Rebuilt' : 'Pending rebuild (D76 repair target)';
    panel.innerHTML = `<strong>z=${z}</strong> — ${statusText}`;
  }

  async function render(container) {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'mjbmon-map-wrap';
    container.appendChild(wrap);

    const mapDiv = document.createElement('div');
    mapDiv.className = 'mjbmon-map';
    // The legend is positioned absolute+bottom -- it must anchor to the map
    // element alone, not to `wrap` (which also contains the 72px-tall info
    // panel stacked below the map). Anchoring to `wrap` put "bottom: 24px"
    // 24px above the bottom of the *whole* wrap, i.e. inside the info
    // panel's own vertical span, so the two visibly overlapped.
    mapDiv.style.position = 'relative';
    wrap.appendChild(mapDiv);

    const legend = document.createElement('div');
    legend.className = 'mjbmon-map-legend';
    legend.innerHTML = `
      <div class="mjbmon-map-legend-row"><span class="mjbmon-map-legend-swatch" style="background:${DONE_COLOR}"></span>Rebuilt</div>
      <div class="mjbmon-map-legend-row"><span class="mjbmon-map-legend-swatch" style="background:${PENDING_COLOR}"></span>Pending rebuild (aggregation_repair_3344 target)</div>
    `;
    mapDiv.appendChild(legend);

    const infoPanel = document.createElement('div');
    infoPanel.className = 'mjbmon-map-info';
    infoPanel.innerHTML = INFO_PLACEHOLDER_HTML;
    wrap.appendChild(infoPanel);

    let rows;
    try {
      rows = await fetch(config.AGG_TILES_URL).then((response) => response.json());
    } catch (error) {
      mapDiv.textContent = 'Failed to fetch agg_tiles.json.';
      return undefined;
    }

    let style;
    try {
      style = await fetch(config.BASEMAP_STYLE_URL).then((response) => response.json());
    } catch (error) {
      // Basemap is nice-to-have -- fall back to a bare style so the
      // coverage layer (the actual information) still renders.
      style = { version: 8, sources: {}, layers: [] };
    }

    style.sources.mjbmon_agg_tiles = { type: 'geojson', data: toGeoJson(rows) };
    style.layers.push(
      {
        id: 'mjbmon-agg-tile-fill',
        type: 'fill',
        source: 'mjbmon_agg_tiles',
        paint: {
          'fill-color': ['case', ['==', ['get', 'done'], 1], DONE_COLOR, PENDING_COLOR],
          'fill-opacity': 0.16
        }
      },
      {
        id: 'mjbmon-agg-tile-outline',
        type: 'line',
        source: 'mjbmon_agg_tiles',
        paint: {
          'line-color': ['case', ['==', ['get', 'done'], 1], DONE_COLOR, PENDING_COLOR],
          'line-opacity': 0.35,
          'line-width': 0.5
        }
      }
    );

    const map = new maplibregl.Map({
      container: mapDiv,
      style,
      center: [136, 36],
      zoom: 4
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('error', (event) => console.error('[mjbmon] maplibre error', event && event.error));

    map.on('mouseenter', 'mjbmon-agg-tile-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'mjbmon-agg-tile-fill', () => {
      map.getCanvas().style.cursor = '';
      renderInfoPanel(infoPanel, null);
    });
    map.on('mousemove', 'mjbmon-agg-tile-fill', (event) => {
      const feature = event.features && event.features[0];
      renderInfoPanel(infoPanel, feature || null);
    });

    return () => {
      map.remove();
    };
  }

  MJBMON.registerInstrument({
    key: 'status-map',
    name: 'Status Map',
    parentKey: 'root',
    autoRefresh: false,
    order: 2,
    render
  });
})();
