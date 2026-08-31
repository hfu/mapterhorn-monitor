(function () {
  const config = window.MJBMON_CONFIG || {};

  const DONE_COLOR = '#5fae8c';
  const PENDING_COLOR = '#e46a4a';

  function toGeoJson(rows) {
    return {
      type: 'FeatureCollection',
      features: rows.map(([lon, lat, z, done]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { z, done }
      }))
    };
  }

  const INFO_PLACEHOLDER_HTML =
    '<div class="mjbmon-map-legend-row" style="margin:0;color:#95a8be;">Hover over a point on the map for details.</div>';

  function renderInfoPanel(panel, feature) {
    if (!feature) {
      panel.innerHTML = INFO_PLACEHOLDER_HTML;
      return;
    }
    const { z, done } = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;
    const statusText = done ? 'Rebuilt' : 'Pending rebuild (D76 repair target)';
    panel.innerHTML = `<strong>z=${z}</strong> (${lon.toFixed(3)}, ${lat.toFixed(3)}) — ${statusText}`;
  }

  async function render(container) {
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'mjbmon-map-wrap';
    wrap.style.position = 'relative';
    container.appendChild(wrap);

    const mapDiv = document.createElement('div');
    mapDiv.className = 'mjbmon-map';
    wrap.appendChild(mapDiv);

    const legend = document.createElement('div');
    legend.className = 'mjbmon-map-legend';
    legend.innerHTML = `
      <div class="mjbmon-map-legend-row"><span class="mjbmon-map-legend-swatch" style="background:${DONE_COLOR}"></span>Rebuilt</div>
      <div class="mjbmon-map-legend-row"><span class="mjbmon-map-legend-swatch" style="background:${PENDING_COLOR}"></span>Pending rebuild (aggregation_repair_3344 target)</div>
    `;
    wrap.appendChild(legend);

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
      // point layer (the actual information) still renders.
      style = { version: 8, sources: {}, layers: [] };
    }

    style.sources.mjbmon_agg_tiles = { type: 'geojson', data: toGeoJson(rows) };
    style.layers.push({
      id: 'mjbmon-agg-tile-point',
      type: 'circle',
      source: 'mjbmon_agg_tiles',
      paint: {
        'circle-radius': 4,
        'circle-color': ['case', ['==', ['get', 'done'], 1], DONE_COLOR, PENDING_COLOR],
        'circle-opacity': 0.75,
        'circle-stroke-width': 0.5,
        'circle-stroke-color': '#0d1117'
      }
    });

    const map = new maplibregl.Map({
      container: mapDiv,
      style,
      center: [136, 36],
      zoom: 4
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('error', (event) => console.error('[mjbmon] maplibre error', event && event.error));

    map.on('mouseenter', 'mjbmon-agg-tile-point', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'mjbmon-agg-tile-point', () => {
      map.getCanvas().style.cursor = '';
      renderInfoPanel(infoPanel, null);
    });
    map.on('mousemove', 'mjbmon-agg-tile-point', (event) => {
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
    order: 1,
    render
  });
})();
