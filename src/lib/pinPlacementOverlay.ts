import type { FeedbackPinRecord } from '../types';
import type { PinPlacement } from './pinAnchor';

const STORAGE_KEY = 'exp-lab-pin-placement-overlays';

type PlacementOverlay = Pick<
  PinPlacement,
  'coordinate_space' | 'anchor_selector' | 'anchor_x_pct' | 'anchor_y_pct'
>;

function readAll(): Record<string, PlacementOverlay> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, PlacementOverlay>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, PlacementOverlay>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function savePinPlacementOverlay(pinId: string, placement: PlacementOverlay): void {
  const all = readAll();
  all[pinId] = placement;
  writeAll(all);
}

export function mergePlacementOverlays(pins: FeedbackPinRecord[]): FeedbackPinRecord[] {
  const all = readAll();
  if (Object.keys(all).length === 0) {
    return pins;
  }
  return pins.map((pin) => {
    const overlay = all[pin.id];
    if (!overlay) {
      return pin;
    }
    return { ...pin, ...overlay };
  });
}
