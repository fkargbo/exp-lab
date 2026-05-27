import type { FeedbackPinRecord } from '../types';

/**
 * Stable id for the current page — kept identical to the original formula so pins already
 * stored in Supabase / localStorage continue to load correctly.
 *   format: `hostname + normalizedPathname + search + hash`
 */
export function getProjectId(): string {
  const { hostname, pathname, search, hash } = window.location;
  const path = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return `${hostname}${path}${search}${hash}`;
}

/**
 * Host-agnostic page key stored on every new pin as `page_scope`.
 * Uses the raw pathname so it is consistent across dev / prod within the same environment.
 *   format: `pathname + search + hash`
 */
export function getPageScope(): string {
  const { pathname, search, hash } = window.location;
  const path = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return `${path}${search}${hash}`;
}

/** Whether a loaded pin belongs to the page currently visible in the browser. */
export function pinMatchesPageScope(pin: FeedbackPinRecord): boolean {
  const current = getPageScope();

  // Authoritative: explicit page_scope captured at placement time.
  if (pin.page_scope?.trim()) {
    return pin.page_scope.trim() === current;
  }

  // Fallback 1: prototype_url — full URL saved at submit time.
  if (pin.prototype_url) {
    try {
      const u = new URL(pin.prototype_url, window.location.origin);
      const sig = u.pathname + u.search + u.hash;
      const sigNorm = sig.endsWith('/') && sig.length > 1 ? sig.slice(0, -1) : sig;
      return sigNorm === current;
    } catch {
      /* fall through */
    }
  }

  // Fallback 2: project_id — strip the hostname prefix, compare path+query+hash.
  const pid = pin.project_id;
  const slash = pid.indexOf('/');
  if (slash >= 0) {
    const rest = pid.slice(slash);
    const restNorm = rest.endsWith('/') && rest.length > 1 ? rest.slice(0, -1) : rest;
    return restNorm === current;
  }

  return false;
}

/**
 * Subscribe to SPA navigations so `getProjectId()` / `getPageScope()` can be re-read
 * after client-side route changes (React Router's pushState doesn't fire popstate).
 * Combines History API hooks with a short poll to catch React Router internals that
 * may wrap the native history before our embed runs.
 */
export function subscribeToLocationScope(callback: () => void): () => void {
  let lastSig = getPageScope();

  const emitIfChanged = () => {
    const sig = getPageScope();
    if (sig === lastSig) return;
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

  // Poll every 250 ms as a safety net for routers that bypass our patches.
  const intervalId = window.setInterval(emitIfChanged, 250);

  return () => {
    window.removeEventListener('popstate', emitIfChanged);
    window.removeEventListener('hashchange', emitIfChanged);
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.clearInterval(intervalId);
  };
}

export function getCanonicalPrototypeUrl(): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

/**
 * PostgREST / Realtime `eq` filter value for columns that may contain `&`, `?`, `=`, etc.
 */
export function realtimeEqFilter(column: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${column}=eq."${escaped}"`;
}
