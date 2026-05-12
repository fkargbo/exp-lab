import { AnimatePresence, motion } from 'framer-motion';
import { Github, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useExpLab } from '../context/ExpLabContext';

function buildMergedComment(
  savedComment: string,
  editingOriginal: boolean,
  originalDraft: string,
  appendText: string,
): string {
  const saved = savedComment.trim();
  const base = editingOriginal ? originalDraft.trim() : saved;
  const append = appendText.trim();
  if (append && base) {
    return `${base}\n\n${append}`;
  }
  if (append) {
    return append;
  }
  return base;
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
    updatePinComment,
  } = useExpLab();

  const [text, setText] = useState('');
  const [nameInput, setNameInput] = useState(guestName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [editingOriginal, setEditingOriginal] = useState(false);
  const [originalDraft, setOriginalDraft] = useState('');
  const [appendText, setAppendText] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const pendingCommentRef = useRef<HTMLTextAreaElement>(null);
  const appendTextareaRef = useRef<HTMLTextAreaElement>(null);
  const originalEditRef = useRef<HTMLTextAreaElement>(null);

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
      setOriginalDraft('');
      setAppendText('');
      setEditingOriginal(false);
      return;
    }
    setOriginalDraft(selectedPin.comment_text ?? '');
    setAppendText('');
    setEditingOriginal(false);
    setDetailError(null);
  }, [selectedPin?.id]);

  useEffect(() => {
    if (!selectedPin || editingOriginal) {
      return;
    }
    setOriginalDraft(selectedPin.comment_text ?? '');
  }, [selectedPin?.comment_text, selectedPin, editingOriginal]);

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
    if (editingOriginal) {
      const el = originalEditRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
      return;
    }
    const el = appendTextareaRef.current;
    if (el) {
      el.focus();
    }
  }, [selectedPin?.id, editingOriginal]);

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
  const savedComment = detail?.comment_text ?? '';
  const mergedPreview =
    detail !== null ? buildMergedComment(savedComment, editingOriginal, originalDraft, appendText) : '';
  const detailDirty = detail !== null && mergedPreview.trim() !== savedComment.trim();

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

  const onSaveDetail = async () => {
    if (!detail) {
      return;
    }
    const merged = buildMergedComment(savedComment, editingOriginal, originalDraft, appendText);
    const trimmed = merged.trim();
    if (!trimmed) {
      setDetailError('Enter feedback in the field below, or use Edit to change existing text.');
      return;
    }
    setSavingDetail(true);
    setDetailError(null);
    try {
      await updatePinComment(detail.id, trimmed);
      setAppendText('');
      setEditingOriginal(false);
      setOriginalDraft(trimmed);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setSavingDetail(false);
    }
  };

  const onCancelEditOriginal = () => {
    if (!detail) {
      return;
    }
    setEditingOriginal(false);
    setOriginalDraft(detail.comment_text ?? '');
    requestAnimationFrame(() => {
      appendTextareaRef.current?.focus();
    });
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
            if (selectedPin && (savingDetail || deleting)) {
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
                    disabled={deleting || savingDetail}
                  >
                    <X size={20} aria-hidden />
                  </button>
                </div>

                <div className="exp-lab-author-row">
                  {detail.author_avatar_url ? (
                    <img src={detail.author_avatar_url} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />
                  ) : null}
                  <span>
                    <strong>{detail.author_name ?? 'Guest'}</strong>
                    {detail.author_github_id ? ` · @${detail.author_github_id}` : null}
                  </span>
                </div>

                <div className="exp-lab-field exp-lab-field--tight">
                  <span className="exp-lab-field-label">Existing feedback</span>
                  {editingOriginal ? (
                    <div className="exp-lab-original-edit-wrap">
                      <textarea
                        ref={originalEditRef}
                        id="exp-lab-comment-original"
                        className="exp-lab-textarea-compact"
                        value={originalDraft}
                        onChange={(e) => setOriginalDraft(e.target.value)}
                        aria-label="Edit existing feedback"
                      />
                      <button type="button" className="exp-lab-btn exp-lab-btn--link exp-lab-btn--inline" onClick={onCancelEditOriginal}>
                        Cancel edit
                      </button>
                    </div>
                  ) : (
                    <div className="exp-lab-feedback-body-row">
                      <div className="exp-lab-feedback-readonly" id="exp-lab-feedback-readonly">
                        {savedComment.trim() ? savedComment : <span className="exp-lab-muted-inline">No comment text yet.</span>}
                      </div>
                      <button
                        type="button"
                        className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--sm"
                        onClick={() => setEditingOriginal(true)}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  <p className="exp-lab-detail-meta">Posted {new Date(detail.created_at).toLocaleString()}</p>
                </div>

                <div className="exp-lab-field">
                  <label htmlFor="exp-lab-comment-append">Add more feedback</label>
                  <textarea
                    ref={appendTextareaRef}
                    id="exp-lab-comment-append"
                    value={appendText}
                    onChange={(e) => setAppendText(e.target.value)}
                    placeholder="Type additional notes here…"
                  />
                </div>

                {detailError ? (
                  <p style={{ color: '#c9190b', fontSize: 13, marginTop: 8 }} role="alert">
                    {detailError}
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
                    disabled={deleting || savingDetail}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--primary"
                    onClick={() => void onSaveDetail()}
                    disabled={!detailDirty || savingDetail || deleting || !mergedPreview.trim()}
                  >
                    {savingDetail ? 'Saving…' : 'Save changes'}
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
