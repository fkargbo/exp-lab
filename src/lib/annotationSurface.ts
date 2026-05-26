/**
 * Single coordinate system for pin placement, region highlights, and rendering.
 * Interaction capture uses the visible viewport; pins anchor to an expanded page root.
 */

const ANNOTATION_ROOT_SELECTORS = [
  '[data-exp-lab-annotation-root]',
  'main[role="main"]',
  '.pf-v6-c-page__main',
  '.pf-v6-c-page__main-container',
];

/** Host page wrappers that should include headers/siblings outside a narrow inner column. */
const ANNOTATION_ROOT_EXPAND_SELECTORS = [
  '[data-exp-lab-annotation-boundary]',
  '.ols-ai-hub-page',
];

export type AnnotationRootRect = {
  /** Page X of root origin (for positioning overlay layers). */
  pageLeft: number;
  pageTop: number;
  /** Size used for % ↔ pixel conversion (matches overlay box). */
  width: number;
  height: number;
};

function hasPositiveSize(el: HTMLElement): boolean {
  const { width, height } = el.getBoundingClientRect();
  return width > 0 && height > 0;
}

/** Prefer a page-level wrapper so header + main share one coordinate system. */
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

export function resolveAnnotationRoot(): HTMLElement {
  const marked = document.querySelector<HTMLElement>('[data-exp-lab-annotation-root]');
  if (marked && hasPositiveSize(marked)) {
    return expandMarkedAnnotationRoot(marked);
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

/** Metrics for converting between pointer position and stored percentages. */
export function getAnnotationRootMetrics(root: HTMLElement = resolveAnnotationRoot()): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(root.scrollWidth, root.clientWidth, 1),
    height: Math.max(root.scrollHeight, root.clientHeight, 1),
  };
}

/** Root box in page coordinates — overlay layers align to this rect. */
export function getAnnotationRootPageRect(root: HTMLElement = resolveAnnotationRoot()): AnnotationRootRect {
  const rect = root.getBoundingClientRect();
  const { width, height } = getAnnotationRootMetrics(root);
  return {
    pageLeft: rect.left + window.scrollX,
    pageTop: rect.top + window.scrollY,
    width,
    height,
  };
}

/** Pointer position relative to the annotation root (layer-local pixels). */
export function pointerToRootLocal(clientX: number, clientY: number, root: HTMLElement = resolveAnnotationRoot()): {
  x: number;
  y: number;
} {
  const rect = root.getBoundingClientRect();
  return {
    x: clientX - rect.left + root.scrollLeft,
    y: clientY - rect.top + root.scrollTop,
  };
}

export function pointerToPercent(
  clientX: number,
  clientY: number,
  root: HTMLElement = resolveAnnotationRoot(),
): { x_pct: number; y_pct: number } {
  const { width, height } = getAnnotationRootMetrics(root);
  const { x, y } = pointerToRootLocal(clientX, clientY, root);
  return {
    x_pct: (x / width) * 100,
    y_pct: (y / height) * 100,
  };
}

export function percentToRootLocal(
  x_pct: number,
  y_pct: number,
  root: HTMLElement = resolveAnnotationRoot(),
): { x: number; y: number } {
  const { width, height } = getAnnotationRootMetrics(root);
  return {
    x: (x_pct / 100) * width,
    y: (y_pct / 100) * height,
  };
}

const PIN_LAYER_ID = 'exp-lab-pin-root';
const INTERACTION_LAYER_ID = 'exp-lab-interaction-root';

/** Full-viewport hit target so every visible pixel accepts pin placement. */
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

function syncPinLayerToAnnotationRoot(root: HTMLElement = resolveAnnotationRoot()): void {
  const el = document.getElementById(PIN_LAYER_ID);
  if (!el) {
    return;
  }
  const { pageLeft, pageTop, width, height } = getAnnotationRootPageRect(root);
  Object.assign(el.style, {
    position: 'absolute',
    left: `${pageLeft}px`,
    top: `${pageTop}px`,
    width: `${width}px`,
    height: `${height}px`,
    boxSizing: 'border-box',
  });
}

/** Position portal layers: viewport capture + annotation-root pin canvas. */
export function syncAnnotationSurfaceLayers(root: HTMLElement = resolveAnnotationRoot()): void {
  syncInteractionLayerToViewport();
  syncPinLayerToAnnotationRoot(root);
}

let resizeObserver: ResizeObserver | null = null;
let observedRoot: HTMLElement | null = null;

/** Keep overlay aligned when the root or viewport changes size. */
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
    observedRoot = resolveAnnotationRoot();
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
  const el = document.getElementById(PIN_LAYER_ID);
  if (!el) {
    return;
  }
  el.classList.toggle('exp-lab-pin-root--placing', placing);
}
