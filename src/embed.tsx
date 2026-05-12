import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import cssText from './feedback-layer.css?inline';

const HOST_ID = 'exp-lab-feedback-host';

function syncLayerDimensions() {
  const h = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    document.documentElement.clientHeight,
  );
  for (const id of ['exp-lab-interaction-root', 'exp-lab-pin-root']) {
    const el = document.getElementById(id);
    if (el) {
      el.style.height = `${h}px`;
    }
  }
}

function ensurePageLayers() {
  syncLayerDimensions();

  let interaction = document.getElementById('exp-lab-interaction-root');
  if (!interaction) {
    interaction = document.createElement('div');
    interaction.id = 'exp-lab-interaction-root';
    Object.assign(interaction.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      pointerEvents: 'none',
      /* Below shadow host + pin markers; surface child uses pointer-events auto when active. */
      zIndex: '2147483644',
    });
    document.body.appendChild(interaction);
  }

  let pins = document.getElementById('exp-lab-pin-root');
  if (!pins) {
    pins = document.createElement('div');
    pins.id = 'exp-lab-pin-root';
    Object.assign(pins.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      pointerEvents: 'none',
      /* Above shadow UI host so pin/region markers are visible in comment mode */
      zIndex: '2147483646',
    });
    document.body.appendChild(pins);
  }

  syncLayerDimensions();
}

export function mountExpLabFeedbackLayer(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(HOST_ID)) {
    return;
  }

  /* Portal layers live in the light DOM — duplicate stylesheet so pins/interaction match shadow UI. */
  if (!document.getElementById('exp-lab-portal-styles')) {
    const portalCss = document.createElement('style');
    portalCss.id = 'exp-lab-portal-styles';
    portalCss.textContent = cssText;
    document.head.appendChild(portalCss);
  }

  ensurePageLayers();

  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    /* Below pin layer so saved feedback markers paint on top during comment mode */
    zIndex: '2147483645',
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = cssText;
  shadow.appendChild(styleEl);

  const mount = document.createElement('div');
  mount.className = 'exp-lab-ui';
  shadow.appendChild(mount);

  const root = createRoot(mount);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

mountExpLabFeedbackLayer();
