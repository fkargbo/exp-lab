/**
 * Single coordinate system for pin placement, region highlights, and rendering.
 * Anchors to a stable content root so responsive layouts keep pins aligned across viewports.
 */

const ANNOTATION_ROOT_SELECTORS = [
  '[data-exp-lab-annotation-root]',
  'main[role="main"]',
  '.pf-v6-c-page__main',
  '.pf-v6-c-page__main-container',
];

export type AnnotationRootRect = {
  /** Page X of root origin (for positioning overlay layers). */
  pageLeft: number;
  pageTop: number;
  /** Size used for % ↔ pixel conversion (matches overlay box). */
  width: number;
  height: number;
};

export function resolveAnnotationRoot(): HTMLElement {
  for (const selector of ANNOTATION_ROOT_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      continue;
    }
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) {
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

const LAYER_IDS = ['exp-lab-pin-root', 'exp-lab-interaction-root'] as const;

/** Position/size portal layers to match the annotation root exactly. */
export function syncAnnotationSurfaceLayers(root: HTMLElement = resolveAnnotationRoot()): void {
  const { pageLeft, pageTop, width, height } = getAnnotationRootPageRect(root);
  for (const id of LAYER_IDS) {
    const el = document.getElementById(id);
    if (!el) {
      continue;
    }
    Object.assign(el.style, {
      position: 'absolute',
      left: `${pageLeft}px`,
      top: `${pageTop}px`,
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: 'border-box',
    });
  }
}

let resizeObserver: ResizeObserver | null = null;
let observedRoot: HTMLElement | null = null;

/** Keep overlay aligned when the root or viewport changes size. */
export function subscribeAnnotationSurfaceSync(onSync?: () => void): () => void {
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
