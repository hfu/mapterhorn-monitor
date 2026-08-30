(function () {
  const config = window.MJBMON_CONFIG || {};

  const STATUS_LABEL = {
    published: '公開中',
    local_only: 'slateローカルのみ',
    not_yet_built: '未生成'
  };

  const STATUS_CLASS = {
    published: 'mjbmon-pmtiles-status-published',
    local_only: 'mjbmon-pmtiles-status-local',
    not_yet_built: 'mjbmon-pmtiles-status-pending'
  };

  function formatBytes(bytes) {
    if (bytes == null) {
      return '－';
    }
    const gb = bytes / 1e9;
    if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    }
    return `${(bytes / 1e6).toFixed(1)} MB`;
  }

  function formatZoomRange(entry) {
    if (entry.min_zoom == null || entry.max_zoom == null) {
      return '－';
    }
    return `z${entry.min_zoom} - z${entry.max_zoom}`;
  }

  function renderCard(entry) {
    const card = document.createElement('div');
    card.className = 'mjbmon-pmtiles-card';

    const header = document.createElement('div');
    header.className = 'mjbmon-pmtiles-card-header';
    const statusBadge = `<span class="mjbmon-pmtiles-status ${STATUS_CLASS[entry.status] || ''}">${STATUS_LABEL[entry.status] || entry.status}</span>`;
    header.innerHTML = `<span class="mjbmon-pmtiles-name">${entry.name}</span>${statusBadge}`;
    card.appendChild(header);

    if (entry.description) {
      const desc = document.createElement('div');
      desc.className = 'mjbmon-pmtiles-desc';
      desc.textContent = entry.description;
      card.appendChild(desc);
    }

    const grid = document.createElement('div');
    grid.className = 'mjbmon-pmtiles-meta-grid';
    const metaRows = [
      ['ズーム範囲', formatZoomRange(entry)],
      ['タイル数', entry.tile_count != null ? entry.tile_count.toLocaleString('ja-JP') : '－'],
      ['サイズ', formatBytes(entry.size_bytes)],
      ['clustered', entry.clustered == null ? '－' : entry.clustered ? 'true' : 'false']
    ];
    metaRows.forEach(([label, value]) => {
      const cell = document.createElement('div');
      cell.className = 'mjbmon-pmtiles-meta-cell';
      cell.innerHTML = `<div class="mjbmon-pmtiles-meta-label">${label}</div><div class="mjbmon-pmtiles-meta-value">${value}</div>`;
      grid.appendChild(cell);
    });
    card.appendChild(grid);

    if (entry.attribution) {
      const attr = document.createElement('div');
      attr.className = 'mjbmon-pmtiles-attr';
      attr.textContent = entry.attribution;
      card.appendChild(attr);
    }

    if (entry.location) {
      const loc = document.createElement('div');
      loc.className = 'mjbmon-pmtiles-note';
      loc.textContent = entry.location;
      card.appendChild(loc);
    }

    if (entry.note) {
      const note = document.createElement('div');
      note.className = 'mjbmon-pmtiles-note';
      note.textContent = entry.note;
      card.appendChild(note);
    }

    const actions = document.createElement('div');
    actions.className = 'mjbmon-pmtiles-actions';
    if (entry.viewer_url) {
      const link = document.createElement('a');
      link.className = 'mjbmon-pmtiles-link';
      link.href = entry.viewer_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '地図で見る ↗';
      actions.appendChild(link);
    } else {
      const disabled = document.createElement('span');
      disabled.className = 'mjbmon-pmtiles-link mjbmon-pmtiles-link-disabled';
      disabled.textContent = entry.status === 'not_yet_built' ? 'まだ生成されていません' : '公開URLなし(未公開)';
      actions.appendChild(disabled);
    }
    if (entry.tilejson_url) {
      const tj = document.createElement('a');
      tj.className = 'mjbmon-pmtiles-link mjbmon-pmtiles-link-secondary';
      tj.href = entry.tilejson_url;
      tj.target = '_blank';
      tj.rel = 'noopener noreferrer';
      tj.textContent = 'TileJSON';
      actions.appendChild(tj);
    }
    card.appendChild(actions);

    return card;
  }

  async function render(container) {
    container.innerHTML = '';

    let manifest;
    try {
      manifest = await fetch(config.PMTILES_MANIFEST_URL).then((response) => response.json());
    } catch (error) {
      container.textContent = 'pmtiles_manifest.jsonの取得に失敗しました。';
      return;
    }

    const caption = document.createElement('p');
    caption.className = 'mjbmon-caption';
    caption.textContent =
      'z0-7(Mapterhorn由来)+ z8+(自前GSI)の2つの構成要素と、それをpmtiles mergeで統合した最終成果物。手動更新のスナップショット。';
    container.appendChild(caption);

    const list = document.createElement('div');
    list.className = 'mjbmon-pmtiles-list';
    manifest.forEach((entry) => list.appendChild(renderCard(entry)));
    container.appendChild(list);
  }

  MJBMON.registerInstrument({
    key: 'pmtiles-manifest',
    name: '構成PMTiles',
    parentKey: 'root',
    order: 6,
    render
  });
})();
