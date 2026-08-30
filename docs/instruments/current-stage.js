(function () {
  const config = window.MJBMON_CONFIG || {};

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) {
      return '不明';
    }
    const minutes = ms / 60000;
    if (minutes < 90) {
      return `約${Math.round(minutes)}分`;
    }
    const hours = minutes / 60;
    if (hours < 48) {
      return `約${hours.toFixed(1)}時間`;
    }
    return `約${(hours / 24).toFixed(1)}日`;
  }

  // Linear-rate ETA from the two timestamps embedded in progress.json --
  // (done - baseline_done) tiles repaired since started_at, projected
  // forward against the remaining total_to_repair. This is a rough
  // instantaneous estimate (D74-D76's repair pace is known to be very
  // uneven -- some positions take under a minute, a Kyushu-tier item was
  // observed taking ~29 minutes), matching the same caveat MONITORING_
  // REQUIREMENTS.md gives for the manual tick reports this instrument
  // mirrors.
  function computeEta(stage, generatedAt) {
    if (!stage.started_at) {
      return null;
    }
    const startedMs = new Date(stage.started_at).getTime();
    const nowMs = new Date(generatedAt).getTime();
    const elapsedMs = nowMs - startedMs;
    const repaired = (stage.done || 0) - (stage.baseline_done || 0);
    if (elapsedMs <= 0 || repaired <= 0) {
      return null;
    }
    const rate = repaired / elapsedMs; // items per ms
    const remaining = (stage.total_to_repair || 0) - repaired;
    if (remaining <= 0) {
      return { remainingMs: 0, ratePerMinute: rate * 60000 };
    }
    return { remainingMs: remaining / rate, ratePerMinute: rate * 60000 };
  }

  async function render(container) {
    container.innerHTML = '';
    const root = document.createElement('div');

    let progress;
    try {
      progress = await fetch(config.PROGRESS_URL).then((response) => response.json());
    } catch (error) {
      container.textContent = 'progress.jsonの取得に失敗しました。';
      return;
    }

    const stage = progress.current_stage || {};
    const nameEl = document.createElement('div');
    nameEl.className = 'mjbmon-stage-name';
    nameEl.textContent = stage.name || '(不明なステージ)';
    root.appendChild(nameEl);

    if (stage.description) {
      const descEl = document.createElement('div');
      descEl.className = 'mjbmon-stage-desc';
      descEl.textContent = stage.description;
      root.appendChild(descEl);
    }

    const done = stage.done || 0;
    const baseline = stage.baseline_done || 0;
    const total = stage.total_to_repair;
    const repaired = done - baseline;

    if (typeof total === 'number') {
      const pct = total > 0 ? (100 * repaired) / total : 0;

      const numbers = document.createElement('div');
      numbers.className = 'mjbmon-stage-numbers';
      numbers.innerHTML = `
        <span class="mjbmon-stage-done">${repaired.toLocaleString('ja-JP')}</span>
        <span class="mjbmon-stage-total">/ ${total.toLocaleString('ja-JP')}</span>
        <span class="mjbmon-stage-pct">(${pct.toFixed(1)}%)</span>
      `;
      root.appendChild(numbers);

      const track = document.createElement('div');
      track.className = 'mjbmon-progress-track';
      const fill = document.createElement('div');
      fill.className = 'mjbmon-progress-fill';
      fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      track.appendChild(fill);
      root.appendChild(track);
    }

    const eta = computeEta(stage, progress.generated_at);
    const grid = document.createElement('div');
    grid.className = 'mjbmon-stage-eta-grid';

    const boxes = [
      ['累計 .done件数', `${done.toLocaleString('ja-JP')}`],
      ['ペース', eta ? `${eta.ratePerMinute.toFixed(2)}件/分` : '算出不可'],
      ['ETA残り', eta ? formatDuration(eta.remainingMs) : '算出不可'],
      ['開始時刻', stage.started_at ? new Date(stage.started_at).toLocaleString('ja-JP', { hour12: false }) : '－']
    ];
    boxes.forEach(([label, value]) => {
      const box = document.createElement('div');
      box.className = 'mjbmon-stat-box';
      box.innerHTML = `<div class="mjbmon-stat-label">${label}</div><div class="mjbmon-stat-value">${value}</div>`;
      grid.appendChild(box);
    });
    root.appendChild(grid);

    const caption = document.createElement('p');
    caption.className = 'mjbmon-caption';
    caption.textContent = `スナップショット取得時刻: ${new Date(progress.generated_at).toLocaleString('ja-JP', { hour12: false })}${
      progress.note ? ' — ' + progress.note : ''
    }`;
    root.appendChild(caption);

    container.appendChild(root);
  }

  MJBMON.registerInstrument({
    key: 'current-stage',
    name: '現在のステージ',
    parentKey: 'root',
    order: 0,
    render
  });
})();
