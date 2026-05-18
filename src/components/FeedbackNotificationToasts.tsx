import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import React, { useEffect } from 'react';
import { useExpLab } from '../context/ExpLabContext';

const AUTO_DISMISS_MS = 9000;

function NotificationToast({
  id,
  title,
  subtitle,
  pinId,
  onOpen,
  onDismiss,
}: {
  id: string;
  title: string;
  subtitle?: string;
  pinId?: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [id, onDismiss]);

  return (
    <motion.div
      layout
      className="exp-lab-notification-toast"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2 }}
      role="status"
    >
      <button type="button" className="exp-lab-notification-toast__body" onClick={onOpen}>
        <Bell size={18} strokeWidth={2} aria-hidden />
        <span className="exp-lab-notification-toast__text">
          <strong>{title}</strong>
          {subtitle ? <span className="exp-lab-notification-toast__subtitle">{subtitle}</span> : null}
        </span>
      </button>
      <button
        type="button"
        className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--icon exp-lab-notification-toast__close"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </motion.div>
  );
}

export function FeedbackNotificationToasts() {
  const { notifications, dismissNotification, openFeedbackForPin, feedbackMode } = useExpLab();

  return (
    <motion.div
      className={`exp-lab-notification-stack${feedbackMode ? ' exp-lab-notification-stack--with-mode-banner' : ''}`}
      aria-live="polite"
      aria-label="Feedback notifications"
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((n) => (
          <NotificationToast
            key={n.id}
            id={n.id}
            title={n.title}
            subtitle={n.subtitle}
            pinId={n.pinId}
            onOpen={() => {
              openFeedbackForPin(n.pinId);
              dismissNotification(n.id);
            }}
            onDismiss={() => dismissNotification(n.id)}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
