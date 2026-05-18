import { Bell, X } from 'lucide-react';
import React from 'react';
import { useExpLab } from '../context/ExpLabContext';

export function FeedbackUnreadAlert() {
  const { feedbackMode, unreadAlertSummary, dismissUnreadAlert, openFeedbackForPin } = useExpLab();

  if (feedbackMode || !unreadAlertSummary) {
    return null;
  }

  const { title, subtitle } = unreadAlertSummary;

  return (
    <div className="exp-lab-notification-stack" aria-live="polite" aria-label="Unread feedback">
      <div className="exp-lab-notification-toast" role="alert">
        <button
          type="button"
          className="exp-lab-notification-toast__body"
          onClick={() => openFeedbackForPin()}
        >
          <Bell size={18} strokeWidth={2} aria-hidden />
          <span className="exp-lab-notification-toast__text">
            <strong>{title}</strong>
            <span className="exp-lab-notification-toast__subtitle">{subtitle}</span>
          </span>
        </button>
        <button
          type="button"
          className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--icon exp-lab-notification-toast__close"
          aria-label="Dismiss unread feedback alert"
          onClick={(e) => {
            e.stopPropagation();
            dismissUnreadAlert();
          }}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
