import { AnimatePresence, motion } from 'framer-motion';
import { Github, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useExpLab } from '../context/ExpLabContext';
import { getPinThreadEntries } from '../lib/pinThread';
import type { FeedbackThreadEntry } from '../types';

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

function ThreadEntryRow({ entry }: { entry: FeedbackThreadEntry }) {
  return (
    <div className="exp-lab-thread-entry">
      <div className="exp-lab-thread-entry__avatar">
        {entry.author_avatar_url ? (
          <img src={entry.author_avatar_url} alt="" width={36} height={36} />
        ) : (
          <span className="exp-lab-thread-entry__initials" aria-hidden>
            {initials(entry.author_name)}
          </span>
        )}
      </div>
      <div className="exp-lab-thread-entry__main">
        <div className="exp-lab-thread-entry__meta">
          <strong>{entry.author_name ?? 'Guest'}</strong>
          {entry.author_github_id ? (
            <span className="exp-lab-thread-entry__handle"> · @{entry.author_github_id}</span>
          ) : null}
          <time className="exp-lab-thread-entry__time" dateTime={entry.created_at}>
            {new Date(entry.created_at).toLocaleString()}
          </time>
        </div>
        <div className="exp-lab-thread-entry__text">{entry.body}</div>
      </div>
    </div>
  );
}

export function CommentDialog() {
  const {
    pendingPin,
    submitComment,
    persistenceMode,
    authorDisplay,
    guestName,
    setGuestName,
    signInWithGitHub,
    signOut,
    selectedPin,
    closePinDetail,
    leaveFeedbackMode,
    deletePin,
    appendPinFeedback,
  } = useExpLab();

  const [text, setText] = useState('');
  const [nameInput, setNameInput] = useState(guestName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [appendText, setAppendText] = useState('');
  const [savingAppend, setSavingAppend] = useState(false);
  const [appendError, setAppendError] = useState<string | null>(null);

  const pendingCommentRef = useRef<HTMLTextAreaElement>(null);
  const appendTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const open = Boolean(pendingPin) || Boolean(selectedPin);

  useEffect(() => {
    if (pendingPin) {
      setText('');
      setError(null);
      setNameInput(guestName ?? '');
    }
  }, [pendingPin, guestName]);

  useEffect(() => {
    if (!selectedPin) {
      setAppendText('');
      return;
    }
    setAppendText('');
    setAppendError(null);
  }, [selectedPin?.id]);

  useEffect(() => {
    setDeleteError(null);
    setDeleting(false);
  }, [selectedPin?.id]);

  useLayoutEffect(() => {
    if (!pendingPin) {
      return;
    }
    const el = pendingCommentRef.current;
    if (!el) {
      return;
    }
    el.focus();
  }, [pendingPin]);

  useLayoutEffect(() => {
    if (!selectedPin) {
      return;
    }
    appendTextareaRef.current?.focus();
  }, [selectedPin?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !open) {
        return;
      }
      if (pendingPin) {
        leaveFeedbackMode();
      } else if (selectedPin) {
        closePinDetail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pendingPin, selectedPin, leaveFeedbackMode, closePinDetail]);

  const detail = selectedPin;
  const threadEntries = detail ? getPinThreadEntries(detail) : [];

  const onDeleteDetail = async () => {
    if (!detail) {
      return;
    }
    if (!window.confirm('Delete this pin and all feedback on it? This cannot be undone.')) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePin(detail.id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete feedback.');
    } finally {
      setDeleting(false);
    }
  };

  const onPostAppend = async () => {
    if (!detail) {
      return;
    }
    setSavingAppend(true);
    setAppendError(null);
    try {
      if (!authorDisplay && !(nameInput.trim() || guestName?.trim())) {
        throw new Error(
          persistenceMode === 'local' ? 'Enter your name.' : 'Enter your name or sign in with GitHub.',
        );
      }
      if (!appendText.trim()) {
        throw new Error('Enter your feedback message.');
      }
      if (!authorDisplay && nameInput.trim()) {
        setGuestName(nameInput.trim());
      }
      await appendPinFeedback(detail.id, appendText);
      setAppendText('');
    } catch (e) {
      setAppendError(e instanceof Error ? e.message : 'Could not post feedback.');
    } finally {
      setSavingAppend(false);
    }
  };

  const onSubmit = async () => {
    if (!pendingPin) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!authorDisplay && !(nameInput.trim() || guestName?.trim())) {
        throw new Error(
          persistenceMode === 'local' ? 'Enter your name.' : 'Enter your name or sign in with GitHub.',
        );
      }
      if (!text.trim()) {
        throw new Error('Enter a comment.');
      }
      if (!authorDisplay && nameInput.trim()) {
        setGuestName(nameInput.trim());
      }
      await submitComment(text);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save comment.');
    } finally {
      setSaving(false);
    }
  };

  const dialogClose = () => {
    if (pendingPin) {
      leaveFeedbackMode();
    } else if (selectedPin) {
      closePinDetail();
    }
  };

  const dialogTree = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="dlg"
          className="exp-lab-dialog-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e: MouseEvent) => {
            if (e.target !== e.currentTarget) {
              return;
            }
            if (pendingPin && saving) {
              return;
            }
            if (selectedPin && (savingAppend || deleting)) {
              return;
            }
            dialogClose();
          }}
        >
          <motion.div
            className="exp-lab-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exp-lab-dialog-title"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onMouseDown={(e: MouseEvent) => e.stopPropagation()}
          >
            {pendingPin ? (
              <>
                <div className="exp-lab-dialog-header-row exp-lab-dialog-header-row--tight">
                  <h2 id="exp-lab-dialog-title">Feedback</h2>
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--icon exp-lab-dialog-close"
                    aria-label="Close"
                    onClick={() => leaveFeedbackMode()}
                    disabled={saving}
                  >
                    <X size={20} aria-hidden />
                  </button>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--exp-lab-muted)' }}>
                  {pendingPin.kind === 'region' ? 'Area highlight' : 'Pin'} · Project{' '}
                  <code>{window.location.pathname}</code>
                </p>

                {persistenceMode === 'supabase' ? (
                  <div className="exp-lab-author-row">
                    {authorDisplay ? (
                      <>
                        {authorDisplay.avatarUrl ? (
                          <img
                            src={authorDisplay.avatarUrl}
                            alt=""
                            width={28}
                            height={28}
                            style={{ borderRadius: '50%' }}
                          />
                        ) : null}
                        <span>
                          Signed in as <strong>{authorDisplay.name}</strong>
                        </span>
                        <button type="button" className="exp-lab-btn exp-lab-btn--link" onClick={() => void signOut()}>
                          Sign out
                        </button>
                      </>
                    ) : (
                      <button type="button" className="exp-lab-btn exp-lab-btn--ghost" onClick={() => void signInWithGitHub()}>
                        <Github size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                        Sign in with GitHub
                      </button>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--exp-lab-muted)', marginBottom: 12 }}>
                    Feedback is saved only in this browser (no server). Add Supabase env vars in{' '}
                    <code style={{ fontSize: 12 }}>exp-lab</code> if you want sync, GitHub sign-in, and email alerts.
                  </p>
                )}

                {!authorDisplay ? (
                  <div className="exp-lab-field">
                    <label htmlFor="exp-lab-name">Your name</label>
                    <input
                      id="exp-lab-name"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Guest name"
                      autoComplete="name"
                    />
                  </div>
                ) : null}

                <div className="exp-lab-field">
                  <label htmlFor="exp-lab-comment">Comment</label>
                  <textarea
                    ref={pendingCommentRef}
                    id="exp-lab-comment"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Share your thoughts..."
                  />
                </div>

                {error ? (
                  <p style={{ color: '#c9190b', fontSize: 13, marginTop: 8 }} role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="exp-lab-actions">
                  <button type="button" className="exp-lab-btn exp-lab-btn--primary" onClick={() => void onSubmit()} disabled={saving}>
                    {saving ? 'Saving…' : 'Post feedback'}
                  </button>
                </div>
              </>
            ) : null}

            {detail ? (
              <>
                <div className="exp-lab-dialog-header-row exp-lab-dialog-header-row--tight">
                  <h2 id="exp-lab-dialog-title">Feedback</h2>
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--icon exp-lab-dialog-close"
                    aria-label="Close"
                    onClick={closePinDetail}
                    disabled={deleting || savingAppend}
                  >
                    <X size={20} aria-hidden />
                  </button>
                </div>

                <p className="exp-lab-detail-meta" style={{ marginTop: 0 }}>
                  Pin placed {new Date(detail.created_at).toLocaleString()}
                </p>

                <div className="exp-lab-field exp-lab-field--tight">
                  <span className="exp-lab-field-label">Feedback thread</span>
                  <div className="exp-lab-thread-list" role="list">
                    {threadEntries.length === 0 ? (
                      <p className="exp-lab-muted-inline" style={{ margin: '8px 0' }}>
                        No messages yet. Add feedback below.
                      </p>
                    ) : (
                      threadEntries.map((entry) => (
                        <div key={entry.id} role="listitem">
                          <ThreadEntryRow entry={entry} />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {persistenceMode === 'supabase' ? (
                  <div className="exp-lab-author-row">
                    {authorDisplay ? (
                      <>
                        {authorDisplay.avatarUrl ? (
                          <img
                            src={authorDisplay.avatarUrl}
                            alt=""
                            width={28}
                            height={28}
                            style={{ borderRadius: '50%' }}
                          />
                        ) : null}
                        <span>
                          Adding as <strong>{authorDisplay.name}</strong>
                        </span>
                        <button type="button" className="exp-lab-btn exp-lab-btn--link" onClick={() => void signOut()}>
                          Sign out
                        </button>
                      </>
                    ) : (
                      <button type="button" className="exp-lab-btn exp-lab-btn--ghost" onClick={() => void signInWithGitHub()}>
                        <Github size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                        Sign in with GitHub
                      </button>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--exp-lab-muted)', marginBottom: 12 }}>
                    Local-only mode — thread is stored in this browser.
                  </p>
                )}

                {!authorDisplay ? (
                  <div className="exp-lab-field">
                    <label htmlFor="exp-lab-name-detail">Your name</label>
                    <input
                      id="exp-lab-name-detail"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Guest name"
                      autoComplete="name"
                    />
                  </div>
                ) : null}

                <div className="exp-lab-field">
                  <label htmlFor="exp-lab-comment-append">Add feedback</label>
                  <textarea
                    ref={appendTextareaRef}
                    id="exp-lab-comment-append"
                    value={appendText}
                    onChange={(e) => setAppendText(e.target.value)}
                    placeholder="Write a message for this thread…"
                  />
                </div>

                {appendError ? (
                  <p style={{ color: '#c9190b', fontSize: 13, marginTop: 8 }} role="alert">
                    {appendError}
                  </p>
                ) : null}
                {deleteError ? (
                  <p style={{ color: '#c9190b', fontSize: 13, marginTop: 8 }} role="alert">
                    {deleteError}
                  </p>
                ) : null}

                <div className="exp-lab-actions-detail exp-lab-actions-detail--end">
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--danger"
                    onClick={() => void onDeleteDetail()}
                    disabled={deleting || savingAppend}
                  >
                    {deleting ? 'Deleting…' : 'Delete pin'}
                  </button>
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--primary"
                    onClick={() => void onPostAppend()}
                    disabled={!appendText.trim() || savingAppend || deleting}
                  >
                    {savingAppend ? 'Posting…' : 'Post feedback'}
                  </button>
                </div>
              </>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(dialogTree, document.body);
}
