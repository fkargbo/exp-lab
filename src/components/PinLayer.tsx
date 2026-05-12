import React from 'react';
import { createPortal } from 'react-dom';
import type { FeedbackPinRecord } from '../types';
import { useExpLab } from '../context/ExpLabContext';
import { getPinChrome } from '../lib/authorPinColor';
import { getPinMarkerAuthor } from '../lib/pinThread';

function initials(name: string | null): string {
  if (!name?.trim()) {
    return '?';
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function PinMarker({ pin, onOpen }: { pin: FeedbackPinRecord; onOpen: (p: FeedbackPinRecord) => void }) {
  const chrome = getPinChrome(pin);
  const markerAuthor = getPinMarkerAuthor(pin);
  let leftPct = pin.x_pct;
  let topPct = pin.y_pct;
  if (pin.kind === 'region' && pin.w_pct != null && pin.h_pct != null) {
    leftPct = pin.x_pct + pin.w_pct / 2;
    topPct = pin.y_pct + pin.h_pct / 2;
  }
  const left = `${leftPct}%`;
  const top = `${topPct}%`;

  const markerStyle: React.CSSProperties = {
    left,
    top,
    ...chrome.markerStyle,
  };

  if (pin.kind === 'region' && pin.w_pct != null && pin.h_pct != null) {
    return (
      <React.Fragment key={pin.id}>
        <div
          className="exp-lab-region"
          style={{
            left: `${pin.x_pct}%`,
            top: `${pin.y_pct}%`,
            width: `${pin.w_pct}%`,
            height: `${pin.h_pct}%`,
            ...chrome.regionStyle,
          }}
        />
        <button
          type="button"
          data-exp-lab-pin={pin.id}
          className="exp-lab-pin-label"
          style={markerStyle}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(pin);
          }}
          aria-label={`Open comment from ${pin.author_name ?? 'Guest'}`}
        >
          {markerAuthor.avatarUrl ? (
            <img src={markerAuthor.avatarUrl} alt="" />
          ) : (
            initials(markerAuthor.name)
          )}
        </button>
      </React.Fragment>
    );
  }

  return (
    <button
      key={pin.id}
      type="button"
      data-exp-lab-pin={pin.id}
      className="exp-lab-pin-label"
      style={markerStyle}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(pin);
      }}
      aria-label={`Open comment from ${pin.author_name ?? 'Guest'}`}
    >
      {markerAuthor.avatarUrl ? <img src={markerAuthor.avatarUrl} alt="" /> : initials(markerAuthor.name)}
    </button>
  );
}

export function PinLayer() {
  const { pins, openPinDetail, feedbackMode } = useExpLab();
  const root = typeof document !== 'undefined' ? document.getElementById('exp-lab-pin-root') : null;
  if (!root || !feedbackMode) {
    return null;
  }

  return createPortal(
    <>
      {pins.map((p) => (
        <PinMarker key={p.id} pin={p} onOpen={openPinDetail} />
      ))}
    </>,
    root,
  );
}
