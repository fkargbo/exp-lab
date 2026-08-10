import type { AuthorInfo, FeedbackPinRecord, FeedbackThreadEntry } from '../types';

function isThreadEntry(x: unknown): x is FeedbackThreadEntry {
  if (!x || typeof x !== 'object') {
    return false;
  }
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.body === 'string' &&
    (o.author_name === null || typeof o.author_name === 'string') &&
    (o.author_avatar_url === null || typeof o.author_avatar_url === 'string') &&
    (o.author_github_id === null || typeof o.author_github_id === 'string') &&
    typeof o.created_at === 'string'
  );
}

/** Ordered thread for a pin (legacy `comment_text` + pin author becomes one synthetic entry when needed). */
export function getPinThreadEntries(pin: FeedbackPinRecord): FeedbackThreadEntry[] {
  const raw = pin.comment_entries;
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return [];
    }
    const list = raw.filter(isThreadEntry);
    return [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }
  const text = pin.comment_text?.trim();
  if (text) {
    return [
      {
        id: `legacy-${pin.id}`,
        body: pin.comment_text,
        author_name: pin.author_name,
        author_avatar_url: pin.author_avatar_url,
        author_github_id: pin.author_github_id,
        created_at: pin.created_at,
      },
    ];
  }
  return [];
}

/** Original pin poster (first thread message), not the latest replier on `pin.author_*`. */
export function getPinCreatorAuthor(pin: FeedbackPinRecord): PinEntryAuthor {
  const entries = getPinThreadEntries(pin);
  const first = entries[0];
  if (first) {
    return {
      name: first.author_name,
      avatarUrl: first.author_avatar_url,
      githubId: first.author_github_id,
    };
  }
  return {
    name: pin.author_name,
    avatarUrl: pin.author_avatar_url,
    githubId: pin.author_github_id,
  };
}

/** Prefer the open dialog pin so thread ids match what the user sees. */
export function resolvePinForThread(
  pinId: string,
  selectedPin: FeedbackPinRecord | null | undefined,
  pins: FeedbackPinRecord[],
): FeedbackPinRecord | undefined {
  if (selectedPin?.id === pinId) {
    return selectedPin;
  }
  return pins.find((p) => p.id === pinId);
}

export function threadBodiesJoined(entries: FeedbackThreadEntry[]): string {
  return entries
    .map((e) => e.body.trim())
    .filter(Boolean)
    .join('\n\n');
}

export type PinEntryAuthor = {
  name: string | null;
  avatarUrl: string | null;
  githubId: string | null;
};

/**
 * Whether the current viewer may edit a thread message (GitHub id match, or guest name match).
 * For guests, `guestIdentity` should be the persisted guest name (not an unsaved text field).
 */
function canUserManageOwnThreadEntry(
  entry: FeedbackThreadEntry,
  authorDisplay: AuthorInfo | null,
  guestIdentity: string | null,
): boolean {
  const entryGh = entry.author_github_id?.trim();
  const userGh = authorDisplay?.githubId?.trim();
  if (entryGh) {
    return Boolean(userGh && userGh.toLowerCase() === entryGh.toLowerCase());
  }
  if (userGh) {
    return false;
  }
  const g = (guestIdentity ?? '').trim();
  const en = (entry.author_name ?? '').trim();
  return Boolean(g && en && g.toLowerCase() === en.toLowerCase());
}

/** Whether the current viewer may edit a thread message they authored. */
export function canUserEditThreadEntry(
  entry: FeedbackThreadEntry,
  authorDisplay: AuthorInfo | null,
  guestIdentity: string | null,
): boolean {
  return canUserManageOwnThreadEntry(entry, authorDisplay, guestIdentity);
}

/** Whether the current viewer may delete a thread message they authored. */
export function canUserDeleteThreadEntry(
  entry: FeedbackThreadEntry,
  authorDisplay: AuthorInfo | null,
  guestIdentity: string | null,
): boolean {
  return canUserManageOwnThreadEntry(entry, authorDisplay, guestIdentity);
}

export function createThreadEntry(body: string, author: PinEntryAuthor): FeedbackThreadEntry {
  const trimmed = body.trim();
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    body: trimmed,
    author_name: author.name,
    author_avatar_url: author.avatarUrl,
    author_github_id: author.githubId,
    created_at: new Date().toISOString(),
  };
}

/** Avatar / name for map marker: latest thread message, else pin-level. */
export function getPinMarkerAuthor(pin: FeedbackPinRecord): PinEntryAuthor {
  const entries = getPinThreadEntries(pin);
  const last = entries[entries.length - 1];
  if (last) {
    return {
      name: last.author_name,
      avatarUrl: last.author_avatar_url,
      githubId: last.author_github_id,
    };
  }
  return {
    name: pin.author_name,
    avatarUrl: pin.author_avatar_url,
    githubId: pin.author_github_id,
  };
}
