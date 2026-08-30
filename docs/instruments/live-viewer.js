(function () {
  const VIEWER_URL = 'https://hfu.github.io/mapterhorn-japan-bridge/';

  // Embeds the actual public viewer -- the most direct way to visually
  // re-check whether the coastal checkerboard (D74-D78) and the z0-7 ocean
  // holes (D77) are still present after each rebuild, right next to the
  // progress/ETA/status instruments instead of switching tabs. GitHub Pages
  // sends no X-Frame-Options/frame-ancestors CSP (confirmed via curl -I,
  // 2026-08-31), so a plain iframe embeds it without extra work.
  async function render(container) {
    container.innerHTML = '';
    container.style.padding = '0';

    const caption = document.createElement('p');
    caption.className = 'mjbmon-caption';
    caption.style.padding = '12px 16px 0';
    caption.innerHTML = `本番ビューア(<a href="${VIEWER_URL}" target="_blank" rel="noopener noreferrer">${VIEWER_URL}</a>)を直接埋め込み。最終pmtiles mergeとstars反映のたびにここで目視確認する。`;
    container.appendChild(caption);

    const iframe = document.createElement('iframe');
    iframe.src = VIEWER_URL;
    iframe.style.flex = '1';
    iframe.style.width = '100%';
    iframe.style.minHeight = '0';
    iframe.style.border = '0';
    iframe.style.marginTop = '10px';
    container.appendChild(iframe);
  }

  MJBMON.registerInstrument({
    key: 'live-viewer',
    name: '本番ビューア(視覚確認)',
    parentKey: 'root',
    autoRefresh: false,
    order: 5,
    render
  });
})();
