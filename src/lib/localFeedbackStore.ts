import type { FeedbackPinRecord, FeedbackThreadEntry } from '../types';
import { getPinThreadEntries, threadBodiesJoined } from './pinThread';

const PREFIX = 'exp-lab-feedback:v1:';

export function getLocalFeedbackStorageKey(projectId: string): string {
  return `${PREFIX}${encodeURIComponent(projectId)}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isPinRecord(x: unknown): x is FeedbackPinRecord {
  if (!x || typeof x !== 'object') {
    return false;
  }
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.project_id === 'string' &&
    typeof o.kind === 'string' &&
    typeof o.x_pct === 'number' &&
    typeof o.y_pct === 'number' &&
    typeof o.comment_text === 'string'
  );
}

export function loadLocalPins(projectId: string): FeedbackPinRecord[] {
  try {
    const raw = localStorage.getItem(getLocalFeedbackStorageKey(projectId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isPinRecord);
  } catch {
    return [];
  }
}

export function saveLocalPins(projectId: string, pins: FeedbackPinRecord[]): void {
  localStorage.setItem(getLocalFeedbackStorageKey(projectId), JSON.stringify(pins));
}

export function appendLocalPin(pin: FeedbackPinRecord): void {
  const list = loadLocalPins(pin.project_id);
  list.push(pin);
  saveLocalPins(pin.project_id, list);
}

export function removeLocalPin(projectId: string, pinId: string): void {
  const list = loadLocalPins(projectId).filter((p) => p.id !== pinId);
  saveLocalPins(projectId, list);
}

/** Append a thread message; syncs `comment_text` and pin-level author to latest poster. */
export function appendLocalPinEntry(
  projectId: string,
  pinId: string,
  entry: FeedbackThreadEntry,
): void {
  const list = loadLocalPins(projectId).map((p) => {
    if (p.id !== pinId) {
      return p;
    }
    const prev = getPinThreadEntries(p);
    const next = [...prev, entry];
    return {
      ...p,
      comment_entries: next,
      comment_text: threadBodiesJoined(next),
      author_name: entry.author_name,
      author_avatar_url: entry.author_avatar_url,
      author_github_id: entry.author_github_id,
    };
  });
  saveLocalPins(projectId, list);
}

export function createLocalPinId(): string {
  return newId();
}
