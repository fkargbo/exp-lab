const GUEST_AUTHOR_TOKEN_KEY = 'exp-lab-guest-author-token';

/** Stable per-browser token so guest authors can delete their own Supabase pins when RLS allows it. */
export function getGuestAuthorToken(): string {
  try {
    const existing = window.localStorage.getItem(GUEST_AUTHOR_TOKEN_KEY);
    if (existing?.trim()) {
      return existing.trim();
    }
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    window.localStorage.setItem(GUEST_AUTHOR_TOKEN_KEY, created);
    return created;
  } catch {
    return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
