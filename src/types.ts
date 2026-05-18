export type FeedbackPinKind = 'point' | 'region';

export type SelectionBoxPct = {
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
};

export type AuthorInfo = {
  name: string;
  avatarUrl: string | null;
  githubId: string | null;
};

/** One message on a pin thread (multiple users / timestamps per pin). */
export type FeedbackThreadEntry = {
  id: string;
  body: string;
  author_name: string | null;
  author_avatar_url: string | null;
  author_github_id: string | null;
  created_at: string;
};

export type FeedbackPinRecord = {
  id: string;
  project_id: string;
  kind: FeedbackPinKind;
  x_pct: number;
  y_pct: number;
  w_pct: number | null;
  h_pct: number | null;
  /** Denormalized join of thread bodies; kept for search / legacy. Prefer `comment_entries`. */
  comment_text: string;
  /** When present and non-empty, authoritative thread; otherwise derive from `comment_text` + pin author. */
  comment_entries?: FeedbackThreadEntry[] | null;
  prototype_url: string | null;
  /** Original pin author; also updated to latest poster for simple consumers (e.g. map tint). */
  author_name: string | null;
  author_avatar_url: string | null;
  author_github_id: string | null;
  created_at: string;
};
