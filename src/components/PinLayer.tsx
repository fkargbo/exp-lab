import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FeedbackPinRecord } from '../types';
import { useExpLab } from '../context/ExpLabContext';
import { getPinChrome } from '../lib/authorPinColor';
import { pinUsesChromeLayer, resolvePinMarkerLayout } from '../lib/pinAnchor';
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
  const [layoutTick, setLayoutTick] = useState(0);

  useEffect(() => {
    const bump = () => setLayoutTick((n) => n + 1);
    window.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true);
    return () => {
      window.removeEventListener('resize', bump);
      window.removeEventListener('scroll', bump, true);
    };
  }, []);

  const layout = useMemo(() => resolvePinMarkerLayout(pin), [pin, layoutTick]);
  const chrome = getPinChrome(pin);
  const markerAuthor = getPinMarkerAuthor(pin);

  const markerStyle: React.CSSProperties = {
    position: layout.position,
    left: layout.marker.left,
    top: layout.marker.top,
    ...chrome.markerStyle,
  };

  if (layout.region) {
    return (
      <React.Fragment key={pin.id}>
        <div
          className="exp-lab-region"
          style={{
            position: layout.position,
            left: layout.region.left,
            top: layout.region.top,
            width: layout.region.width,
            height: layout.region.height,
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

function PinMarkers({ pins, onOpen }: { pins: FeedbackPinRecord[]; onOpen: (p: FeedbackPinRecord) => void }) {
  return (
    <>
      {pins.map((p) => (
        <PinMarker key={p.id} pin={p} onOpen={onOpen} />
      ))}
    </>
  );
}

export function PinLayer() {
  const { pins, openPinDetail, feedbackMode } = useExpLab();

  const { contentPins, chromePins } = useMemo(() => {
    const content: FeedbackPinRecord[] = [];
    const chrome: FeedbackPinRecord[] = [];
    for (const pin of pins) {
      if (pinUsesChromeLayer(pin)) {
        chrome.push(pin);
      } else {
        content.push(pin);
      }
    }
    return { contentPins: content, chromePins: chrome };
  }, [pins]);

  const contentRoot =
    typeof document !== 'undefined' ? document.getElementById('exp-lab-pin-root') : null;
  const chromeRoot =
    typeof document !== 'undefined' ? document.getElementById('exp-lab-pin-root-chrome') : null;

  if (!feedbackMode) {
    return null;
  }

  return (
    <>
      {contentRoot && contentPins.length > 0
        ? createPortal(<PinMarkers pins={contentPins} onOpen={openPinDetail} />, contentRoot)
        : null}
      {chromeRoot && chromePins.length > 0
        ? createPortal(<PinMarkers pins={chromePins} onOpen={openPinDetail} />, chromeRoot)
        : null}
    </>
  );
}
