const GUEST_NAME_KEY = 'exp-lab-guest-display-name';

function readGuestNameFrom(storage: Storage): string | null {
  try {
    const v = storage.getItem(GUEST_NAME_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

function writeGuestNameTo(storage: Storage, name: string): void {
  try {
    storage.setItem(GUEST_NAME_KEY, name.trim());
  } catch {
    /* ignore */
  }
}

export function getStoredGuestName(): string | null {
  return readGuestNameFrom(window.localStorage) ?? readGuestNameFrom(window.sessionStorage);
}

export function setStoredGuestName(name: string): void {
  const trimmed = name.trim();
  writeGuestNameTo(window.localStorage, trimmed);
  writeGuestNameTo(window.sessionStorage, trimmed);
}

/** Name from the dialog field, React state, or browser storage (incognito-safe order). */
export function resolveGuestDisplayName(
  nameFromInput?: string | null,
  nameFromState?: string | null,
): string | null {
  const fromInput = nameFromInput?.trim();
  if (fromInput) {
    return fromInput;
  }
  const fromState = nameFromState?.trim();
  if (fromState) {
    return fromState;
  }
  return getStoredGuestName();
}
