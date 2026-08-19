export type PostFormatName = 'post' | 'story' | 'single';
export type PostSurface = 'azure' | 'photo' | 'white';
export type EyebrowKind = 'label' | 'claim';
export type SlideAnchor = 'top' | 'centre' | 'bottom';

export interface PostEyebrow {
  text: string;
  kind: EyebrowKind;
}

export interface PostRow {
  title: string;
  body: string;
}

export interface PostAction {
  index: string;
  text: string;
}

export interface PostCta {
  text: string;
  arrow?: boolean;
}

export interface PostSlideSpec {
  surface: PostSurface;
  photo?: string | null;
  eyebrow?: PostEyebrow;
  headline: string[];
  strike_line?: number | null;
  subs?: string[];
  rows?: PostRow[];
  closing?: string | null;
  actions?: PostAction[];
  cta?: PostCta;
  coral_rule?: boolean;
  anchor?: SlideAnchor;
  dense_scrim?: boolean;
  photo_focus?: number;
}

export interface PostSpec {
  slug: string;
  format: PostFormatName;
  slides: PostSlideSpec[];
}

/** What the copy agent returns before art direction assigns surfaces and photography. */
export interface PostCopy {
  slides: PostCopySlide[];
  caption: string;
  hashtags: string[];
  claims: string[];
  concept: string;
}

export interface PostCopySlide {
  role: SlideRole;
  eyebrow: string;
  eyebrowKind: EyebrowKind;
  headline: string[];
  subs?: string[];
  rows?: PostRow[];
  closing?: string;
  cta?: string;
  strikeWord?: string;
  photoSubjects?: string[];
}

export type SlideRole = 'hook' | 'proof' | 'method' | 'differentiator' | 'cta';

export interface PostBriefPayload {
  topic: string;
  format?: PostFormatName;
  serviceLine?: string;
  offer?: string;
  audience?: string;
  slideCount?: number;
  userId?: string;
}

export interface RenderedSlide {
  index: number;
  filename: string;
  surface: PostSurface;
  headline_size: number;
  bytes: number;
}

export interface AuditFinding {
  slide: number;
  rule: string;
  detail: string;
  severity: 'error' | 'warning';
}

export interface RenderResult {
  slug: string;
  format: PostFormatName;
  width: number;
  height: number;
  slides: RenderedSlide[];
  findings: AuditFinding[];
  passed: boolean;
}

export interface SchedulePostPayload {
  platform?: string;
  pageId?: string;
  scheduledAt?: string;
}
