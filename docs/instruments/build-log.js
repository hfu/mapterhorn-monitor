(function () {
  const config = window.MJBMON_CONFIG || {};

  function formatTimestamp(iso) {
    return new Date(iso).toLocaleString('en-US', { hour12: false });
  }

  async function render(container) {
    container.innerHTML = '';

    let entries;
    try {
      entries = await fetch(config.BUILD_LOG_URL).then((response) => response.json());
    } catch (error) {
      container.textContent = 'Failed to fetch build_log.json.';
      return;
    }

    const caption = document.createElement('p');
    caption.className = 'mjbmon-caption';
    caption.textContent = 'Mirrors the D-numbered entries in mapterhorn-japan-bridge\'s DECISIONS.md.';
    container.appendChild(caption);

    const list = document.createElement('ul');
    list.className = 'mjbmon-log-list';
    entries
      .slice()
      .reverse()
      .forEach((entry) => {
        const item = document.createElement('li');

        const id = document.createElement('span');
        id.className = `mjbmon-log-id mjbmon-log-severity-${entry.severity || 'info'}`;
        id.textContent = entry.id;

        const time = document.createElement('span');
        time.className = 'mjbmon-log-time';
        time.textContent = formatTimestamp(entry.time);

        const summary = document.createElement('span');
        summary.className = 'mjbmon-log-summary';
        summary.textContent = entry.summary;

        item.appendChild(id);
        item.appendChild(time);
        item.appendChild(summary);
        list.appendChild(item);
      });
    container.appendChild(list);
  }

  MJBMON.registerInstrument({
    key: 'build-log',
    name: 'Change Log',
    parentKey: 'root',
    order: 2,
    render
  });
})();
