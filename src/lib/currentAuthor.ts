import type { User } from '@supabase/supabase-js';
import type { FeedbackPinRecord } from '../types';
import { getGuestAuthorToken } from './guestAuthorToken';
import { getRememberedGuestPinToken } from './guestPinOwnership';
import { getStoredGuestName } from './storage';
import { getProjectId } from './projectId';

/** True when this pin was created by the current signed-in or guest identity. */
export function isPinAuthoredByCurrentUser(
  pin: FeedbackPinRecord,
  user: User | null,
  guestName: string | null,
): boolean {
  const browserToken = getGuestAuthorToken();
  const pinToken =
    pin.guest_author_token?.trim() || getRememberedGuestPinToken(getProjectId(), pin.id);
  if (pinToken) {
    return browserToken === pinToken;
  }

  if (user) {
    const meta = user.user_metadata as Record<string, string | undefined>;
    const githubId = meta.user_name ?? meta.preferred_username ?? null;
    if (githubId && pin.author_github_id && pin.author_github_id === githubId) {
      return true;
    }
    const displayName =
      meta.full_name ||
      meta.name ||
      meta.user_name ||
      meta.preferred_username ||
      user.email?.split('@')[0] ||
      null;
    if (displayName && pin.author_name?.trim() === displayName.trim()) {
      return true;
    }
  }

  const guest = guestName?.trim() || getStoredGuestName()?.trim();
  if (guest && pin.author_name?.trim() === guest && !pin.author_github_id) {
    return true;
  }

  return false;
}
