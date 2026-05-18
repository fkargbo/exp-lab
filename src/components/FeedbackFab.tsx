import { MessageCircle } from 'lucide-react';
import React from 'react';
import { useExpLab } from '../context/ExpLabContext';

export function FeedbackFab() {
  const { feedbackMode, unreadCount, openFeedbackForPin } = useExpLab();

  if (feedbackMode) {
    return null;
  }

  const label =
    unreadCount > 0
      ? `${unreadCount} unread feedback item${unreadCount === 1 ? '' : 's'}. Open feedback.`
      : 'Open feedback (press C)';

  return (
    <button
      type="button"
      className="exp-lab-fab"
      aria-label={label}
      title={label}
      onClick={() => openFeedbackForPin()}
    >
      <MessageCircle size={22} strokeWidth={2} aria-hidden />
      {unreadCount > 0 ? (
        <span className="exp-lab-fab__badge" aria-hidden>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
