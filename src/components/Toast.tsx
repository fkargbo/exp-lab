import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import React from 'react';
import { useExpLab } from '../context/ExpLabContext';

export function Toast() {
  const { feedbackMode } = useExpLab();

  return (
    <AnimatePresence>
      {feedbackMode ? (
        <motion.div
          key="toast"
          className="exp-lab-toast"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
        >
          <MessageCircle size={18} strokeWidth={2} aria-hidden />
          <span>
            <strong>Comment mode active</strong>
            <span style={{ color: 'var(--exp-lab-muted)', marginLeft: 8 }}>Click or drag to highlight · Esc closes</span>
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
