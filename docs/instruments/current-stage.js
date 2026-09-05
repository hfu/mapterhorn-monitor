(function () {
  const config = window.MJBMON_CONFIG || {};

  // Rewritten 2026-09-05 (Hidenori feedback: "the stat grid is the part I
  // actually want, and it's empty"). The original computeEta()/render() read
  // current_stage.done/baseline_done/total_to_repair/started_at -- fields
  // that only ever existed for 1-go's D74-D76 repair cycle. 1.5-go's
  // progress.json instead carries a top-level `aggregation: {done, total}`
  // and never populated those stage-level fields, so every box silently
  // rendered a zero or "n/a" instead of erroring loudly. Now reads
  // `aggregation` directly, and `current_stage.started_at` (added to
  // progress.json alongside this fix) for the rate/ETA math -- with no
  // baseline to subtract, since 1.5-go counts from a fresh 0, not a repair
  // baseline.
  function computeEta(startedAtIso, done, total, generatedAt) {
    if (!startedAtIso) {
      return null;
    }
    const startedMs = new Date(startedAtIso).getTime();
    const nowMs = new Date(generatedAt).getTime();
    const elapsedMs = nowMs - startedMs;
    if (elapsedMs <= 0 || done <= 0) {
      return null;
    }
    const rate = done / elapsedMs; // items per ms
    const remaining = (total || 0) - done;
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
      container.textContent = 'Failed to fetch progress.json.';
      return;
    }

    const stage = progress.current_stage || {};
    const agg = progress.aggregation || {};

    const nameEl = document.createElement('div');
    nameEl.className = 'mjbmon-stage-name';
    nameEl.textContent = stage.name || '(unknown stage)';
    root.appendChild(nameEl);

    const done = agg.done || 0;
    const total = agg.total;

    // Numbers + progress bar lead the view -- this is the "at a glance"
    // answer to "how far along are we", so it comes before the long-form
    // narrative rather than after it.
    if (typeof total === 'number') {
      const pct = total > 0 ? (100 * done) / total : 0;

      const numbers = document.createElement('div');
      numbers.className = 'mjbmon-stage-numbers';
      numbers.innerHTML = `
        <span class="mjbmon-stage-done">${done.toLocaleString('en-US')}</span>
        <span class="mjbmon-stage-total">/ ${total.toLocaleString('en-US')}</span>
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

    const eta = computeEta(stage.started_at, done, total, progress.generated_at);
    const grid = document.createElement('div');
    grid.className = 'mjbmon-stage-eta-grid';

    // Estimated completion is shown as an absolute timestamp, not a
    // relative "~N hours" duration -- a relative figure is only correct
    // at the instant this snapshot was generated, and goes silently stale
    // (and misleading) the moment someone looks at it later. An absolute
    // clock time stays correct-as-of-its-own-basis regardless of when it's
    // viewed (Hidenori feedback, ahead of sharing this dashboard with
    // outside collaborators; mapterhorn-japan-bridge DECISIONS.md D89).
    const etaAbsolute =
      eta && Number.isFinite(eta.remainingMs)
        ? new Date(new Date(progress.generated_at).getTime() + eta.remainingMs).toLocaleString('en-US', {
            hour12: false
          })
        : null;

    const boxes = [
      ['Cumulative .done count', `${done.toLocaleString('en-US')}`],
      ['Rate', eta ? `${eta.ratePerMinute.toFixed(2)} items/min` : 'n/a'],
      ['Estimated completion', etaAbsolute || 'n/a'],
      ['Started at', stage.started_at ? new Date(stage.started_at).toLocaleString('en-US', { hour12: false }) : '-']
    ];
    boxes.forEach(([label, value]) => {
      const box = document.createElement('div');
      box.className = 'mjbmon-stat-box';
      box.innerHTML = `<div class="mjbmon-stat-label">${label}</div><div class="mjbmon-stat-value">${value}</div>`;
      grid.appendChild(box);
    });
    root.appendChild(grid);

    // The long-form narrative comes last -- still available for anyone who
    // wants the full story (this is also literally session-resume context,
    // shared verbatim with DECISIONS.md), but it no longer sits between the
    // reader and the numbers.
    if (stage.description) {
      const descEl = document.createElement('div');
      descEl.className = 'mjbmon-stage-desc';
      descEl.textContent = stage.description;
      root.appendChild(descEl);
    }

    const caption = document.createElement('p');
    caption.className = 'mjbmon-caption';
    caption.textContent = `Snapshot taken at: ${new Date(progress.generated_at).toLocaleString('en-US', { hour12: false })}`;
    root.appendChild(caption);

    container.appendChild(root);
  }

  MJBMON.registerInstrument({
    key: 'current-stage',
    name: 'Current Stage',
    parentKey: 'root',
    order: 1,
    render
  });
})();
