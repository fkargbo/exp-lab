import { getPinThreadEntries } from './pinThread';
import type { FeedbackPinRecord } from '../types';

/** Detects new pins or new thread activity for polling / refresh sync. */
export function pinActivitySnapshot(pin: FeedbackPinRecord): string {
  const entries = getPinThreadEntries(pin);
  return `${pin.id}|${entries.length}|${entries.at(-1)?.created_at ?? pin.created_at}`;
}

export function uniqueAuthorLabels(pins: FeedbackPinRecord[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const pin of pins) {
    const key = pin.author_github_id?.trim() || pin.author_name?.trim() || 'guest-anon';
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(pin.author_name?.trim() || 'Someone');
  }
  return labels;
}
