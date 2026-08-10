import type { User } from '@supabase/supabase-js';
import type { FeedbackPinRecord } from '../types';
import { getPinCreatorAuthor } from './pinThread';
import { getStoredGuestName } from './storage';

/** True when this pin was created by the current signed-in or guest identity. */
export function isPinAuthoredByCurrentUser(
  pin: FeedbackPinRecord,
  user: User | null,
  guestName: string | null,
): boolean {
  const creator = getPinCreatorAuthor(pin);

  if (user) {
    const meta = user.user_metadata as Record<string, string | undefined>;
    const githubId = meta.user_name ?? meta.preferred_username ?? null;
    if (githubId && creator.githubId && creator.githubId === githubId) {
      return true;
    }
    const displayName =
      meta.full_name ||
      meta.name ||
      meta.user_name ||
      meta.preferred_username ||
      user.email?.split('@')[0] ||
      null;
    if (displayName && creator.name?.trim() === displayName.trim()) {
      return true;
    }
  }

  const guest = guestName?.trim() || getStoredGuestName()?.trim();
  if (guest && creator.name?.trim() === guest && !creator.githubId) {
    return true;
  }

  return false;
}

/** Delete requires a signed-in session that matches the pin creator. */
export function canSignedInUserDeletePin(pin: FeedbackPinRecord, user: User | null): boolean {
  if (!user) {
    return false;
  }
  const creator = getPinCreatorAuthor(pin);
  const meta = user.user_metadata as Record<string, string | undefined>;
  const githubId = meta.user_name ?? meta.preferred_username ?? null;
  if (githubId && creator.githubId && creator.githubId === githubId) {
    return true;
  }
  const displayName =
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    meta.preferred_username ||
    user.email?.split('@')[0] ||
    null;
  if (displayName && creator.name?.trim() === displayName.trim()) {
    return true;
  }
  return false;
}
