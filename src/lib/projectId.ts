import type { FeedbackPinRecord } from '../types';

/**
 * GitHub Pages / webpack basename (e.g. `/ux-prototypes`), aligned with the host app's router.
 */
export function getGithubPagesBasenameNoSlash(): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const href = document.querySelector('base')?.getAttribute('href') || '';
  try {
    const u = new URL(href, window.location.origin);
    const p = (u.pathname || '').replace(/\/+$/, '');
    if (p && p !== '/') {
      return p.startsWith('/') ? p : `/${p}`;
    }
  } catch {
    /* ignore */
  }
  if (window.location.hostname.endsWith('.github.io')) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 1) {
      return `/${parts[0]}`;
    }
  }
  return '';
}

/** React Router pathname (basename stripped). */
export function getRouterPathname(): string {
  let p = window.location.pathname;
  const base = getGithubPagesBasenameNoSlash();
  if (base && p.startsWith(base)) {
    p = p.slice(base.length) || '/';
  }
  if (p.length > 1 && p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  return p || '/';
}

function normalizePathOnly(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path || '/';
}

function stripBasenameFromPathname(pathname: string): string {
  const base = getGithubPagesBasenameNoSlash();
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || '/';
  }
  return pathname || '/';
}

/** Host-agnostic page key: router path + query + hash. */
export function getPageScopeSignature(): string {
  return `${getRouterPathname()}${window.location.search}${window.location.hash}`;
}

function pageSignatureFromPathname(pathname: string, search: string, hash: string): string {
  return `${normalizePathOnly(stripBasenameFromPathname(pathname))}${search}${hash}`;
}

function scopeSignatureFromProjectId(projectId: string): string | null {
  if (projectId.startsWith('http://') || projectId.startsWith('https://')) {
    try {
      const u = new URL(projectId);
      return pageSignatureFromPathname(u.pathname, u.search, u.hash);
    } catch {
      return null;
    }
  }
  const slash = projectId.indexOf('/');
  if (slash < 0) {
    return null;
  }
  const rest = projectId.slice(slash);
  const q = rest.indexOf('?');
  const h = rest.indexOf('#');
  let pathEnd = rest.length;
  if (q >= 0) {
    pathEnd = Math.min(pathEnd, q);
  }
  if (h >= 0) {
    pathEnd = Math.min(pathEnd, h);
  }
  const path = rest.slice(0, pathEnd);
  const search = q >= 0 ? rest.slice(q, h >= 0 && h > q ? h : undefined) : '';
  const hash = h >= 0 ? rest.slice(h) : '';
  return pageSignatureFromPathname(path, search, hash);
}

/**
 * All `project_id` values for the current page (primary + legacy encodings for migration).
 */
export function getPageScopeProjectIds(): string[] {
  const { hostname, pathname, search, hash } = window.location;
  const pathNorm = normalizePathOnly(pathname);
  const routerPath = getRouterPathname();

  const primary = `${window.location.origin}${routerPath}${search}${hash}`;
  const legacyHostname = `${hostname}${pathNorm}${search}${hash}`;
  const legacyOriginFull = `${window.location.origin}${pathNorm}${search}${hash}`;

  return [...new Set([primary, legacyHostname, legacyOriginFull].filter(Boolean))];
}

/**
 * Stable id for the current prototype *page* (origin + router path + query + hash).
 */
export function getProjectId(): string {
  return getPageScopeProjectIds()[0]!;
}

/** Derive the page scope recorded on a pin (explicit field, URL, or legacy project_id). */
export function pinPageScopeKey(pin: FeedbackPinRecord): string | null {
  if (pin.page_scope?.trim()) {
    return pin.page_scope.trim();
  }
  if (pin.prototype_url) {
    try {
      const u = new URL(pin.prototype_url, window.location.origin);
      return pageSignatureFromPathname(u.pathname, u.search, u.hash);
    } catch {
      /* fall through */
    }
  }
  if (pin.project_id) {
    return scopeSignatureFromProjectId(pin.project_id);
  }
  return null;
}

/** Whether a pin belongs on the page currently shown in the browser. */
export function pinMatchesPageScope(pin: FeedbackPinRecord): boolean {
  const current = getPageScopeSignature();
  const pinScope = pinPageScopeKey(pin);
  if (pinScope) {
    return pinScope === current;
  }
  return getPageScopeProjectIds().includes(pin.project_id);
}

/**
 * Subscribe to SPA navigations so `getProjectId()` can be re-read after client-side route changes.
 * Uses History API hooks plus a short poll (React Router lives outside the embed tree).
 */
export function subscribeToLocationScope(callback: () => void): () => void {
  let lastSig = getPageScopeSignature();

  const emitIfChanged = () => {
    const sig = getPageScopeSignature();
    if (sig === lastSig) {
      return;
    }
    lastSig = sig;
    queueMicrotask(callback);
  };

  window.addEventListener('popstate', emitIfChanged);
  window.addEventListener('hashchange', emitIfChanged);

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  history.pushState = (...args: Parameters<History['pushState']>) => {
    const r = origPush(...args);
    emitIfChanged();
    return r;
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    const r = origReplace(...args);
    emitIfChanged();
    return r;
  };

  const intervalId = window.setInterval(emitIfChanged, 200);

  return () => {
    window.removeEventListener('popstate', emitIfChanged);
    window.removeEventListener('hashchange', emitIfChanged);
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.clearInterval(intervalId);
  };
}

export function getCanonicalPrototypeUrl(): string {
  return `${window.location.origin}${getRouterPathname()}${window.location.search}${window.location.hash}`;
}

/**
 * PostgREST / Realtime `eq` filter value for columns that may contain `&`, `?`, `=`, etc.
 * (e.g. `project_id` includes query string + hash).
 */
export function realtimeEqFilter(column: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${column}=eq."${escaped}"`;
}
