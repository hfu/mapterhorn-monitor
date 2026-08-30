(function () {
  const config = window.MJBMON_CONFIG || {};

  // Native Open MCT plan/timeline attempt (2026-08-31): openmct.plugins.
  // PlanLayout()'s 'plan' view has canView = `type === 'plan'`, which looked
  // like it would accept a hand-registered domainObject the same way
  // mjbmon.instrument's own objectViews provider does. It does render the
  // time axis and "now" line off a manually-seeded openmct.time context (no
  // time-conductor UI plugin is installed here, so nothing sets that by
  // default), but the swimlane body (.c-plan__contents) stays permanently
  // empty for a provider-backed object regardless of selectFile.body shape
  // (object literal, or JSON string with a selectFile.name) -- console
  // repeatedly logs "Attempted to mutate immutable object", consistent with
  // the view expecting a real openmct.objects.getMutable() projection that
  // a non-persisted custom provider can't supply. This is the same class of
  // wall sas0's DECISIONS.md documents for the Plot/Telemetry API (only
  // renders for +Create'd objects) -- so, same resolution: a custom SVG
  // view registered as a normal mjbmon.instrument, below, rather than
  // fighting an rc1 build's undocumented object-mutability requirements.
  const GROUP_NAME = 'D74-D76 復旧 → 号1 最終ビルド';
  const HOUR = 60 * 60 * 1000;

  // Sequential estimated durations for the steps after the live
  // aggregation_repair_3344 stage. Where a real historical anchor exists
  // (rsync: D73's actual publish_cycle_12 transfer, ~7h at national scale)
  // it's used directly; everything else is a rough estimate pending a real
  // measurement from the next full cycle -- kept in each activity's own
  // `estimated` flag so the render can mark it visually, rather than in the
  // label text (D73's parenthetical labels got unreadable once wrapped in
  // narrow SVG bars).
  const PLANNED_STEPS = [
    { name: 'downsampling 再収束', durationMs: 2 * HOUR, estimated: true },
    { name: 'bundle.py + merge_japan_bundles.py', durationMs: 4 * HOUR, estimated: true },
    { name: 'pmtiles merge (z0-7 Mapterhorn + z8+ 自前)', durationMs: 0.5 * HOUR, estimated: true },
    { name: 'check_pmtiles_integrity.py', durationMs: 0.5 * HOUR, estimated: true },
    { name: '目視確認: 市松模様の再評価', durationMs: 0.5 * HOUR, estimated: true },
    { name: 'stars へ rsync', durationMs: 7 * HOUR, estimated: false, note: 'D73実績: 約7時間・311GB@~11MB/s' }
  ];

  function buildActivities(progress) {
    const stage = progress.current_stage || {};
    const startedMs = stage.started_at ? new Date(stage.started_at).getTime() : Date.now();
    const generatedMs = new Date(progress.generated_at).getTime();
    const done = stage.done || 0;
    const baseline = stage.baseline_done || 0;
    const total = stage.total_to_repair || 0;
    const repaired = done - baseline;

    let projectedEndMs = generatedMs;
    if (repaired > 0 && total > 0) {
      const rate = repaired / (generatedMs - startedMs);
      const remaining = Math.max(0, total - repaired);
      projectedEndMs = generatedMs + remaining / rate;
    }

    const activities = [
      {
        name: stage.name || '現在のステージ',
        note: `${repaired.toLocaleString('ja-JP')}/${total.toLocaleString('ja-JP')}件`,
        start: startedMs,
        actualEnd: generatedMs,
        end: Math.max(projectedEndMs, generatedMs + 60000),
        current: true
      }
    ];

    let cursor = activities[0].end;
    PLANNED_STEPS.forEach((step) => {
      const start = cursor;
      const end = start + step.durationMs;
      activities.push({ name: step.name, note: step.note, start, end, estimated: step.estimated });
      cursor = end;
    });

    return { activities, nowMs: generatedMs };
  }

  function formatTick(ms) {
    return new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function renderSvg(activities, nowMs) {
    const domainStart = Math.min(...activities.map((a) => a.start));
    const domainEnd = Math.max(...activities.map((a) => a.end));
    const domainSpan = domainEnd - domainStart || 1;

    const width = 900;
    const rowHeight = 34;
    const topPad = 30;
    const leftPad = 8;
    const rightPad = 8;
    const labelHeight = 16;
    const plotWidth = width - leftPad - rightPad;
    const height = topPad + activities.length * rowHeight + 10;

    const x = (ms) => leftPad + ((ms - domainStart) / domainSpan) * plotWidth;

    const tickCount = 5;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => domainStart + (domainSpan * i) / tickCount);

    const axisSvg = ticks
      .map((t) => {
        const tx = x(t);
        return `<line x1="${tx}" y1="${topPad - 6}" x2="${tx}" y2="${height - 6}" stroke="#1a2433" stroke-width="1" />
                <text x="${tx}" y="${topPad - 12}" font-size="10" fill="#95a8be" text-anchor="middle">${escapeXml(formatTick(t))}</text>`;
      })
      .join('');

    const rowsSvg = activities
      .map((activity, i) => {
        const y = topPad + i * rowHeight;
        const barY = y + 4;
        const barHeight = rowHeight - labelHeight;
        const xStart = x(activity.start);
        const xEnd = x(activity.end);
        const barWidth = Math.max(2, xEnd - xStart);

        let bars = '';
        if (activity.current) {
          const xActualEnd = x(activity.actualEnd);
          const actualWidth = Math.max(1, xActualEnd - xStart);
          const projectedWidth = Math.max(1, xEnd - xActualEnd);
          bars = `
            <rect x="${xStart}" y="${barY}" width="${actualWidth}" height="${barHeight}" fill="#5fae8c" rx="2" />
            <rect x="${xActualEnd}" y="${barY}" width="${projectedWidth}" height="${barHeight}" fill="#5fae8c" fill-opacity="0.28" rx="2" />
          `;
        } else {
          const fillOpacity = activity.estimated ? 0.32 : 0.55;
          const dash = activity.estimated ? 'stroke-dasharray="3,2"' : '';
          bars = `<rect x="${xStart}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#2f6fe0" fill-opacity="${fillOpacity}" stroke="#2f6fe0" stroke-width="1" ${dash} rx="2" />`;
        }

        const label = activity.note ? `${activity.name}(${activity.note})` : activity.name;

        return `
          <g>
            ${bars}
            <text x="${leftPad}" y="${barY + barHeight + 12}" font-size="11" fill="#dce6f1">${escapeXml(label)}</text>
          </g>
        `;
      })
      .join('');

    const nowX = x(nowMs);
    const nowLine =
      nowX >= leftPad && nowX <= width - rightPad
        ? `<line x1="${nowX}" y1="${topPad - 14}" x2="${nowX}" y2="${height - 4}" stroke="#e4c74a" stroke-width="1.5" stroke-dasharray="4,3" />
           <text x="${nowX}" y="12" font-size="10" fill="#e4c74a" text-anchor="middle">現在</text>`
        : '';

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="inherit">
      ${axisSvg}
      ${rowsSvg}
      ${nowLine}
    </svg>`;
  }

  async function render(container) {
    container.innerHTML = '';

    let progress;
    try {
      progress = await fetch(config.PROGRESS_URL).then((response) => response.json());
    } catch (error) {
      container.textContent = 'progress.jsonの取得に失敗しました。';
      return;
    }

    const caption = document.createElement('p');
    caption.className = 'mjbmon-caption';
    caption.textContent =
      '実線=実績・進行中(濃)/見積り残り(薄) — 破線枠=完全な見積り — 実線枠(青)=歴史的実績に基づく見積り(rsync)。D74-D76復旧完了後の号1最終ビルドまでの全工程。';
    container.appendChild(caption);

    const { activities, nowMs } = buildActivities(progress);
    const wrap = document.createElement('div');
    wrap.innerHTML = renderSvg(activities, nowMs);
    container.appendChild(wrap);
  }

  MJBMON.registerInstrument({
    key: 'mission-timeline',
    name: 'ミッションタイムライン(ETA)',
    parentKey: 'root',
    order: 4,
    render
  });
})();
