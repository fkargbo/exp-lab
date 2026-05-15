/**
 * Stable id for the current prototype *page* (host + path + query + hash).
 * Includes `search` and `hash` so query-driven views and HashRouter each get their own pin scope.
 */
export function getProjectId(): string {
  const { hostname, pathname, search, hash } = window.location;
  const path = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return `${hostname}${path}${search}${hash}`;
}

/**
 * Subscribe to SPA navigations so `getProjectId()` can be re-read after client-side route changes
 * (History API does not fire `popstate` on pushState/replaceState).
 */
export function subscribeToLocationScope(callback: () => void): () => void {
  const notify = () => {
    queueMicrotask(callback);
  };

  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  history.pushState = (...args: Parameters<History['pushState']>) => {
    const r = origPush(...args);
    notify();
    return r;
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    const r = origReplace(...args);
    notify();
    return r;
  };

  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener('hashchange', notify);
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}

export function getCanonicalPrototypeUrl(): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}
