import type { CSSProperties } from 'react';
import type { FeedbackPinRecord } from '../types';

/**
 * Saturated fills that stay readable with white initials; a dark ring separates the marker from light UI.
 */
const AUTHOR_PALETTE = [
  '#0066CC',
  '#C9190B',
  '#38812F',
  '#7950A5',
  '#EC7A08',
  '#009596',
  '#40199A',
  '#A300A3',
  '#005F60',
  '#5E40A8',
  '#3E8635',
  '#B5762B',
  '#004080',
  '#6A1E9E',
  '#007C89',
  '#8B0000',
] as const;

const RING = 'rgba(15, 23, 42, 0.55)';

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Stable identity for color: GitHub login &gt; display name &gt; pin id (anonymous). */
export function getAuthorColorKey(pin: FeedbackPinRecord): string {
  const gh = pin.author_github_id?.trim();
  if (gh) {
    return `gh:${gh.toLowerCase()}`;
  }
  const name = pin.author_name?.trim();
  if (name) {
    return `name:${name.toLowerCase()}`;
  }
  return `id:${pin.id}`;
}

export type PinChrome = {
  fill: string;
  markerStyle: CSSProperties;
  regionStyle: CSSProperties;
};

export function getPinChrome(pin: FeedbackPinRecord): PinChrome {
  const key = getAuthorColorKey(pin);
  const idx = hashString(key) % AUTHOR_PALETTE.length;
  const fill = AUTHOR_PALETTE[idx]!;
  const regionFill = hexToRgba(fill, 0.16);

  return {
    fill,
    markerStyle: {
      backgroundColor: fill,
      border: `2px solid ${RING}`,
      color: '#fff',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.22)',
    },
    regionStyle: {
      borderColor: fill,
      borderWidth: 2,
      borderStyle: 'solid',
      backgroundColor: regionFill,
    },
  };
}
