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
    name: '計器',
    description: 'mapterhorn-japan-bridge モニタの単体表示項目',
    creatable: false
  });

  registerFolder({ key: 'root', name: 'mapterhorn-japan-bridge モニタ' });

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
      openmct.on('start', () => {
        openmct.router.setPath(`/browse/${NAMESPACE}:root`);
      });
      openmct.start('#app');
    }
  };
})();
