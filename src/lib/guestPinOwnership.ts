import type { FeedbackPinRecord } from '../types';
import { getGuestAuthorToken } from './guestAuthorToken';

const MAP_PREFIX = 'exp-lab-guest-pin-tokens:v1:';

function mapKey(projectId: string): string {
  return `${MAP_PREFIX}${encodeURIComponent(projectId)}`;
}

function readMap(projectId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(mapKey(projectId));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(projectId: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(mapKey(projectId), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function rememberGuestPinToken(projectId: string, pinId: string, token?: string): void {
  const t = token ?? getGuestAuthorToken();
  const map = readMap(projectId);
  map[pinId] = t;
  writeMap(projectId, map);
}

export function getRememberedGuestPinToken(projectId: string, pinId: string): string | null {
  const map = readMap(projectId);
  return map[pinId]?.trim() || null;
}

export function forgetGuestPinToken(projectId: string, pinId: string): void {
  const map = readMap(projectId);
  if (!map[pinId]) {
    return;
  }
  delete map[pinId];
  writeMap(projectId, map);
}

/** Token used for this pin on delete (DB column or browser-remembered at create time). */
export function guestPinDeleteToken(pin: FeedbackPinRecord, projectId: string): string | null {
  return pin.guest_author_token?.trim() || getRememberedGuestPinToken(projectId, pin.id) || null;
}
