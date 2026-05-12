const GUEST_NAME_KEY = 'exp-lab-guest-display-name';

export function getStoredGuestName(): string | null {
  try {
    return window.localStorage.getItem(GUEST_NAME_KEY);
  } catch {
    return null;
  }
}

export function setStoredGuestName(name: string): void {
  try {
    window.localStorage.setItem(GUEST_NAME_KEY, name.trim());
  } catch {
    /* ignore */
  }
}
