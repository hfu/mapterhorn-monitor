(function () {
  const config = window.MJBMON_CONFIG || {};

  function escapeXml(value) {
    return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function formatTick(ms) {
    return new Date(ms).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Points come from history.json, which is derived from the actual mtimes
  // of each repaired position's own output .pmtiles file on slate (not
  // from the .done marker itself -- aggregation_run.py's `os.rename(.todo,
  // .done)` doesn't touch mtime, so the marker's timestamp is whenever the
  // .todo was created, not when the item actually finished). This makes
  // the series a real ground-truth reconstruction, not a transcript of
  // this session's own tick messages.
  function renderSvg(points) {
    const width = 900;
    const height = 220;
    const leftPad = 46;
    const rightPad = 12;
    const topPad = 16;
    const bottomPad = 26;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = height - topPad - bottomPad;

    const times = points.map((p) => new Date(p.t).getTime());
    const values = points.map((p) => p.repaired);
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const vMax = Math.max(1, ...values);

    const x = (t) => leftPad + ((t - tMin) / (tMax - tMin || 1)) * plotWidth;
    const y = (v) => topPad + plotHeight - (v / vMax) * plotHeight;

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(new Date(p.t).getTime()).toFixed(1)} ${y(p.repaired).toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L ${x(tMax).toFixed(1)} ${(topPad + plotHeight).toFixed(1)} L ${x(tMin).toFixed(1)} ${(topPad + plotHeight).toFixed(1)} Z`;

    const yTickCount = 4;
    const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => Math.round((vMax * i) / yTickCount));
    const yGridSvg = yTicks
      .map(
        (v) => `
        <line x1="${leftPad}" y1="${y(v).toFixed(1)}" x2="${width - rightPad}" y2="${y(v).toFixed(1)}" stroke="#1a2433" stroke-width="1" />
        <text x="${leftPad - 8}" y="${y(v).toFixed(1) + 3}" font-size="10" fill="#95a8be" text-anchor="end">${v.toLocaleString('en-US')}</text>
      `
      )
      .join('');

    const xTickCount = 6;
    const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => tMin + ((tMax - tMin) * i) / xTickCount);
    const xAxisSvg = xTicks
      .map(
        (t) => `
        <text x="${x(t).toFixed(1)}" y="${height - 6}" font-size="10" fill="#95a8be" text-anchor="middle">${escapeXml(formatTick(t))}</text>
      `
      )
      .join('');

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="inherit">
      ${yGridSvg}
      <path d="${areaPath}" fill="#5fae8c" fill-opacity="0.15" stroke="none" />
      <path d="${linePath}" fill="none" stroke="#5fae8c" stroke-width="2" />
      ${xAxisSvg}
    </svg>`;
  }

  async function render(container) {
    container.innerHTML = '';

    let points;
    try {
      points = await fetch(config.HISTORY_URL).then((response) => response.json());
    } catch (error) {
      container.textContent = 'Failed to fetch history.json.';
      return;
    }

    if (!Array.isArray(points) || points.length < 2) {
      container.textContent = 'Not enough history yet.';
      return;
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = renderSvg(points);
    container.appendChild(wrap);

    const latest = points[points.length - 1];
    const summary = document.createElement('p');
    summary.className = 'mjbmon-caption';
    summary.textContent = `Latest: ${latest.repaired.toLocaleString('en-US')} repaired as of ${new Date(latest.t).toLocaleString('en-US', { hour12: false })}.`;
    container.appendChild(summary);
  }

  MJBMON.registerInstrument({
    key: 'progress-trend',
    name: 'Progress Trend',
    parentKey: 'root',
    order: 0,
    render
  });
})();
