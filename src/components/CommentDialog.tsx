import { AnimatePresence, motion } from 'framer-motion';
import { Github, MoreVertical, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useExpLab } from '../context/ExpLabContext';
import { getStoredGuestName, resolveGuestDisplayName } from '../lib/storage';
import { isPinAuthoredByCurrentUser } from '../lib/currentAuthor';
import { canUserEditThreadEntry, getPinThreadEntries } from '../lib/pinThread';
import type { AuthorInfo, FeedbackThreadEntry } from '../types';

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

function ThreadEntryOverflowMenu({ onEdit }: { onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="exp-lab-entry-overflow" ref={wrapRef}>
      <button
        type="button"
        className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--icon exp-lab-entry-overflow__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Message actions"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={18} aria-hidden />
      </button>
      {open ? (
        <div className="exp-lab-entry-overflow__panel" role="menu">
          <button
            type="button"
            className="exp-lab-entry-overflow__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

type ThreadEntryRowProps = {
  entry: FeedbackThreadEntry;
  authorDisplay: AuthorInfo | null;
  guestIdentity: string | null;
  isEditing: boolean;
  editDraft: string;
  editError: string | null;
  savingEdit: boolean;
  editTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onStartEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
};

function ThreadEntryRow({
  entry,
  authorDisplay,
  guestIdentity,
  isEditing,
  editDraft,
  editError,
  savingEdit,
  editTextareaRef,
  onStartEdit,
  onEditDraftChange,
  onCancelEdit,
  onSaveEdit,
}: ThreadEntryRowProps) {
  const canEdit = canUserEditThreadEntry(entry, authorDisplay, guestIdentity);

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
          <div className="exp-lab-thread-entry__meta-start">
            <strong>{entry.author_name ?? 'Guest'}</strong>
            <span className="exp-lab-thread-entry__sep" aria-hidden>
              {' '}
              ·{' '}
            </span>
            <time className="exp-lab-thread-entry__time" dateTime={entry.created_at}>
              {new Date(entry.created_at).toLocaleString()}
            </time>
          </div>
          {canEdit && !isEditing ? <ThreadEntryOverflowMenu onEdit={onStartEdit} /> : null}
        </div>
        {isEditing ? (
          <div className="exp-lab-thread-entry__edit">
            <textarea
              ref={editTextareaRef}
              className="exp-lab-thread-entry__edit-textarea"
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              rows={4}
              aria-label="Edit message"
              disabled={savingEdit}
            />
            <div className="exp-lab-thread-entry__edit-actions">
              <button
                type="button"
                className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--sm"
                onClick={onCancelEdit}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="exp-lab-btn exp-lab-btn--primary exp-lab-btn--sm"
                onClick={() => void onSaveEdit()}
                disabled={savingEdit || !editDraft.trim()}
              >
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
            {editError ? (
              <p className="exp-lab-thread-entry__edit-error" role="alert">
                {editError}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="exp-lab-thread-entry__text">{entry.body}</div>
        )}
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
    user,
    guestName,
    setGuestName,
    signInWithGitHub,
    signOut,
    selectedPin,
    closePinDetail,
    leaveFeedbackMode,
    deletePin,
    appendPinFeedback,
    updatePinThreadEntry,
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

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const pendingCommentRef = useRef<HTMLTextAreaElement>(null);
  const appendTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const guestNameRequiredMessage =
    persistenceMode === 'local'
      ? 'Enter your name in the "Your name" field above.'
      : 'Enter your name in the "Your name" field (GitHub sign-in is optional).';

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
      setEditingEntryId(null);
      setEditDraft('');
      setEditError(null);
      return;
    }
    setAppendText('');
    setAppendError(null);
    setEditingEntryId(null);
    setEditDraft('');
    setEditError(null);
  }, [selectedPin?.id]);

  useEffect(() => {
    setDeleteError(null);
    setDeleting(false);
  }, [selectedPin?.id]);

  useLayoutEffect(() => {
    if (!editingEntryId) {
      return;
    }
    editTextareaRef.current?.focus();
  }, [editingEntryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !open) {
        return;
      }
      if (editingEntryId && selectedPin) {
        setEditingEntryId(null);
        setEditDraft('');
        setEditError(null);
        e.preventDefault();
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
  }, [open, pendingPin, selectedPin, editingEntryId, leaveFeedbackMode, closePinDetail]);

  const detail = selectedPin;
  const threadEntries = detail ? getPinThreadEntries(detail) : [];
  const guestIdentity = (guestName ?? getStoredGuestName() ?? '').trim() || null;
  const showDeletePin = detail ? isPinAuthoredByCurrentUser(detail, user, guestName) : false;
  const deletePinRequiresSignIn = showDeletePin && !user;
  const deletePinBusy = deleting || savingAppend || savingEdit;
  const deletePinDisabled = deletePinRequiresSignIn || deletePinBusy;
  const deletePinHint = deletePinRequiresSignIn
    ? 'Sign in with GitHub to delete your feedback.'
    : undefined;

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
      const guestLabel = resolveGuestDisplayName(nameInput, guestName);
      if (!authorDisplay && !guestLabel) {
        throw new Error(guestNameRequiredMessage);
      }
      if (!appendText.trim()) {
        throw new Error('Enter your feedback message.');
      }
      if (!authorDisplay && guestLabel) {
        setGuestName(guestLabel);
      }
      await appendPinFeedback(detail.id, appendText, guestLabel ?? undefined);
      setAppendText('');
    } catch (e) {
      setAppendError(e instanceof Error ? e.message : 'Could not post feedback.');
    } finally {
      setSavingAppend(false);
    }
  };

  const onSaveThreadEdit = async () => {
    if (!detail || !editingEntryId) {
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await updatePinThreadEntry(detail.id, editingEntryId, editDraft);
      setEditingEntryId(null);
      setEditDraft('');
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not save edit.');
    } finally {
      setSavingEdit(false);
    }
  };

  const onSubmit = async () => {
    if (!pendingPin) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const guestLabel = resolveGuestDisplayName(nameInput, guestName);
      if (!authorDisplay && !guestLabel) {
        throw new Error(guestNameRequiredMessage);
      }
      if (!text.trim()) {
        throw new Error('Enter a comment.');
      }
      if (!authorDisplay && guestLabel) {
        setGuestName(guestLabel);
      }
      await submitComment(text, guestLabel ?? undefined);
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
            if (selectedPin && (savingAppend || deleting || savingEdit)) {
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
                      <>
                        <button type="button" className="exp-lab-btn exp-lab-btn--ghost" onClick={() => void signInWithGitHub()}>
                          <Github size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
                          Sign in with GitHub
                        </button>
                        <span style={{ fontSize: 13, color: 'var(--exp-lab-muted)' }}>
                          or enter your name below
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--exp-lab-muted)', marginBottom: 12 }}>
                    {typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io') ? (
                      <>
                        Feedback is saved only in this browser (no server). For sync and GitHub sign-in on this site,
                        the repo maintainer must set Actions secrets <code style={{ fontSize: 12 }}>VITE_SUPABASE_URL</code>{' '}
                        and <code style={{ fontSize: 12 }}>VITE_SUPABASE_ANON_KEY</code> (see{' '}
                        <code style={{ fontSize: 12 }}>.github/workflows/deploy.yml</code> in the hosting repo) and redeploy.
                        For local dev, use <code style={{ fontSize: 12 }}>exp-lab/.env</code> and rebuild.
                      </>
                    ) : (
                      <>
                        Feedback is saved only in this browser (no server). Add Supabase env vars in{' '}
                        <code style={{ fontSize: 12 }}>exp-lab/.env</code> and rebuild if you want sync, GitHub sign-in,
                        and email alerts.
                      </>
                    )}
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
                      required
                      aria-required="true"
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
                <div className="exp-lab-dialog-header-stack">
                  <div className="exp-lab-dialog-header-row exp-lab-dialog-header-row--tight">
                    <h2 id="exp-lab-dialog-title">Feedback</h2>
                    <button
                      type="button"
                      className="exp-lab-btn exp-lab-btn--ghost exp-lab-btn--icon exp-lab-dialog-close"
                      aria-label="Close"
                      onClick={closePinDetail}
                      disabled={deleting || savingAppend || savingEdit}
                    >
                      <X size={20} aria-hidden />
                    </button>
                  </div>

                  {persistenceMode === 'supabase' ? (
                    <div className="exp-lab-author-row exp-lab-author-row--under-title">
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
                    <p className="exp-lab-under-title-note">
                      Local-only mode — thread is stored in this browser.
                    </p>
                  )}
                </div>

                <div className="exp-lab-field exp-lab-field--tight">
                  <div className="exp-lab-thread-list" role="list" aria-label="Feedback messages">
                    {threadEntries.length === 0 ? (
                      <p className="exp-lab-muted-inline" style={{ margin: '8px 0' }}>
                        No messages yet. Add feedback below.
                      </p>
                    ) : (
                      threadEntries.map((entry) => (
                        <div key={entry.id} role="listitem">
                          <ThreadEntryRow
                            entry={entry}
                            authorDisplay={authorDisplay}
                            guestIdentity={guestIdentity}
                            isEditing={editingEntryId === entry.id}
                            editDraft={editingEntryId === entry.id ? editDraft : ''}
                            editError={editingEntryId === entry.id ? editError : null}
                            savingEdit={editingEntryId === entry.id ? savingEdit : false}
                            editTextareaRef={editTextareaRef}
                            onStartEdit={() => {
                              setEditingEntryId(entry.id);
                              setEditDraft(entry.body);
                              setEditError(null);
                            }}
                            onEditDraftChange={setEditDraft}
                            onCancelEdit={() => {
                              setEditingEntryId(null);
                              setEditDraft('');
                              setEditError(null);
                            }}
                            onSaveEdit={onSaveThreadEdit}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {!authorDisplay ? (
                  <div className="exp-lab-field">
                    <label htmlFor="exp-lab-name-detail">Your name</label>
                    <input
                      id="exp-lab-name-detail"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Guest name"
                      autoComplete="name"
                      required
                      aria-required="true"
                    />
                  </div>
                ) : null}

                <div className="exp-lab-field exp-lab-field--tight">
                  <textarea
                    ref={appendTextareaRef}
                    id="exp-lab-comment-append"
                    value={appendText}
                    onChange={(e) => setAppendText(e.target.value)}
                    placeholder="Add response..."
                    aria-label="Add response"
                    rows={4}
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
                  {showDeletePin ? (
                    <span className="exp-lab-delete-pin-wrap" title={deletePinHint}>
                      <button
                        type="button"
                        className="exp-lab-btn exp-lab-btn--danger"
                        onClick={() => void onDeleteDetail()}
                        disabled={deletePinDisabled}
                        aria-label={
                          deletePinRequiresSignIn
                            ? 'Delete pin (sign in with GitHub required)'
                            : 'Delete pin'
                        }
                      >
                        {deleting ? 'Deleting…' : 'Delete pin'}
                      </button>
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="exp-lab-btn exp-lab-btn--primary"
                    onClick={() => void onPostAppend()}
                    disabled={!appendText.trim() || savingAppend || deleting || savingEdit}
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
