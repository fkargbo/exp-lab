import type { FeedbackPinRecord } from '../types';
import { uniqueAuthorLabels } from './pinSync';

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

export type UnreadFeedbackSummary = {
  title: string;
  subtitle: string;
  contributorCount: number;
  feedbackCount: number;
};

/**
 * One toast for all unread feedback — scales from 1 stakeholder to many.
 * Examples:
 * - 1 person / 1 item: "Alex left feedback"
 * - 10 people / 12 items: "Alex, Sam, and 8 others left 12 feedback items"
 */
export function formatUnreadFeedbackSummary(
  unreadPins: FeedbackPinRecord[],
): UnreadFeedbackSummary {
  const feedbackCount = unreadPins.length;
  const names = uniqueAuthorLabels(unreadPins);
  const contributorCount = names.length;

  if (feedbackCount === 0) {
    return {
      title: 'New feedback on this page',
      subtitle: 'Press C to view',
      contributorCount: 0,
      feedbackCount: 0,
    };
  }

  let title: string;
  if (contributorCount === 1) {
    const who = names[0]!;
    title =
      feedbackCount === 1
        ? `${who} left feedback`
        : `${who} left ${feedbackCount} feedback items`;
  } else if (contributorCount === 2) {
    const [a, b] = names;
    if (feedbackCount === 2) {
      title = `${a} and ${b} left feedback`;
    } else {
      title = `${a} and ${b} left ${feedbackCount} feedback items`;
    }
  } else {
    const [first, second] = names;
    const others = contributorCount - 2;
    const peoplePhrase = `${first}, ${second}, and ${others} other${others === 1 ? '' : 's'}`;
    title =
      feedbackCount === 1
        ? `${peoplePhrase} left feedback`
        : `${peoplePhrase} left ${feedbackCount} feedback items`;
  }

  const subtitle =
    contributorCount === 1
      ? feedbackCount === 1
        ? 'Press C to view the pin on this page'
        : `${feedbackCount} items on this page · Press C to view`
      : `${contributorCount} contributors · ${feedbackCount} item${feedbackCount === 1 ? '' : 's'} · Press C to view`;

  return { title, subtitle, contributorCount, feedbackCount };
}
