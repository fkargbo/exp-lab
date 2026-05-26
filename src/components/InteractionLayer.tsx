import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useExpLab } from '../context/ExpLabContext';
import { EXP_LAB_COMMENT_CURSOR } from '../lib/commentCursor';
import { resolveScrollableAnnotationRoot, setPinLayerPlacementMode } from '../lib/annotationSurface';

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
    setPinLayerPlacementMode(placing);
    if (placing) {
      document.body.style.cursor = EXP_LAB_COMMENT_CURSOR;
    } else {
      document.body.style.cursor = '';
    }
    return () => {
      setPinLayerPlacementMode(false);
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

  const dragMarqueeStyle = useMemo((): React.CSSProperties | null => {
    if (!dragRect || !feedbackMode) {
      return null;
    }
    const root = resolveScrollableAnnotationRoot();
    const rootRect = root.getBoundingClientRect();
    return {
      position: 'fixed',
      boxSizing: 'border-box',
      left: rootRect.left - root.scrollLeft + dragRect.left,
      top: rootRect.top - root.scrollTop + dragRect.top,
      width: dragRect.width,
      height: dragRect.height,
      border: '2px dashed #0066cc',
      borderStyle: 'dashed',
      background: 'rgba(0, 102, 204, 0.1)',
      borderRadius: 4,
      pointerEvents: 'none',
    };
  }, [dragRect, feedbackMode]);

  if (!root) {
    return null;
  }

  return createPortal(
    <div
      className="exp-lab-interaction-surface"
      style={style}
      {...interactionProps}
    >
      {dragMarqueeStyle ? <div className="exp-lab-drag-marquee" style={dragMarqueeStyle} /> : null}
    </div>,
    root,
  );
}
