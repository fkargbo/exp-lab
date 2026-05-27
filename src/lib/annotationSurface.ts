/**
 * Coordinate system for pin placement and rendering.
 * - Interaction capture: full viewport (fixed layer).
 * - Pin canvas: inside the scrollable annotation root so pins move with content.
 */

const ANNOTATION_ROOT_SELECTORS = [
  '[data-exp-lab-annotation-root]',
  'main[role="main"]',
  '.pf-v6-c-page__main',
  '.pf-v6-c-page__main-container',
];

const SCROLLABLE_CONTENT_SELECTORS = [
  '.ols-ai-hub-page',
  '.ols-observe-overview-page',
  '[data-exp-lab-annotation-root]',
];

const ANNOTATION_ROOT_EXPAND_SELECTORS = [
  '[data-exp-lab-annotation-boundary]',
  '.ols-ai-hub-page',
];

export type AnnotationRootRect = {
  pageLeft: number;
  pageTop: number;
  width: number;
  height: number;
};

function hasPositiveSize(el: HTMLElement): boolean {
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
}

function isScrollableY(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  const oy = style.overflowY;
  if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') {
    return false;
  }
  return el.scrollHeight > el.clientHeight + 1;
}

export function expandMarkedAnnotationRoot(marked: HTMLElement): HTMLElement {
  for (const selector of ANNOTATION_ROOT_EXPAND_SELECTORS) {
    const el = marked.closest<HTMLElement>(selector);
    if (el && hasPositiveSize(el)) {
      return el;
    }
  }

  const main = marked.closest<HTMLElement>('main[role="main"], main');
  if (main?.parentElement && hasPositiveSize(main.parentElement)) {
    return main.parentElement;
  }

  return marked;
}

/** Scrollport that moves with prototype content (pins mount inside this element). */
export function resolveScrollableAnnotationRoot(): HTMLElement {
  const marked = document.querySelector<HTMLElement>('[data-exp-lab-annotation-root]');
  if (marked && hasPositiveSize(marked)) {
    const expanded = expandMarkedAnnotationRoot(marked);
    if (isScrollableY(expanded)) {
      return expanded;
    }
    for (const selector of SCROLLABLE_CONTENT_SELECTORS) {
      const inner = expanded.querySelector<HTMLElement>(selector);
      if (inner && hasPositiveSize(inner) && isScrollableY(inner)) {
        return inner;
      }
    }
    return expanded;
  }

  for (const selector of SCROLLABLE_CONTENT_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && hasPositiveSize(el)) {
      return el;
    }
  }

  for (const selector of ANNOTATION_ROOT_SELECTORS) {
    if (selector === '[data-exp-lab-annotation-root]') {
      continue;
    }
    const el = document.querySelector<HTMLElement>(selector);
    if (el && hasPositiveSize(el)) {
      return el;
    }
  }

  return document.documentElement;
}

/** @deprecated Use resolveScrollableAnnotationRoot — kept for imports. */
export function resolveAnnotationRoot(): HTMLElement {
  return resolveScrollableAnnotationRoot();
}

/** Content size used for % ↔ pixel (must match pin layer box). */
export function getAnnotationContentSize(root: HTMLElement = resolveScrollableAnnotationRoot()): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(root.scrollWidth, root.clientWidth, 1),
    height: Math.max(root.scrollHeight, root.clientHeight, 1),
  };
}

export function getAnnotationRootMetrics(root: HTMLElement = resolveScrollableAnnotationRoot()): {
  width: number;
  height: number;
} {
  return getAnnotationContentSize(root);
}

export function getAnnotationRootPageRect(root: HTMLElement = resolveScrollableAnnotationRoot()): AnnotationRootRect {
  const { width, height } = getAnnotationContentSize(root);
  let pageLeft = 0;
  let pageTop = 0;
  let node: HTMLElement | null = root;
  while (node) {
    pageLeft += node.offsetLeft;
    pageTop += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { pageLeft, pageTop, width, height };
}

/** Pointer position in content coordinates (scroll-aware). */
export function pointerToRootLocal(
  clientX: number,
  clientY: number,
  root: HTMLElement = resolveScrollableAnnotationRoot(),
): { x: number; y: number } {
  const rect = root.getBoundingClientRect();
  return {
    x: clientX - rect.left + root.scrollLeft,
    y: clientY - rect.top + root.scrollTop,
  };
}

export function pointerToPercent(
  clientX: number,
  clientY: number,
  root: HTMLElement = resolveScrollableAnnotationRoot(),
): { x_pct: number; y_pct: number } {
  const { width, height } = getAnnotationContentSize(root);
  const { x, y } = pointerToRootLocal(clientX, clientY, root);
  return {
    x_pct: (x / width) * 100,
    y_pct: (y / height) * 100,
  };
}

export function pointerToViewportPercent(clientX: number, clientY: number): { x_pct: number; y_pct: number } {
  const w = Math.max(window.innerWidth, 1);
  const h = Math.max(window.innerHeight, 1);
  return {
    x_pct: (clientX / w) * 100,
    y_pct: (clientY / h) * 100,
  };
}

export function percentToRootLocal(
  x_pct: number,
  y_pct: number,
  root: HTMLElement = resolveScrollableAnnotationRoot(),
): { x: number; y: number } {
  const { width, height } = getAnnotationContentSize(root);
  return {
    x: (x_pct / 100) * width,
    y: (y_pct / 100) * height,
  };
}

const PIN_LAYER_ID = 'exp-lab-pin-root';
/** Viewport/chrome pins (masthead, sidebar) — must not live inside a scrolling content box. */
const CHROME_PIN_LAYER_ID = 'exp-lab-pin-root-chrome';
const INTERACTION_LAYER_ID = 'exp-lab-interaction-root';

export function syncInteractionLayerToViewport(): void {
  const el = document.getElementById(INTERACTION_LAYER_ID);
  if (!el) {
    return;
  }
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    boxSizing: 'border-box',
  });
}

function ensurePinLayerElement(): HTMLElement | null {
  let el = document.getElementById(PIN_LAYER_ID);
  if (el) {
    return el;
  }
  el = document.createElement('div');
  el.id = PIN_LAYER_ID;
  Object.assign(el.style, {
    pointerEvents: 'none',
    zIndex: '2147483646',
  });
  document.body.appendChild(el);
  return el;
}

function syncPinLayerToAnnotationRoot(root: HTMLElement = resolveScrollableAnnotationRoot()): void {
  const el = ensurePinLayerElement();
  if (!el) {
    return;
  }

  if (el.parentElement !== root) {
    root.appendChild(el);
  }

  const { width, height } = getAnnotationContentSize(root);
  Object.assign(el.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    boxSizing: 'border-box',
    overflow: 'visible',
  });
}

function ensureChromePinLayerElement(): HTMLElement | null {
  let el = document.getElementById(CHROME_PIN_LAYER_ID);
  if (el) {
    return el;
  }
  el = document.createElement('div');
  el.id = CHROME_PIN_LAYER_ID;
  Object.assign(el.style, {
    pointerEvents: 'none',
    zIndex: '2147483646',
  });
  document.body.appendChild(el);
  return el;
}

function syncChromePinLayer(): void {
  const el = ensureChromePinLayerElement();
  if (!el) {
    return;
  }
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    boxSizing: 'border-box',
    overflow: 'visible',
  });
}

export function syncAnnotationSurfaceLayers(root: HTMLElement = resolveScrollableAnnotationRoot()): void {
  syncInteractionLayerToViewport();
  syncChromePinLayer();
  syncPinLayerToAnnotationRoot(root);
}

let resizeObserver: ResizeObserver | null = null;
let observedRoot: HTMLElement | null = null;

export function subscribeAnnotationSurfaceSync(onSync?: () => void): void {
  const runSync = () => {
    syncAnnotationSurfaceLayers();
    onSync?.();
  };

  runSync();

  const onWindowChange = () => runSync();
  window.addEventListener('resize', onWindowChange);
  window.addEventListener('scroll', onWindowChange, true);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver?.disconnect();
    observedRoot = resolveScrollableAnnotationRoot();
    resizeObserver = new ResizeObserver(() => runSync());
    resizeObserver.observe(observedRoot);
    if (observedRoot !== document.documentElement) {
      resizeObserver.observe(document.documentElement);
    }
  }

  return () => {
    window.removeEventListener('resize', onWindowChange);
    window.removeEventListener('scroll', onWindowChange, true);
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedRoot = null;
  };
}

export function setPinLayerPlacementMode(placing: boolean): void {
  for (const id of [PIN_LAYER_ID, CHROME_PIN_LAYER_ID]) {
    const el = document.getElementById(id);
    el?.classList.toggle('exp-lab-pin-root--placing', placing);
  }
}
