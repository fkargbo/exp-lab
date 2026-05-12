import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useExpLab } from '../context/ExpLabContext';
import { EXP_LAB_COMMENT_CURSOR } from '../lib/commentCursor';

export function InteractionLayer() {
  const { feedbackMode, dragRect, interactionProps, syncPinLayerHeight, pendingPin, selectedPin } =
    useExpLab();
  const root = typeof document !== 'undefined' ? document.getElementById('exp-lab-interaction-root') : null;

  /* Full-screen capture layer size tracks document height — refresh when entering comment mode. */
  useEffect(() => {
    if (feedbackMode) {
      syncPinLayerHeight();
    }
  }, [feedbackMode, syncPinLayerHeight]);

  /* Cursor over page chrome while placing pins; clear while dialog is open so inputs use I‑beam. */
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const prev = document.body.style.cursor;
    const placing = feedbackMode && !pendingPin && !selectedPin;
    if (placing) {
      document.body.style.cursor = EXP_LAB_COMMENT_CURSOR;
    } else {
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.cursor = prev;
    };
  }, [feedbackMode, pendingPin, selectedPin]);

  const style = useMemo((): React.CSSProperties => {
    if (!feedbackMode) {
      return { pointerEvents: 'none', cursor: 'default', touchAction: 'auto' as const };
    }
    return {
      pointerEvents: 'auto',
      cursor: EXP_LAB_COMMENT_CURSOR,
      touchAction: 'none' as const,
    };
  }, [feedbackMode]);

  if (!root) {
    return null;
  }

  return createPortal(
    <div
      className="exp-lab-interaction-surface"
      style={style}
      {...interactionProps}
    >
      {dragRect && feedbackMode ? (
        <div
          className="exp-lab-drag-marquee"
          style={{
            position: 'absolute',
            boxSizing: 'border-box',
            left: dragRect.left,
            top: dragRect.top,
            width: dragRect.width,
            height: dragRect.height,
            /* Inline so host app CSS cannot flatten dashed borders to solid */
            border: '2px dashed #0066cc',
            borderStyle: 'dashed',
            background: 'rgba(0, 102, 204, 0.1)',
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>,
    root,
  );
}
