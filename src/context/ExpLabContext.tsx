import type { User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AuthorInfo, FeedbackPinKind, FeedbackPinRecord } from '../types';
import {
  getCanonicalPrototypeUrl,
  getPageScopeProjectIds,
  getPageScopeSignature,
  getProjectId,
  pinMatchesPageScope,
  subscribeToLocationScope,
} from '../lib/projectId';
import { pinActivitySnapshot } from '../lib/pinSync';
import {
  appendLocalPin,
  appendLocalPinEntry,
  createLocalPinId,
  getLocalFeedbackStorageKey,
  loadLocalPins,
  removeLocalPin,
  removeLocalPinEntry,
  updateLocalPinEntry,
} from '../lib/localFeedbackStore';
import {
  canUserDeleteThreadEntry,
  canUserEditThreadEntry,
  createThreadEntry,
  getPinThreadEntries,
  resolvePinForThread,
  threadBodiesJoined,
} from '../lib/pinThread';
import { canSignedInUserDeletePin, isPinAuthoredByCurrentUser } from '../lib/currentAuthor';
import {
  formatUnreadFeedbackSummary,
  getDismissedAlertPinIds,
  saveDismissedAlertPinIds,
  type UnreadFeedbackSummary,
} from '../lib/unreadFeedbackSummary';
import { getReadPinIds, markPinsRead } from '../lib/feedbackReadState';
import { getStoredGuestName, resolveGuestDisplayName, setStoredGuestName } from '../lib/storage';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { getOAuthRedirectUrl } from '../lib/oauthRedirect';
import {
  getAnnotationContentSize,
  pointerToPercent,
  pointerToRootLocal,
  pointerToViewportPercent,
  resolveScrollableAnnotationRoot,
  syncAnnotationSurfaceLayers,
} from '../lib/annotationSurface';
import {
  captureElementAnchor,
  isPointerInContentRoot,
  type PinPlacement,
} from '../lib/pinAnchor';
import { mergePlacementOverlays, savePinPlacementOverlay } from '../lib/pinPlacementOverlay';

const DRAG_THRESHOLD_PX = 6;
/** Fallback when Realtime is off or filters miss (common with URL-shaped project_id). */
const PIN_POLL_INTERVAL_MS = 8_000;

function mergePinIntoList(prev: FeedbackPinRecord[], pin: FeedbackPinRecord): FeedbackPinRecord[] {
  if (!pinMatchesPageScope(pin)) {
    return prev;
  }
  const idx = prev.findIndex((p) => p.id === pin.id);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = pin;
    return next;
  }
  return [...prev, pin].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

type PendingPin = PinPlacement & {
  kind: 'point' | 'region';
  page_scope: string;
};

function buildPendingPlacement(
  clientX: number,
  clientY: number,
  region?: { x_pct: number; y_pct: number; w_pct: number; h_pct: number },
): PendingPin {
  const page_scope = getPageScopeSignature();
  const contentRoot = resolveScrollableAnnotationRoot();
  const inContent = isPointerInContentRoot(clientX, clientY, contentRoot);
  const anchor = captureElementAnchor(clientX, clientY);

  if (region) {
    return {
      kind: 'region',
      page_scope,
      coordinate_space: inContent ? 'content' : 'viewport',
      x_pct: region.x_pct,
      y_pct: region.y_pct,
      w_pct: region.w_pct,
      h_pct: region.h_pct,
      ...anchor,
    };
  }

  if (inContent) {
    return {
      kind: 'point',
      page_scope,
      coordinate_space: 'content',
      ...pointerToPercent(clientX, clientY, contentRoot),
      ...anchor,
    };
  }

  return {
    kind: 'point',
    page_scope,
    coordinate_space: 'viewport',
    ...pointerToViewportPercent(clientX, clientY),
    ...anchor,
  };
}

type DragRect = { left: number; top: number; width: number; height: number };

type ExpLabContextValue = {
  feedbackMode: boolean;
  toggleFeedbackMode: () => void;
  /** Exit comment mode and close any open compose/detail UI (used by Cancel). */
  leaveFeedbackMode: () => void;
  projectId: string;
  pins: FeedbackPinRecord[];
  loadingPins: boolean;
  supabaseReady: boolean;
  user: User | null;
  authorDisplay: AuthorInfo | null;
  guestName: string | null;
  setGuestName: (name: string) => void;
  signInWithGitHub: () => Promise<void>;
  signOut: () => Promise<void>;
  pendingPin: PendingPin | null;
  openCommentForPending: (p: PendingPin) => void;
  dismissPending: () => void;
  submitComment: (text: string, guestDisplayName?: string) => Promise<void>;
  selectedPin: FeedbackPinRecord | null;
  openPinDetail: (pin: FeedbackPinRecord) => void;
  closePinDetail: () => void;
  /** Append a new thread message on an existing pin (Supabase or local storage). */
  appendPinFeedback: (pinId: string, text: string, guestDisplayName?: string) => Promise<void>;
  /** Update an existing thread message (author-only; Supabase or local storage). */
  updatePinThreadEntry: (pinId: string, entryId: string, newBody: string) => Promise<void>;
  /** Delete one thread message the current user authored (not the whole pin). */
  deletePinThreadEntry: (pinId: string, entryId: string) => Promise<void>;
  /** Remove a saved pin (Supabase or local storage). Closes detail view on success. */
  deletePin: (pinId: string) => Promise<void>;
  dragRect: DragRect | null;
  syncPinLayerHeight: () => void;
  interactionProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
  /** `local` = browser-only storage (zero config). `supabase` = cloud when env vars are set. */
  persistenceMode: 'supabase' | 'local';
  /** Pins from others on this page not yet opened in feedback mode. */
  unreadCount: number;
  /** Dismissable top-right alert copy when there is unread feedback from others. */
  unreadAlertSummary: UnreadFeedbackSummary | null;
  dismissUnreadAlert: () => void;
  /** Open feedback mode and optionally focus a pin (from alert). */
  openFeedbackForPin: (pinId?: string) => void;
};

const ExpLabContext = createContext<ExpLabContextValue | null>(null);

function authorFromUser(user: User | null): AuthorInfo | null {
  if (!user) {
    return null;
  }
  const meta = user.user_metadata as Record<string, string | undefined>;
  const name =
    meta.full_name ||
    meta.name ||
    meta.user_name ||
    meta.preferred_username ||
    user.email?.split('@')[0] ||
    'Collaborator';
  const avatarUrl = meta.avatar_url ?? null;
  const githubId = meta.user_name ?? meta.preferred_username ?? null;
  return { name, avatarUrl, githubId };
}

export function ExpLabProvider({ children }: { children: React.ReactNode }) {
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [pins, setPins] = useState<FeedbackPinRecord[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [guestName, setGuestNameState] = useState<string | null>(() => getStoredGuestName());
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [selectedPin, setSelectedPin] = useState<FeedbackPinRecord | null>(null);
  const [readPinIds, setReadPinIds] = useState<Set<string>>(() => new Set());
  const [dismissedAlertPinIds, setDismissedAlertPinIds] = useState<Set<string>>(() => new Set());

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, startY: 0, pointerId: null });
  const [dragRect, setDragRect] = useState<DragRect | null>(null);

  const projectId = useSyncExternalStore(subscribeToLocationScope, getProjectId, getProjectId);
  /** Latest scope for async pin loads (avoids a slow fetch for page A finishing after navigate to B). */
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const userRef = useRef(user);
  userRef.current = user;
  const guestNameRef = useRef(guestName);
  guestNameRef.current = guestName;

  const supabase = getSupabase();

  const supabaseReady = isSupabaseConfigured() && supabase !== null;
  const persistenceMode: 'supabase' | 'local' = supabase ? 'supabase' : 'local';

  const markAllPinsReadForPage = useCallback(() => {
    const scope = projectIdRef.current;
    const ids = pinsRef.current.map((p) => p.id);
    setReadPinIds(markPinsRead(scope, ids));
  }, []);

  const unreadPinsFromOthers = useMemo(() => {
    return pins.filter(
      (p) => !readPinIds.has(p.id) && !isPinAuthoredByCurrentUser(p, user, guestName),
    );
  }, [pins, readPinIds, user, guestName]);

  const unreadCount = unreadPinsFromOthers.length;

  const visibleUnreadPins = useMemo(() => {
    return unreadPinsFromOthers.filter((p) => !dismissedAlertPinIds.has(p.id));
  }, [unreadPinsFromOthers, dismissedAlertPinIds]);

  const unreadAlertSummary = useMemo(() => {
    if (feedbackMode || visibleUnreadPins.length === 0) {
      return null;
    }
    return formatUnreadFeedbackSummary(visibleUnreadPins);
  }, [feedbackMode, visibleUnreadPins]);

  const dismissUnreadAlert = useCallback(() => {
    const scope = projectIdRef.current;
    const ids = visibleUnreadPins.map((p) => p.id);
    if (ids.length === 0) {
      return;
    }
    setDismissedAlertPinIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        next.add(id);
      }
      saveDismissedAlertPinIds(scope, next);
      return next;
    });
  }, [visibleUnreadPins]);

  const revealUnreadAlertForPin = useCallback((pinId: string) => {
    setDismissedAlertPinIds((prev) => {
      if (!prev.has(pinId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(pinId);
      saveDismissedAlertPinIds(projectIdRef.current, next);
      return next;
    });
  }, []);

  const notifyIncomingPin = useCallback(
    (pin: FeedbackPinRecord) => {
      if (!pinMatchesPageScope(pin)) {
        return;
      }
      if (isPinAuthoredByCurrentUser(pin, userRef.current, guestNameRef.current)) {
        return;
      }
      revealUnreadAlertForPin(pin.id);
      setReadPinIds((prev) => {
        if (!prev.has(pin.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(pin.id);
        return next;
      });
    },
    [revealUnreadAlertForPin],
  );

  const applyRemotePinChange = useCallback(
    (pin: FeedbackPinRecord) => {
      if (!pinMatchesPageScope(pin)) {
        return;
      }
      setPins((prev) => mergePinIntoList(prev, pin));
      notifyIncomingPin(pin);
    },
    [notifyIncomingPin],
  );

  const syncPinLayerHeight = useCallback(() => {
    syncAnnotationSurfaceLayers();
  }, []);

  useEffect(() => {
    syncPinLayerHeight();
    const onResize = () => syncPinLayerHeight();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [syncPinLayerHeight]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const applyPinsFromServer = useCallback(
    (data: FeedbackPinRecord[]) => {
      const scoped = data.filter(pinMatchesPageScope);
      const prevSnap = new Map(
        pinsRef.current.filter(pinMatchesPageScope).map((p) => [p.id, pinActivitySnapshot(p)] as const),
      );

      for (const pin of scoped) {
        if (isPinAuthoredByCurrentUser(pin, userRef.current, guestNameRef.current)) {
          continue;
        }
        const snap = pinActivitySnapshot(pin);
        const prev = prevSnap.get(pin.id);
        if (!prev || prev !== snap) {
          notifyIncomingPin(pin);
        }
      }

      setPins(mergePlacementOverlays(scoped));
    },
    [notifyIncomingPin],
  );

  const loadPins = useCallback(async (options?: { silent?: boolean }) => {
    const scopeKeys = getPageScopeProjectIds();
    const loadScopeSignature = getPageScopeSignature();

    if (!supabase) {
      const seen = new Set<string>();
      const merged: FeedbackPinRecord[] = [];
      for (const key of scopeKeys) {
        for (const pin of loadLocalPins(key)) {
          if (seen.has(pin.id) || !pinMatchesPageScope(pin)) {
            continue;
          }
          seen.add(pin.id);
          merged.push(pin);
        }
      }
      setPins(mergePlacementOverlays(merged));
      setLoadingPins(false);
      return;
    }

    if (!options?.silent) {
      setLoadingPins(true);
    }
    const { data, error } = await supabase
      .from('feedback_pins')
      .select('*')
      .in('project_id', scopeKeys)
      .order('created_at', { ascending: true });

    if (getPageScopeSignature() !== loadScopeSignature) {
      return;
    }

    if (!options?.silent) {
      setLoadingPins(false);
    }
    if (error) {
      console.warn('[ExP-Lab] load pins', error.message);
      if (!options?.silent) {
        setPins([]);
      }
      return;
    }
    applyPinsFromServer(((data ?? []) as FeedbackPinRecord[]).filter(pinMatchesPageScope));
  }, [supabase, applyPinsFromServer]);

  useEffect(() => {
    setPins([]);
    setLoadingPins(true);
    setPendingPin(null);
    setSelectedPin(null);
    setDragRect(null);
    dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
    setReadPinIds(getReadPinIds(projectId));
    setDismissedAlertPinIds(getDismissedAlertPinIds(projectId));
    void loadPins();
  }, [projectId, loadPins]);

  useEffect(() => {
    if (feedbackMode) {
      markAllPinsReadForPage();
    }
  }, [feedbackMode, markAllPinsReadForPage]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const scope = projectIdRef.current;
    const channel = supabase
      .channel(`exp-lab-pins:${encodeURIComponent(scope)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feedback_pins',
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as FeedbackPinRecord | undefined;
          if (!row || !pinMatchesPageScope(row)) {
            return;
          }
          if (payload.eventType === 'DELETE') {
            setPins((prev) => prev.filter((p) => p.id !== row.id));
            return;
          }
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            applyRemotePinChange(row);
          }
          void loadPins({ silent: true });
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn('[ExP-Lab] realtime', err.message);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[ExP-Lab] realtime unavailable; using poll fallback');
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId, loadPins, applyRemotePinChange]);

  /* Poll fallback: Realtime often misses rows when project_id is a full URL. */
  useEffect(() => {
    if (!supabase) {
      return;
    }
    const poll = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void loadPins({ silent: true });
    };
    const intervalId = window.setInterval(poll, PIN_POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadPins({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [supabase, projectId, loadPins]);

  /* Other tabs / windows: refresh local pins when storage updates. */
  useEffect(() => {
    if (supabase) {
      return;
    }
    const scopeKeys = getPageScopeProjectIds();
    const storageKeys = new Set(scopeKeys.map((k) => getLocalFeedbackStorageKey(k)));
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !storageKeys.has(e.key)) {
        return;
      }
      const prevIds = new Set(pinsRef.current.map((p) => p.id));
      const seen = new Set<string>();
      const next: FeedbackPinRecord[] = [];
      for (const key of scopeKeys) {
        for (const pin of loadLocalPins(key)) {
          if (seen.has(pin.id) || !pinMatchesPageScope(pin)) {
            continue;
          }
          seen.add(pin.id);
          next.push(pin);
        }
      }
      for (const pin of next) {
        if (!prevIds.has(pin.id)) {
          notifyIncomingPin(pin);
        }
      }
      setPins(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [supabase, projectId, notifyIncomingPin]);

  const openFeedbackForPin = useCallback(
    (pinId?: string) => {
      setFeedbackMode(true);
      setDragRect(null);
      dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
      if (pinId) {
        const pin = pinsRef.current.find((p) => p.id === pinId);
        if (pin) {
          setPendingPin(null);
          setSelectedPin(pin);
        }
      }
    },
    [],
  );

  const toggleFeedbackMode = useCallback(() => {
    setFeedbackMode((m) => !m);
    setDragRect(null);
    dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
  }, []);

  const leaveFeedbackMode = useCallback(() => {
    setFeedbackMode(false);
    setPendingPin(null);
    setSelectedPin(null);
    setDragRect(null);
    dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable ||
          !!t.closest?.('[role="textbox"]'));

      if (e.key === 'Escape') {
        if (pendingPin || selectedPin) {
          return;
        }
        setFeedbackMode(false);
        setDragRect(null);
        dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
        return;
      }

      if (inField) {
        return;
      }

      /* Physical C key — layout-independent; do not bail on defaultPrevented (other shortcuts often set it first). */
      const isLetterC = e.code === 'KeyC' || e.key === 'c' || e.key === 'C';
      if (isLetterC && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleFeedbackMode();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [toggleFeedbackMode, pendingPin, selectedPin]);

  const openCommentForPending = useCallback((p: PendingPin) => {
    setPendingPin(p);
    setSelectedPin(null);
  }, []);

  const dismissPending = useCallback(() => setPendingPin(null), []);

  const closePinDetail = useCallback(() => setSelectedPin(null), []);

  const openPinDetail = useCallback((pin: FeedbackPinRecord) => {
    setPendingPin(null);
    setSelectedPin(pin);
  }, []);

  const interactionProps = useMemo(() => {
    const onPointerDown = (e: React.PointerEvent) => {
      if (!feedbackMode || e.button !== 0) {
        return;
      }
      const target = e.target as Element | null;
      if (target?.closest?.('.exp-lab-pin-label, .exp-lab-dialog-backdrop, .exp-lab-ui')) {
        return;
      }
      const root = resolveScrollableAnnotationRoot();
      const { x, y } = pointerToRootLocal(e.clientX, e.clientY, root);
      dragRef.current = {
        active: true,
        startX: x,
        startY: y,
        pointerId: e.pointerId,
      };
      setDragRect(null);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (!feedbackMode || !dragRef.current.active || dragRef.current.pointerId !== e.pointerId) {
        return;
      }
      const root = resolveScrollableAnnotationRoot();
      const { x: cx, y: cy } = pointerToRootLocal(e.clientX, e.clientY, root);
      const dx = cx - dragRef.current.startX;
      const dy = cy - dragRef.current.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
        setDragRect(null);
        return;
      }
      const left = Math.min(dragRef.current.startX, cx);
      const top = Math.min(dragRef.current.startY, cy);
      const width = Math.abs(cx - dragRef.current.startX);
      const height = Math.abs(cy - dragRef.current.startY);
      setDragRect({ left, top, width, height });
    };

    const onPointerUp = (e: React.PointerEvent) => {
      if (!feedbackMode || !dragRef.current.active) {
        return;
      }
      if (dragRef.current.pointerId !== e.pointerId) {
        return;
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const root = resolveScrollableAnnotationRoot();
      const { x: cx, y: cy } = pointerToRootLocal(e.clientX, e.clientY, root);
      const dx = cx - dragRef.current.startX;
      const dy = cy - dragRef.current.startY;
      const dist = Math.hypot(dx, dy);

      const { width: surfaceWidth, height: surfaceHeight } = getAnnotationContentSize(root);

      const sx = dragRef.current.startX;
      const sy = dragRef.current.startY;
      const isDrag = dist >= DRAG_THRESHOLD_PX;

      if (isDrag) {
        const left = Math.min(sx, cx);
        const top = Math.min(sy, cy);
        const width = Math.abs(cx - sx);
        const height = Math.abs(cy - sy);
        if (width > 2 && height > 2) {
          const w_pct = (width / surfaceWidth) * 100;
          const h_pct = (height / surfaceHeight) * 100;
          const x_pct = (left / surfaceWidth) * 100;
          const y_pct = (top / surfaceHeight) * 100;
          const rootRect = root.getBoundingClientRect();
          const centerClientX = rootRect.left - root.scrollLeft + left + width / 2;
          const centerClientY = rootRect.top - root.scrollTop + top + height / 2;
          openCommentForPending(
            buildPendingPlacement(centerClientX, centerClientY, { x_pct, y_pct, w_pct, h_pct }),
          );
        }
      } else {
        openCommentForPending(buildPendingPlacement(e.clientX, e.clientY));
      }

      dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
      setDragRect(null);
    };

    return { onPointerDown, onPointerMove, onPointerUp };
  }, [feedbackMode, openCommentForPending]);

  const setGuestName = useCallback((name: string) => {
    setStoredGuestName(name);
    setGuestNameState(name.trim());
  }, []);

  const authorDisplay = useMemo(() => authorFromUser(user), [user]);

  const signInWithGitHub = useCallback(async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: getOAuthRedirectUrl() },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
  }, [supabase]);

  const deletePin = useCallback(
    async (pinId: string) => {
      const scope = projectIdRef.current;
      const pin = resolvePinForThread(pinId, selectedPin, pinsRef.current);
      if (!pin) {
        throw new Error('Pin not found.');
      }
      if (!userRef.current) {
        throw new Error('Sign in with GitHub to delete your feedback.');
      }
      if (!canSignedInUserDeletePin(pin, userRef.current)) {
        throw new Error('Only the pin author can delete this feedback.');
      }

      if (!supabase) {
        if (!isPinAuthoredByCurrentUser(pin, userRef.current, guestNameRef.current)) {
          throw new Error('Only the pin author can delete this feedback.');
        }
        removeLocalPin(scope, pinId);
        setPins(loadLocalPins(scope));
        setSelectedPin(null);
        return;
      }

      const { error } = await supabase.from('feedback_pins').delete().eq('id', pinId);
      if (error) {
        throw new Error(error.message);
      }
      setSelectedPin(null);
      void loadPins();
    },
    [supabase, loadPins, selectedPin],
  );

  const appendPinFeedback = useCallback(
    async (pinId: string, text: string, guestDisplayName?: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error('Enter a comment.');
      }
      const pin = resolvePinForThread(pinId, selectedPin, pins);
      if (!pin) {
        throw new Error('Pin not found.');
      }

      const author = authorFromUser(user);
      let author_name: string | null = author?.name ?? null;
      let author_avatar_url: string | null = author?.avatarUrl ?? null;
      let author_github_id: string | null = author?.githubId ?? null;

      if (!author_name) {
        const g = resolveGuestDisplayName(guestDisplayName, guestName);
        if (!g) {
          throw new Error('Name required');
        }
        author_name = g;
        setGuestName(g);
        author_avatar_url = null;
        author_github_id = null;
      }

      const entry = createThreadEntry(trimmed, {
        name: author_name,
        avatarUrl: author_avatar_url,
        githubId: author_github_id,
      });
      const merged = [...getPinThreadEntries(pin), entry];
      const joined = threadBodiesJoined(merged);

      if (!supabase) {
        appendLocalPinEntry(projectId, pinId, entry);
        const fresh = loadLocalPins(projectId).find((p) => p.id === pinId);
        if (fresh) {
          setSelectedPin(fresh);
        }
        setPins(loadLocalPins(projectId));
        return;
      }

      const { error } = await supabase
        .from('feedback_pins')
        .update({
          comment_entries: merged,
          comment_text: joined,
          author_name: entry.author_name,
          author_avatar_url: entry.author_avatar_url,
          author_github_id: entry.author_github_id,
        })
        .eq('id', pinId);
      if (error) {
        throw new Error(error.message);
      }
      setSelectedPin((prev) =>
        prev && prev.id === pinId
          ? {
              ...prev,
              comment_entries: merged,
              comment_text: joined,
              author_name: entry.author_name,
              author_avatar_url: entry.author_avatar_url,
              author_github_id: entry.author_github_id,
            }
          : prev,
      );
      void loadPins();
    },
    [supabase, projectId, pins, selectedPin, user, guestName, setGuestName, loadPins],
  );

  const updatePinThreadEntry = useCallback(
    async (pinId: string, entryId: string, newBody: string) => {
      const trimmed = newBody.trim();
      if (!trimmed) {
        throw new Error('Enter a comment.');
      }
      const pin = resolvePinForThread(pinId, selectedPin, pins);
      if (!pin) {
        throw new Error('Pin not found.');
      }
      const entries = getPinThreadEntries(pin);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error('Message not found.');
      }

      const guestIdentity = (guestName ?? getStoredGuestName() ?? '').trim() || null;
      if (!canUserEditThreadEntry(entry, authorFromUser(user), guestIdentity)) {
        throw new Error('You can only edit your own messages.');
      }

      const merged = entries.map((e) => (e.id === entryId ? { ...e, body: trimmed } : e));
      const joined = threadBodiesJoined(merged);
      const last = merged[merged.length - 1]!;

      if (!supabase) {
        updateLocalPinEntry(projectId, pinId, entryId, trimmed);
        const fresh = loadLocalPins(projectId).find((p) => p.id === pinId);
        if (fresh) {
          setSelectedPin(fresh);
        }
        setPins(loadLocalPins(projectId));
        return;
      }

      const { error } = await supabase
        .from('feedback_pins')
        .update({
          comment_entries: merged,
          comment_text: joined,
          author_name: last.author_name,
          author_avatar_url: last.author_avatar_url,
          author_github_id: last.author_github_id,
        })
        .eq('id', pinId);
      if (error) {
        throw new Error(error.message);
      }
      setSelectedPin((prev) =>
        prev && prev.id === pinId
          ? {
              ...prev,
              comment_entries: merged,
              comment_text: joined,
              author_name: last.author_name,
              author_avatar_url: last.author_avatar_url,
              author_github_id: last.author_github_id,
            }
          : prev,
      );
      void loadPins();
    },
    [supabase, projectId, pins, selectedPin, user, guestName, loadPins],
  );

  const deletePinThreadEntry = useCallback(
    async (pinId: string, entryId: string) => {
      const pin = resolvePinForThread(pinId, selectedPin, pins);
      if (!pin) {
        throw new Error('Pin not found.');
      }
      const entries = getPinThreadEntries(pin);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error('Message not found.');
      }

      const guestIdentity = (guestName ?? getStoredGuestName() ?? '').trim() || null;
      if (!canUserDeleteThreadEntry(entry, authorFromUser(user), guestIdentity)) {
        throw new Error('You can only delete your own messages.');
      }

      const merged = entries.filter((e) => e.id !== entryId);
      if (merged.length === 0) {
        if (!supabase) {
          removeLocalPin(projectId, pinId);
          setPins(loadLocalPins(projectId));
          setSelectedPin(null);
          return;
        }
        if (!user) {
          throw new Error('Sign in with GitHub to delete your feedback.');
        }
        const { error: deleteError } = await supabase.from('feedback_pins').delete().eq('id', pinId);
        if (deleteError) {
          throw new Error(deleteError.message);
        }
        setSelectedPin(null);
        void loadPins();
        return;
      }

      const joined = threadBodiesJoined(merged);
      const last = merged[merged.length - 1];
      const updatedPin: FeedbackPinRecord = {
        ...pin,
        comment_entries: merged,
        comment_text: joined,
        author_name: last?.author_name ?? pin.author_name,
        author_avatar_url: last?.author_avatar_url ?? pin.author_avatar_url,
        author_github_id: last?.author_github_id ?? pin.author_github_id,
      };

      setSelectedPin((prev) => (prev && prev.id === pinId ? updatedPin : prev));
      setPins((prev) => prev.map((p) => (p.id === pinId ? updatedPin : p)));

      if (!supabase) {
        removeLocalPinEntry(projectId, pinId, entryId);
        const fresh = loadLocalPins(projectId).find((p) => p.id === pinId);
        if (fresh) {
          setSelectedPin(fresh);
        }
        setPins(loadLocalPins(projectId));
        return;
      }

      const { error } = await supabase
        .from('feedback_pins')
        .update({
          comment_entries: merged,
          comment_text: joined,
          author_name: last?.author_name ?? pin.author_name,
          author_avatar_url: last?.author_avatar_url ?? pin.author_avatar_url,
          author_github_id: last?.author_github_id ?? pin.author_github_id,
        })
        .eq('id', pinId);
      if (error) {
        setSelectedPin((prev) => (prev && prev.id === pinId ? pin : prev));
        setPins((prev) => prev.map((p) => (p.id === pinId ? pin : p)));
        throw new Error(error.message);
      }
      void loadPins();
    },
    [supabase, projectId, pins, selectedPin, user, guestName, loadPins],
  );

  const submitComment = useCallback(
    async (text: string, guestDisplayName?: string) => {
      if (!pendingPin) {
        return;
      }
      const pageScope = getPageScopeSignature();
      if (pendingPin.page_scope !== pageScope) {
        throw new Error('You navigated to another page. Place your pin again on this page.');
      }
      const scopeProjectId = getProjectId();
      const author = authorFromUser(user);
      let author_name: string | null = author?.name ?? null;
      let author_avatar_url: string | null = author?.avatarUrl ?? null;
      let author_github_id: string | null = author?.githubId ?? null;

      if (!author_name) {
        const g = resolveGuestDisplayName(guestDisplayName, guestName);
        if (!g) {
          throw new Error('Name required');
        }
        author_name = g;
        setGuestName(g);
        author_avatar_url = null;
        author_github_id = null;
      }

      const entry = createThreadEntry(text.trim(), {
        name: author_name,
        avatarUrl: author_avatar_url,
        githubId: author_github_id,
      });

      const base = {
        project_id: scopeProjectId,
        prototype_url: getCanonicalPrototypeUrl(),
        page_scope: pageScope,
        comment_text: entry.body,
        comment_entries: [entry],
        author_name,
        author_avatar_url,
        author_github_id,
      };

      const placement = {
        coordinate_space: pendingPin.coordinate_space,
        anchor_selector: pendingPin.anchor_selector ?? null,
        anchor_x_pct: pendingPin.anchor_x_pct ?? null,
        anchor_y_pct: pendingPin.anchor_y_pct ?? null,
      };

      const row =
        pendingPin.kind === 'point'
          ? {
              ...base,
              kind: 'point' as FeedbackPinKind,
              x_pct: pendingPin.x_pct,
              y_pct: pendingPin.y_pct,
              w_pct: null,
              h_pct: null,
              ...placement,
            }
          : {
              ...base,
              kind: 'region' as FeedbackPinKind,
              x_pct: pendingPin.x_pct,
              y_pct: pendingPin.y_pct,
              w_pct: pendingPin.w_pct ?? null,
              h_pct: pendingPin.h_pct ?? null,
              ...placement,
            };

      if (!supabase) {
        const record: FeedbackPinRecord = {
          ...row,
          id: createLocalPinId(),
          created_at: new Date().toISOString(),
        };
        appendLocalPin(record);
        setPendingPin(null);
        setReadPinIds(markPinsRead(scopeProjectId, [record.id]));
        setPins(loadLocalPins(scopeProjectId).filter(pinMatchesPageScope));
        return;
      }

      let insertedPlacementStripped = false;
      let { data: inserted, error } = await supabase.from('feedback_pins').insert(row).select().single();
      if (error && /column|schema|unknown/i.test(error.message)) {
        insertedPlacementStripped = true;
        const {
          coordinate_space: _cs,
          anchor_selector: _as,
          anchor_x_pct: _ax,
          anchor_y_pct: _ay,
          page_scope: _ps,
          ...legacyRow
        } = row as typeof row & Record<string, unknown>;
        ({ data: inserted, error } = await supabase.from('feedback_pins').insert(legacyRow).select().single());
      }
      if (error) {
        throw new Error(error.message);
      }
      if (inserted?.id && insertedPlacementStripped) {
        savePinPlacementOverlay(inserted.id, {
          coordinate_space: pendingPin.coordinate_space,
          anchor_selector: pendingPin.anchor_selector ?? null,
          anchor_x_pct: pendingPin.anchor_x_pct ?? null,
          anchor_y_pct: pendingPin.anchor_y_pct ?? null,
          page_scope: pageScope,
        });
      }
      setPendingPin(null);
      if (inserted?.id) {
        setReadPinIds(markPinsRead(scopeProjectId, [inserted.id]));
      }
      void loadPins();
    },
    [pendingPin, supabase, user, guestName, setGuestName, loadPins],
  );

  const value = {
    feedbackMode,
    toggleFeedbackMode,
    leaveFeedbackMode,
    projectId,
    pins,
    loadingPins,
    supabaseReady,
    user,
    authorDisplay,
    guestName,
    setGuestName,
    signInWithGitHub,
    signOut,
    pendingPin,
    openCommentForPending,
    dismissPending,
    submitComment,
    selectedPin,
    openPinDetail,
    closePinDetail,
    appendPinFeedback,
    updatePinThreadEntry,
    deletePinThreadEntry,
    deletePin,
    dragRect,
    syncPinLayerHeight,
    interactionProps,
    persistenceMode,
    unreadCount,
    unreadAlertSummary,
    dismissUnreadAlert,
    openFeedbackForPin,
  };

  return <ExpLabContext.Provider value={value}>{children}</ExpLabContext.Provider>;
}

export function useExpLab(): ExpLabContextValue {
  const ctx = useContext(ExpLabContext);
  if (!ctx) {
    throw new Error('useExpLab must be used within ExpLabProvider');
  }
  return ctx;
}

export function getCanonicalUrl(): string {
  return getCanonicalPrototypeUrl();
}

export type { DragRect, ExpLabContextValue, PendingPin };
