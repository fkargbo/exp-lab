/**
 * URL Supabase may redirect to after OAuth (fragment is added by Supabase on return — omit `#` here).
 *
 * When `VITE_OAUTH_REDIRECT_ORIGIN` is set at build (e.g. `https://fkargbo.github.io` from GitHub Actions),
 * we resolve `pathname + search` against it so the return URL always matches GitHub Pages even if the
 * browser origin were ever ambiguous. The value must still appear under Supabase → Authentication →
 * URL Configuration → Redirect URLs (e.g. `https://<owner>.github.io/<repo>/**`).
 */
export function getOAuthRedirectUrl(): string {
  if (typeof window === 'undefined') return '';
  const pathWithQuery = `${window.location.pathname}${window.location.search}`;
  const originBase = import.meta.env.VITE_OAUTH_REDIRECT_ORIGIN?.trim();
  if (originBase) {
    try {
      const base = originBase.endsWith('/') ? originBase : `${originBase}/`;
      return new URL(pathWithQuery, base).href;
    } catch {
      // fall through
    }
  }
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}
