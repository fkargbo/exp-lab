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

export type FeedbackPinRecord = {
  id: string;
  project_id: string;
  kind: FeedbackPinKind;
  x_pct: number;
  y_pct: number;
  w_pct: number | null;
  h_pct: number | null;
  comment_text: string;
  prototype_url: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  author_github_id: string | null;
  created_at: string;
};
