(function () {
  const config = window.MJBMON_CONFIG || {};

  // Thresholds mirror MONITORING_REQUIREMENTS.md's resource-pressure
  // judgment table (informal: <70% disk used = ok, <90% = warn; memory
  // pressure level 1 = ok, 2 = warn, 3 = danger).
  function levelClass(ratio, warnAt, dangerAt) {
    if (ratio >= dangerAt) {
      return 'mjbmon-resource-bar-fill-danger';
    }
    if (ratio >= warnAt) {
      return 'mjbmon-resource-bar-fill-warn';
    }
    return 'mjbmon-resource-bar-fill-ok';
  }

  function renderBar(root, label, valueText, ratio, warnAt, dangerAt) {
    const row = document.createElement('div');
    row.className = 'mjbmon-resource-row';
    const track = document.createElement('div');
    track.className = 'mjbmon-resource-bar-track';
    const fill = document.createElement('div');
    fill.className = `mjbmon-resource-bar-fill ${levelClass(ratio, warnAt, dangerAt)}`;
    fill.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
    track.appendChild(fill);
    row.innerHTML = `<div class="mjbmon-resource-label"><span>${label}</span><span class="mjbmon-resource-value">${valueText}</span></div>`;
    row.appendChild(track);
    root.appendChild(row);
  }

  function memoryPressureLabel(level) {
    if (level === 1) return 'level 1 (ok)';
    if (level === 2) return 'level 2 (watch)';
    if (level >= 3) return 'level 3 (critical)';
    return 'unknown';
  }

  async function render(container) {
    container.innerHTML = '';

    let progress;
    try {
      progress = await fetch(config.PROGRESS_URL).then((response) => response.json());
    } catch (error) {
      container.textContent = 'Failed to fetch progress.json.';
      return;
    }

    const root = document.createElement('div');
    const resources = progress.resources || {};

    (resources.disk || []).forEach((disk) => {
      const usedGb = disk.total_gb - disk.avail_gb;
      const ratio = disk.total_gb > 0 ? usedGb / disk.total_gb : 0;
      renderBar(
        root,
        disk.volume,
        `used ${usedGb.toLocaleString('en-US')}GB / total ${disk.total_gb.toLocaleString('en-US')}GB (free ${disk.avail_gb.toLocaleString('en-US')}GB)`,
        ratio,
        0.7,
        0.9
      );
    });

    const memLevel = resources.memory_pressure_level;
    if (typeof memLevel === 'number') {
      renderBar(root, 'Memory pressure', memoryPressureLabel(memLevel), (memLevel - 1) / 2, 0.4, 0.8);
    }

    if (Array.isArray(resources.load_average)) {
      const loadBox = document.createElement('div');
      loadBox.className = 'mjbmon-stat-box';
      loadBox.style.marginTop = '16px';
      loadBox.innerHTML = `<div class="mjbmon-stat-label">load average (1/5/15 min)</div><div class="mjbmon-stat-value">${resources.load_average.join(' / ')}</div>`;
      root.appendChild(loadBox);
    }

    const caption = document.createElement('p');
    caption.className = 'mjbmon-caption';
    caption.textContent = `Snapshot taken at: ${new Date(progress.generated_at).toLocaleString('en-US', { hour12: false })}`;
    root.appendChild(caption);

    container.appendChild(root);
  }

  MJBMON.registerInstrument({
    key: 'resources',
    name: 'Resources',
    parentKey: 'root',
    order: 4,
    render
  });
})();
