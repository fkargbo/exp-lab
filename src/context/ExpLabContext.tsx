import type { User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AuthorInfo, FeedbackPinKind, FeedbackPinRecord } from '../types';
import { getCanonicalPrototypeUrl, getProjectId } from '../lib/projectId';
import {
  appendLocalPin,
  appendLocalPinEntry,
  createLocalPinId,
  getLocalFeedbackStorageKey,
  loadLocalPins,
  removeLocalPin,
} from '../lib/localFeedbackStore';
import { createThreadEntry, getPinThreadEntries, threadBodiesJoined } from '../lib/pinThread';
import { getStoredGuestName, setStoredGuestName } from '../lib/storage';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

const DRAG_THRESHOLD_PX = 6;

type PendingPin =
  | {
      kind: 'point';
      x_pct: number;
      y_pct: number;
    }
  | {
      kind: 'region';
      x_pct: number;
      y_pct: number;
      w_pct: number;
      h_pct: number;
    };

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
  submitComment: (text: string) => Promise<void>;
  selectedPin: FeedbackPinRecord | null;
  openPinDetail: (pin: FeedbackPinRecord) => void;
  closePinDetail: () => void;
  /** Append a new thread message on an existing pin (Supabase or local storage). */
  appendPinFeedback: (pinId: string, text: string) => Promise<void>;
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

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    pointerId: number | null;
  }>({ active: false, startX: 0, startY: 0, pointerId: null });
  const [dragRect, setDragRect] = useState<DragRect | null>(null);

  const projectId = useMemo(() => getProjectId(), []);
  const supabase = getSupabase();
  const supabaseReady = isSupabaseConfigured() && supabase !== null;
  const persistenceMode: 'supabase' | 'local' = supabase ? 'supabase' : 'local';

  const syncPinLayerHeight = useCallback(() => {
    const h = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      document.documentElement.clientHeight,
    );
    for (const id of ['exp-lab-pin-root', 'exp-lab-interaction-root'] as const) {
      const el = document.getElementById(id);
      if (el) {
        el.style.height = `${h}px`;
      }
    }
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

  const loadPins = useCallback(async () => {
    if (!supabase) {
      setPins(loadLocalPins(projectId));
      return;
    }
    setLoadingPins(true);
    const { data, error } = await supabase
      .from('feedback_pins')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    setLoadingPins(false);
    if (error) {
      console.warn('[ExP-Lab] load pins', error.message);
      setPins([]);
      return;
    }
    setPins((data ?? []) as FeedbackPinRecord[]);
  }, [supabase, projectId]);

  useEffect(() => {
    void loadPins();
  }, [loadPins]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const channel = supabase
      .channel(`exp-lab-pins:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feedback_pins',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void loadPins();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId, loadPins]);

  /* Other tabs / windows: refresh local pins when storage updates. */
  useEffect(() => {
    if (supabase) {
      return;
    }
    const key = getLocalFeedbackStorageKey(projectId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        setPins(loadLocalPins(projectId));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [supabase, projectId]);

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

  const docMetrics = useCallback(() => {
    const scrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
      window.innerWidth,
    );
    const scrollHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight,
    );
    return { scrollWidth, scrollHeight };
  }, []);

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
      dragRef.current = {
        active: true,
        startX: e.clientX + window.scrollX,
        startY: e.clientY + window.scrollY,
        pointerId: e.pointerId,
      };
      setDragRect(null);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (!feedbackMode || !dragRef.current.active || dragRef.current.pointerId !== e.pointerId) {
        return;
      }
      const cx = e.clientX + window.scrollX;
      const cy = e.clientY + window.scrollY;
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

      const cx = e.clientX + window.scrollX;
      const cy = e.clientY + window.scrollY;
      const dx = cx - dragRef.current.startX;
      const dy = cy - dragRef.current.startY;
      const dist = Math.hypot(dx, dy);

      const { scrollWidth, scrollHeight } = docMetrics();

      const sx = dragRef.current.startX;
      const sy = dragRef.current.startY;
      const isDrag = dist >= DRAG_THRESHOLD_PX;

      if (isDrag) {
        const left = Math.min(sx, cx);
        const top = Math.min(sy, cy);
        const width = Math.abs(cx - sx);
        const height = Math.abs(cy - sy);
        if (width > 2 && height > 2) {
          const w_pct = (width / scrollWidth) * 100;
          const h_pct = (height / scrollHeight) * 100;
          const x_pct = (left / scrollWidth) * 100;
          const y_pct = (top / scrollHeight) * 100;
          openCommentForPending({ kind: 'region', x_pct, y_pct, w_pct, h_pct });
        }
      } else {
        const x_pct = (cx / scrollWidth) * 100;
        const y_pct = (cy / scrollHeight) * 100;
        openCommentForPending({ kind: 'point', x_pct, y_pct });
      }

      dragRef.current = { active: false, startX: 0, startY: 0, pointerId: null };
      setDragRect(null);
    };

    return { onPointerDown, onPointerMove, onPointerUp };
  }, [feedbackMode, docMetrics, openCommentForPending]);

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
      options: { redirectTo: window.location.href },
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
      if (!supabase) {
        removeLocalPin(projectId, pinId);
        setPins(loadLocalPins(projectId));
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
    [supabase, projectId, loadPins],
  );

  const appendPinFeedback = useCallback(
    async (pinId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error('Enter a comment.');
      }
      const pin = pins.find((p) => p.id === pinId) ?? (selectedPin?.id === pinId ? selectedPin : undefined);
      if (!pin) {
        throw new Error('Pin not found.');
      }

      const author = authorFromUser(user);
      let author_name: string | null = author?.name ?? null;
      let author_avatar_url: string | null = author?.avatarUrl ?? null;
      let author_github_id: string | null = author?.githubId ?? null;

      if (!author_name) {
        const g = guestName?.trim() || getStoredGuestName()?.trim();
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

  const submitComment = useCallback(
    async (text: string) => {
      if (!pendingPin) {
        return;
      }
      const author = authorFromUser(user);
      let author_name: string | null = author?.name ?? null;
      let author_avatar_url: string | null = author?.avatarUrl ?? null;
      let author_github_id: string | null = author?.githubId ?? null;

      if (!author_name) {
        const g = guestName?.trim() || getStoredGuestName()?.trim();
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
        project_id: projectId,
        prototype_url: getCanonicalPrototypeUrl(),
        comment_text: entry.body,
        comment_entries: [entry],
        author_name,
        author_avatar_url,
        author_github_id,
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
            }
          : {
              ...base,
              kind: 'region' as FeedbackPinKind,
              x_pct: pendingPin.x_pct,
              y_pct: pendingPin.y_pct,
              w_pct: pendingPin.w_pct,
              h_pct: pendingPin.h_pct,
            };

      if (!supabase) {
        const record: FeedbackPinRecord = {
          ...row,
          id: createLocalPinId(),
          created_at: new Date().toISOString(),
        };
        appendLocalPin(record);
        setPendingPin(null);
        setPins(loadLocalPins(projectId));
        return;
      }

      const { error } = await supabase.from('feedback_pins').insert(row);
      if (error) {
        throw new Error(error.message);
      }
      setPendingPin(null);
      void loadPins();
    },
    [pendingPin, supabase, user, guestName, projectId, setGuestName, loadPins],
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
    deletePin,
    dragRect,
    syncPinLayerHeight,
    interactionProps,
    persistenceMode,
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
