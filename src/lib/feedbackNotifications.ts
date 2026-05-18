export type FeedbackNotificationItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** Open this pin when the toast is clicked. */
  pinId?: string;
};

export function createNotificationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const BANNER_PREFIX = 'exp-lab-unread-banner:';

export function hasShownUnreadBanner(projectId: string): boolean {
  try {
    return sessionStorage.getItem(`${BANNER_PREFIX}${encodeURIComponent(projectId)}`) === '1';
  } catch {
    return false;
  }
}

export function markUnreadBannerShown(projectId: string): void {
  try {
    sessionStorage.setItem(`${BANNER_PREFIX}${encodeURIComponent(projectId)}`, '1');
  } catch {
    /* ignore */
  }
}
