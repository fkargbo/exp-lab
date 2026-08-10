/**
 * URL Supabase may redirect to after OAuth (fragment is added by Supabase on return — omit `#` here).
 *
 * When `VITE_OAUTH_REDIRECT_ORIGIN` is set at build (e.g. `https://fkargbo.github.io` from GitHub Actions),
 * we resolve `pathname + search` against it so the return URL always matches GitHub Pages even if the
 * browser origin were ever ambiguous. The value must still appear under Supabase → Authentication →
 * URL Configuration → Redirect URLs (e.g. `https://<owner>.github.io/<repo>/**`).
 *
 * NOTE: On GitHub Pages, the SPA 404.html redirect script re-encodes `&` as `~and~` in a single
 * string, which can corrupt query params appended by Supabase's PKCE callback (e.g. `?code=XXXX`).
 * To guard against losing the `?prototype=` param across the round-trip, callers should use
 * `saveReturnSearchBeforeOAuth()` before redirecting and `restoreReturnSearchAfterOAuth()` after
 * the session is established.
 */
export function getOAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return '';
  // Use pathname ONLY — no query params. Supabase's redirect URL allowlist uses glob patterns
  // that match paths but not query strings (e.g. `http://localhost:3000/**` won't match
  // `?prototype=...`). Including query params causes Supabase to reject the redirect URL and
  // fall back to its Site URL, landing the user on the wrong prototype.
  // The ?prototype= param is preserved separately via saveReturnSearchBeforeOAuth().
  const pathnameOnly = window.location.pathname;
  const originBase = import.meta.env.VITE_OAUTH_REDIRECT_ORIGIN?.trim();
  if (originBase) {
    try {
      const base = originBase.endsWith('/') ? originBase : `${originBase}/`;
      return new URL(pathnameOnly, base).href;
    } catch {
      // fall through
    }
  }
  return `${window.location.origin}${pathnameOnly}`;
}

const OAUTH_RETURN_SEARCH_KEY = 'exp-lab-oauth-return-search';

/**
 * Persist the current `window.location.search` (including `?prototype=`) to `sessionStorage`
 * immediately before triggering an OAuth redirect. `sessionStorage` survives the full-page
 * navigation away to GitHub and back, so the prototype param can be restored if Supabase or
 * the GitHub Pages 404-redirect script corrupts or drops the query string.
 */
export function saveReturnSearchBeforeOAuth(): void {
  if (typeof window === 'undefined') return;
  const search = window.location.search;
  if (search && search !== '?') {
    sessionStorage.setItem(OAUTH_RETURN_SEARCH_KEY, search);
  } else {
    sessionStorage.removeItem(OAUTH_RETURN_SEARCH_KEY);
  }
}

/**
 * Called after OAuth sign-in succeeds. If the `?prototype=` param was present before the redirect
 * but is now missing (dropped by Supabase's PKCE callback or the SPA 404 script), this function
 * navigates to the correct URL so the right prototype loads.
 *
 * Uses `window.location.replace()` (full reload) so React Router re-reads the URL with the
 * restored prototype param. Supabase has already persisted the session in localStorage by the
 * time this fires, so the user stays signed in after the reload.
 */
export function restoreReturnSearchAfterOAuth(): void {
  if (typeof window === 'undefined') return;
  const saved = sessionStorage.getItem(OAUTH_RETURN_SEARCH_KEY);
  if (!saved) return;

  // Remove the key immediately — this must be a one-shot restore.
  sessionStorage.removeItem(OAUTH_RETURN_SEARCH_KEY);

  const savedParams = new URLSearchParams(saved);
  const savedPrototype = savedParams.get('prototype');
  const currentPrototype = new URLSearchParams(window.location.search).get('prototype');

  // Only navigate if the prototype param has been lost.
  if (savedPrototype && !currentPrototype) {
    const correctUrl = window.location.origin + window.location.pathname + saved;
    window.location.replace(correctUrl);
  }
}
