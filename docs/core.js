window.MJBMON = (function () {
  if (!window.openmct) {
    throw new Error('Open MCT failed to load');
  }

  const openmct = window.openmct;
  const NAMESPACE = 'mjbmon';
  const REFRESH_INTERVAL_MS = 60 * 1000;

  const objectsByKey = new Map();
  const childrenByKey = new Map();
  let autoOrder = 0;

  // Cycle mode: kiosk-style auto-advance through root's instruments, in
  // display order, for unattended viewing (e.g. a wall display). A manual
  // click in the browse tree while cycling is treated as the user taking
  // over, so it stops rather than yanking them back a few seconds later.
  const CYCLE_INTERVAL_MS = 20 * 1000;
  let cycleTimer = null;
  let cycleIndex = 0;
  let cycleButtonEl = null;

  function rootChildKeys() {
    return (childrenByKey.get('root') || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((child) => child.identifier.key);
  }

  function updateCycleButton() {
    if (!cycleButtonEl) {
      return;
    }
    cycleButtonEl.textContent = cycleTimer ? '⏸ Cycling' : '▶ Cycle';
    cycleButtonEl.classList.toggle('mjbmon-cycle-active', !!cycleTimer);
  }

  // Browser Fullscreen API only removes the browser's OWN chrome (tabs,
  // address bar) -- Open MCT's own header/tree/inspector panel stay put
  // regardless. Confirmed against sas0's own DOM inspection (same Espresso
  // theme, same Open MCT version): these class names hide that chrome.
  // Open MCT has no built-in kiosk/fullscreen view of its own.
  const CHROME_HIDDEN_CLASS = 'mjbmon-cycle-chrome-hidden';

  function stopCycleMode() {
    if (cycleTimer) {
      clearInterval(cycleTimer);
      cycleTimer = null;
      updateCycleButton();
    }
    document.body.classList.remove(CHROME_HIDDEN_CLASS);
    // Exiting fullscreen when cycle mode wasn't the thing that entered it
    // (e.g. the user pressed Esc, which also lands here via the
    // fullscreenchange listener below) is a harmless no-op -- the
    // Fullscreen API rejects/ignores a redundant exit request.
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function startCycleMode() {
    const keys = rootChildKeys();
    if (keys.length === 0) {
      return;
    }
    // Kiosk-style cycling implies a wall display -- fullscreen removes the
    // browser chrome so only the instrument content is visible. Requesting
    // it here relies on the click that triggered toggleCycleMode() as the
    // user gesture the Fullscreen API requires; the request is fire-and-
    // forget (some browsers/embeds refuse it) so cycling still proceeds
    // even if fullscreen itself is denied.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    document.body.classList.add(CHROME_HIDDEN_CLASS);
    cycleIndex = 0;
    openmct.router.setPath(`/browse/${NAMESPACE}:${keys[cycleIndex]}`);
    cycleTimer = setInterval(() => {
      cycleIndex = (cycleIndex + 1) % keys.length;
      openmct.router.setPath(`/browse/${NAMESPACE}:${keys[cycleIndex]}`);
    }, CYCLE_INTERVAL_MS);
    updateCycleButton();
  }

  function toggleCycleMode() {
    if (cycleTimer) {
      stopCycleMode();
    } else {
      startCycleMode();
    }
  }

  function installCycleModeControl() {
    const button = document.createElement('button');
    button.id = 'mjbmon-cycle-toggle';
    button.type = 'button';
    button.textContent = '▶ Cycle';
    button.title = `Auto-advance through every instrument every ${CYCLE_INTERVAL_MS / 1000}s`;
    button.addEventListener('click', toggleCycleMode);
    document.body.appendChild(button);
    cycleButtonEl = button;

    // Best-effort takeover detection: any click inside Open MCT's browse
    // tree while cycling means the user picked something themselves.
    document.addEventListener('click', (event) => {
      if (cycleTimer && event.target.closest('.c-tree, .l-shell__tree')) {
        stopCycleMode();
      }
    });

    // Esc (or any other exit) leaves fullscreen without going through our
    // own stopCycleMode() -- without this, the timer would keep advancing
    // the (now-windowed) page and the button would still say "Cycling".
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && cycleTimer) {
        stopCycleMode();
      }
    });
  }

  function ensureChildBucket(key) {
    if (!childrenByKey.has(key)) {
      childrenByKey.set(key, []);
    }
    return childrenByKey.get(key);
  }

  function pushChild(parentKey, identifier, order) {
    ensureChildBucket(parentKey).push({ identifier, order: order != null ? order : ++autoOrder });
  }

  function registerFolder({ key, name, parentKey, order }) {
    const identifier = { namespace: NAMESPACE, key };
    objectsByKey.set(key, { identifier, name, type: 'folder' });
    ensureChildBucket(key);
    if (parentKey) {
      pushChild(parentKey, identifier, order);
    }
    return key;
  }

  function startAutoRefresh(container, render) {
    let cancelled = false;
    const tick = () => {
      if (cancelled) {
        return;
      }
      Promise.resolve(render(container)).catch((error) => {
        console.error('[mjbmon] instrument render failed', error);
      });
    };

    tick();
    const timer = setInterval(tick, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }

  function registerInstrument({ key, name, parentKey, render, autoRefresh = true, order }) {
    const identifier = { namespace: NAMESPACE, key };
    objectsByKey.set(key, { identifier, name, type: 'mjbmon.instrument' });
    if (parentKey) {
      pushChild(parentKey, identifier, order);
    }

    openmct.objectViews.addProvider({
      key: `mjbmon.view.${key}`,
      name,
      canView(domainObject) {
        return (
          domainObject.identifier.namespace === NAMESPACE && domainObject.identifier.key === key
        );
      },
      view() {
        let root;
        let stopRefresh;
        let cleanup;

        return {
          show(element) {
            root = document.createElement('div');
            root.className = 'mjbmon-instrument';
            element.appendChild(root);

            if (autoRefresh) {
              stopRefresh = startAutoRefresh(root, render);
            } else {
              Promise.resolve(render(root))
                .then((result) => {
                  if (typeof result === 'function') {
                    cleanup = result;
                  }
                })
                .catch((error) => console.error('[mjbmon] instrument render failed', error));
            }
          },
          destroy() {
            if (stopRefresh) {
              stopRefresh();
            }
            if (typeof cleanup === 'function') {
              try {
                cleanup();
              } catch (error) {
                // best-effort teardown
              }
            }
            if (root && root.parentNode) {
              root.parentNode.removeChild(root);
            }
          }
        };
      }
    });
  }

  const openmctScript = document.querySelector('script[src*="openmct"]');
  if (openmctScript) {
    openmct.setAssetPath(openmctScript.src.replace(/openmct\.js(?:\?.*)?$/, ''));
  }
  openmct.install(openmct.plugins.LocalStorage());
  openmct.install(openmct.plugins.UTCTimeSystem());
  openmct.install(openmct.plugins.Espresso());

  openmct.types.addType('mjbmon.instrument', {
    name: 'Instrument',
    description: 'A single display item in the mapterhorn-japan-bridge monitor',
    creatable: false
  });

  registerFolder({ key: 'root', name: 'mapterhorn-japan-bridge Monitor' });

  openmct.objects.addRoot({ namespace: NAMESPACE, key: 'root' });
  openmct.objects.addProvider(NAMESPACE, {
    get(identifier) {
      const domainObject = objectsByKey.get(identifier.key);
      return domainObject ? Promise.resolve(domainObject) : Promise.reject(new Error('Unknown object'));
    }
  });
  openmct.composition.addProvider({
    appliesTo(domainObject) {
      return (
        domainObject.identifier.namespace === NAMESPACE && childrenByKey.has(domainObject.identifier.key)
      );
    },
    load(domainObject) {
      const children = childrenByKey.get(domainObject.identifier.key) || [];
      return Promise.resolve(
        children
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((child) => child.identifier)
      );
    }
  });

  return {
    registerFolder,
    registerInstrument,
    start() {
      // openmct.on('start', ...) never actually fires in this rc1 build --
      // the listener registers (shows up in openmct's internal event
      // registry) but is never emitted, discovered while debugging why
      // installCycleModeControl() never ran (mapterhorn-japan-bridge
      // DECISIONS.md D88). Open MCT happens to default-navigate to the
      // registered root on its own, which is why the app looked fine
      // despite the explicit setPath below it also silently never running.
      // Calling both directly after start() -- document.body always exists
      // by the time an in-<body> <script> executes, so no readiness wait
      // is needed for the DOM append; setPath is harmless/redundant with
      // Open MCT's own default but kept for explicitness.
      openmct.start('#app');
      openmct.router.setPath(`/browse/${NAMESPACE}:root`);
      installCycleModeControl();
    }
  };
})();
