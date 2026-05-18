const DISMISS_PREFIX = 'exp-lab-unread-alert-dismissed:';

export function getDismissedAlertPinIds(projectId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(`${DISMISS_PREFIX}${encodeURIComponent(projectId)}`);
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

export function saveDismissedAlertPinIds(projectId: string, ids: Set<string>): void {
  try {
    sessionStorage.setItem(
      `${DISMISS_PREFIX}${encodeURIComponent(projectId)}`,
      JSON.stringify([...ids]),
    );
  } catch {
    /* ignore */
  }
}

/** Human-readable summary of who left feedback and how many items. */
export function formatUnreadFeedbackSummary(
  authorNames: string[],
  count: number,
): { title: string; subtitle: string } {
  const names = [...new Set(authorNames.map((n) => n.trim() || 'Someone'))];

  let who: string;
  if (names.length === 0) {
    who = 'Someone';
  } else if (names.length === 1) {
    who = names[0];
  } else if (names.length === 2) {
    who = `${names[0]} and ${names[1]}`;
  } else {
    const others = names.length - 2;
    who = `${names[0]}, ${names[1]}, and ${others} other${others === 1 ? '' : 's'}`;
  }

  const title =
    count === 1 ? `${who} left feedback` : `${who} left ${count} feedback items`;

  return {
    title,
    subtitle: 'Open feedback to view pins on this page (press C)',
  };
}
