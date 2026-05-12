import { AnimatePresence, motion } from 'framer-motion';
import { Github } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useExpLab } from '../context/ExpLabContext';

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
  } = useExpLab();

  const [text, setText] = useState('');
  const [nameInput, setNameInput] = useState(guestName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

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
    setDeleteError(null);
    setDeleting(false);
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

  const onDeleteDetail = async () => {
    if (!detail) {
      return;
    }
    if (!window.confirm('Delete this feedback? This cannot be undone.')) {
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

  const detail = selectedPin;

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
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              if (pendingPin) {
                leaveFeedbackMode();
              } else if (selectedPin) {
                closePinDetail();
              }
            }
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
            onMouseDown={(e) => e.stopPropagation()}
          >
            {pendingPin ? (
              <>
                <h2 id="exp-lab-dialog-title">Feedback</h2>
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
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--ghost"
                    onClick={() => leaveFeedbackMode()}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button type="button" className="exp-lab-btn exp-lab-btn--primary" onClick={() => void onSubmit()} disabled={saving}>
                    {saving ? 'Saving…' : 'Post feedback'}
                  </button>
                </div>
              </>
            ) : null}

            {detail ? (
              <>
                <h2 id="exp-lab-dialog-title">Feedback</h2>
                <div className="exp-lab-author-row">
                  {detail.author_avatar_url ? (
                    <img src={detail.author_avatar_url} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />
                  ) : null}
                  <span>
                    <strong>{detail.author_name ?? 'Guest'}</strong>
                    {detail.author_github_id ? ` · @${detail.author_github_id}` : null}
                  </span>
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{detail.comment_text || '—'}</p>
                <p style={{ fontSize: 12, color: 'var(--exp-lab-muted)', marginTop: 12 }}>
                  {new Date(detail.created_at).toLocaleString()}
                </p>
                {deleteError ? (
                  <p style={{ color: '#c9190b', fontSize: 13, marginTop: 8 }} role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="exp-lab-actions exp-lab-actions--split">
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--danger"
                    onClick={() => void onDeleteDetail()}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button type="button" className="exp-lab-btn exp-lab-btn--primary" onClick={closePinDetail} disabled={deleting}>
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  /* Portal outside Shadow DOM — pointer-events:none on the host was blocking real clicks on inputs. */
  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(dialogTree, document.body);
}
