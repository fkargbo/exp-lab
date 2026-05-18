import React from 'react';
import { CommentDialog } from './components/CommentDialog';
import { FeedbackUnreadAlert } from './components/FeedbackUnreadAlert';
import { InteractionLayer } from './components/InteractionLayer';
import { PinLayer } from './components/PinLayer';
import { Toast } from './components/Toast';
import { ExpLabProvider } from './context/ExpLabContext';

export function App() {
  return (
    <ExpLabProvider>
      <Toast />
      <FeedbackUnreadAlert />
      <CommentDialog />
      <PinLayer />
      <InteractionLayer />
    </ExpLabProvider>
  );
}
