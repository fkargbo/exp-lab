const PREFIX = 'exp-lab-locally-deleted:v1:';

function storageKey(projectId: string): string {
  return `${PREFIX}${encodeURIComponent(projectId)}`;
}

export function getLocallyDeletedPinIds(projectId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
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

export function markPinLocallyDeleted(projectId: string, pinId: string): void {
  const ids = getLocallyDeletedPinIds(projectId);
  ids.add(pinId);
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function clearLocallyDeletedPin(projectId: string, pinId: string): void {
  const ids = getLocallyDeletedPinIds(projectId);
  if (!ids.delete(pinId)) {
    return;
  }
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function filterOutLocallyDeletedPins<T extends { id: string }>(
  projectId: string,
  pins: T[],
): T[] {
  const hidden = getLocallyDeletedPinIds(projectId);
  if (hidden.size === 0) {
    return pins;
  }
  return pins.filter((p) => !hidden.has(p.id));
}
