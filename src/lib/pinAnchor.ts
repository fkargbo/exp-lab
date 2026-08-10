import type { FeedbackPinRecord } from '../types';
import {
  expandMarkedAnnotationRoot,
  getAnnotationContentSize,
  resolveScrollableAnnotationRoot,
} from './annotationSurface';
import { pinMatchesPageScope } from './projectId';

const EXP_LAB_LAYER_IDS = new Set([
  'exp-lab-feedback-host',
  'exp-lab-interaction-root',
  'exp-lab-pin-root',
  'exp-lab-pin-root-chrome',
  'exp-lab-portal-styles',
]);

export type PinCoordinateSpace = 'content' | 'viewport';

export type PinPlacement = {
  coordinate_space: PinCoordinateSpace;
  x_pct: number;
  y_pct: number;
  w_pct?: number;
  h_pct?: number;
  anchor_selector?: string | null;
  anchor_x_pct?: number | null;
  anchor_y_pct?: number | null;
};

export type PinDisplayLayout = {
  position: 'absolute' | 'fixed';
  marker: { left: string; top: string };
  region?: { left: string; top: string; width: string; height: string };
};

function isExpLabChromeElement(el: Element): boolean {
  if (el instanceof HTMLElement) {
    if (EXP_LAB_LAYER_IDS.has(el.id)) {
      return true;
    }
    if (
      el.closest(
        '#exp-lab-feedback-host, #exp-lab-interaction-root, #exp-lab-pin-root, #exp-lab-pin-root-chrome',
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Build a stable selector for an element (prefer id, else short path with nth-of-type). */
export function buildAnchorSelector(target: Element): string | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  if (isExpLabChromeElement(target)) {
    return null;
  }

  const segments: string[] = [];
  let node: HTMLElement | null = target;
  let depth = 0;

  while (node && node !== document.body && depth < 8) {
    if (node.id) {
      segments.unshift(`#${CSS.escape(node.id)}`);
      break;
    }

    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
    const index = siblings.indexOf(node) + 1;
    segments.unshift(`${tag}:nth-of-type(${index})`);
    node = parent;
    depth += 1;
  }

  const selector = segments.join(' > ');
  if (!selector) {
    return null;
  }

  try {
    const match = document.querySelector(selector);
    return match === target ? selector : null;
  } catch {
    return null;
  }
}

function targetElementAt(clientX: number, clientY: number): Element | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!isExpLabChromeElement(el)) {
      return el;
    }
  }
  return null;
}

export function captureElementAnchor(
  clientX: number,
  clientY: number,
): Pick<PinPlacement, 'anchor_selector' | 'anchor_x_pct' | 'anchor_y_pct'> {
  const target = targetElementAt(clientX, clientY);
  if (!(target instanceof HTMLElement)) {
    return { anchor_selector: null, anchor_x_pct: null, anchor_y_pct: null };
  }

  const rect = target.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    return { anchor_selector: null, anchor_x_pct: null, anchor_y_pct: null };
  }

  const selector = buildAnchorSelector(target);
  if (!selector) {
    return { anchor_selector: null, anchor_x_pct: null, anchor_y_pct: null };
  }

  const anchor_x_pct = ((clientX - rect.left) / rect.width) * 100;
  const anchor_y_pct = ((clientY - rect.top) / rect.height) * 100;

  return {
    anchor_selector: selector,
    anchor_x_pct: Math.min(100, Math.max(0, anchor_x_pct)),
    anchor_y_pct: Math.min(100, Math.max(0, anchor_y_pct)),
  };
}

export function isPointerInContentRoot(
  clientX: number,
  clientY: number,
  root: HTMLElement = resolveScrollableAnnotationRoot(),
): boolean {
  const rect = root.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/** Pins on masthead/sidebar/chrome render in the body-mounted layer, not the scroll content box. */
export function pinUsesChromeLayer(pin: FeedbackPinRecord): boolean {
  if (pin.coordinate_space === 'viewport') {
    return true;
  }
  if (!pin.anchor_selector || pin.anchor_x_pct == null || pin.anchor_y_pct == null) {
    return false;
  }
  const root = resolveScrollableAnnotationRoot();
  try {
    const el = document.querySelector(pin.anchor_selector);
    if (el instanceof HTMLElement && !root.contains(el)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Resolve pin display — prefers element anchor, then content/viewport %. */
export function resolvePinMarkerLayout(
  pin: FeedbackPinRecord,
  root: HTMLElement = resolveScrollableAnnotationRoot(),
): PinDisplayLayout | null {
  if (!pinMatchesPageScope(pin)) {
    return null;
  }
  const space: PinCoordinateSpace = pin.coordinate_space ?? 'content';

  if (pin.anchor_selector && pin.anchor_x_pct != null && pin.anchor_y_pct != null) {
    const anchored = resolveAnchoredDisplay(pin, root);
    if (anchored) {
      return anchored;
    }
  }

  if (space === 'viewport') {
    return resolveViewportPercentDisplay(pin);
  }

  return resolveContentPercentDisplay(pin);
}

function resolveAnchoredDisplay(pin: FeedbackPinRecord, root: HTMLElement): PinDisplayLayout | null {
  if (!pin.anchor_selector || pin.anchor_x_pct == null || pin.anchor_y_pct == null) {
    return null;
  }

  let el: Element | null = null;
  try {
    el = document.querySelector(pin.anchor_selector);
  } catch {
    return null;
  }

  if (!(el instanceof HTMLElement)) {
    return null;
  }

  const space: PinCoordinateSpace = pin.coordinate_space ?? 'content';
  const marked = document.querySelector<HTMLElement>('[data-exp-lab-annotation-root]');
  if (marked) {
    const pageRoot = expandMarkedAnnotationRoot(marked);
    if (space === 'content' && !pageRoot.contains(el)) {
      return null;
    }
  }

  const elRect = el.getBoundingClientRect();
  if (elRect.width < 1 || elRect.height < 1) {
    return null;
  }
  const useViewport = space === 'viewport' || !root.contains(el);
  const offsetX = (pin.anchor_x_pct / 100) * elRect.width;
  const offsetY = (pin.anchor_y_pct / 100) * elRect.height;

  if (useViewport) {
    const markerX = elRect.left + offsetX;
    const markerY = elRect.top + offsetY;

    if (pin.kind === 'region' && pin.w_pct != null && pin.h_pct != null) {
      const regionW = (pin.w_pct / 100) * window.innerWidth;
      const regionH = (pin.h_pct / 100) * window.innerHeight;
      const regionLeft = markerX - regionW / 2;
      const regionTop = markerY - regionH / 2;
      return {
        position: 'absolute',
        marker: { left: `${markerX}px`, top: `${markerY}px` },
        region: {
          left: `${regionLeft}px`,
          top: `${regionTop}px`,
          width: `${regionW}px`,
          height: `${regionH}px`,
        },
      };
    }

    return {
      position: 'absolute',
      marker: { left: `${markerX}px`, top: `${markerY}px` },
    };
  }

  const rootRect = root.getBoundingClientRect();
  const contentX = elRect.left - rootRect.left + root.scrollLeft + offsetX;
  const contentY = elRect.top - rootRect.top + root.scrollTop + offsetY;

  if (pin.kind === 'region' && pin.w_pct != null && pin.h_pct != null) {
    const { width: rootW, height: rootH } = getAnnotationContentSize(root);
    const regionW = (pin.w_pct / 100) * rootW;
    const regionH = (pin.h_pct / 100) * rootH;
    const regionLeft = contentX - regionW / 2;
    const regionTop = contentY - regionH / 2;
    return {
      position: 'absolute',
      marker: { left: `${contentX}px`, top: `${contentY}px` },
      region: {
        left: `${regionLeft}px`,
        top: `${regionTop}px`,
        width: `${regionW}px`,
        height: `${regionH}px`,
      },
    };
  }

  return {
    position: 'absolute',
    marker: { left: `${contentX}px`, top: `${contentY}px` },
  };
}

function resolveContentPercentDisplay(pin: FeedbackPinRecord): PinDisplayLayout {
  if (pin.kind === 'region' && pin.w_pct != null && pin.h_pct != null) {
    return {
      position: 'absolute',
      marker: {
        left: `${pin.x_pct + pin.w_pct / 2}%`,
        top: `${pin.y_pct + pin.h_pct / 2}%`,
      },
      region: {
        left: `${pin.x_pct}%`,
        top: `${pin.y_pct}%`,
        width: `${pin.w_pct}%`,
        height: `${pin.h_pct}%`,
      },
    };
  }

  return {
    position: 'absolute',
    marker: { left: `${pin.x_pct}%`, top: `${pin.y_pct}%` },
  };
}

function resolveViewportPercentDisplay(pin: FeedbackPinRecord): PinDisplayLayout {
  if (pin.kind === 'region' && pin.w_pct != null && pin.h_pct != null) {
    const centerX = pin.x_pct + pin.w_pct / 2;
    const centerY = pin.y_pct + pin.h_pct / 2;
    return {
      position: 'absolute',
      marker: { left: `${centerX}vw`, top: `${centerY}vh` },
      region: {
        left: `calc(${centerX}vw - ${pin.w_pct / 2}vw)`,
        top: `calc(${centerY}vh - ${pin.h_pct / 2}vh)`,
        width: `${pin.w_pct}vw`,
        height: `${pin.h_pct}vh`,
      },
    };
  }

  return {
    position: 'absolute',
    marker: { left: `${pin.x_pct}vw`, top: `${pin.y_pct}vh` },
  };
}
