const PREFIX = 'exp-lab-read:v1:';

function storageKey(projectId: string): string {
  return `${PREFIX}${encodeURIComponent(projectId)}`;
}

/** Pin ids the user has seen on this page scope. */
export function getReadPinIds(projectId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

export function saveReadPinIds(projectId: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Merge pin ids into the read set for this page. */
export function markPinsRead(projectId: string, pinIds: string[]): Set<string> {
  const next = new Set(getReadPinIds(projectId));
  for (const id of pinIds) {
    next.add(id);
  }
  saveReadPinIds(projectId, next);
  return next;
}
