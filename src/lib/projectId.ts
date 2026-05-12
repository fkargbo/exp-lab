/** Stable id for the current prototype URL (host + path, no query/hash). */
export function getProjectId(): string {
  const { hostname, pathname } = window.location;
  const path = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return `${hostname}${path}`;
}

export function getCanonicalPrototypeUrl(): string {
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}
