/**
 * Meta Platforms (Facebook/Instagram) types and interfaces
 *
 * IMPORTANT — Graph API constraints these types encode:
 *  - Media CANNOT be attached via POST /{page-id}/feed. The `picture` / `name` /
 *    `caption` / `description` fields were removed from link posts in Graph API v2.9
 *    and are silently ignored. Photos go to /photos, videos go to /videos.
 *  - Media URLs must be publicly fetchable by Meta's servers. Base64 data URIs are
 *    rejected; use a CDN URL, or fall back to a multipart binary upload.
 *  - Multi-photo posts are built by uploading unpublished photos, then referencing
 *    their ids via `attached_media` on /feed. `child_attachments` is link-ad only.
 */

export enum MetaPlatform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
}

/** What kind of Graph API call a transformed payload requires. */
export enum MetaPostKind {
  /** Text and/or link only -> POST /{page-id}/feed */
  FEED = 'feed',
  /** One image -> POST /{page-id}/photos */
  PHOTO = 'photo',
  /** 2+ images -> unpublished /photos uploads, then /feed with attached_media */
  MULTI_PHOTO = 'multi_photo',
  /** One video -> POST /{page-id}/videos */
  VIDEO = 'video',
}

/** Binary media, used when a URL is not publicly reachable by Meta. */
export interface MetaBinaryMedia {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/** A single media item, addressed either by public URL or by binary payload. */
export interface MetaMediaSource {
  /** Publicly fetchable https URL. Preferred — Meta downloads it directly. */
  url?: string;
  /** Binary fallback, uploaded as multipart/form-data. */
  binary?: MetaBinaryMedia;
  /** Accessibility description. Maps to alt_text_custom on Facebook photos. */
  altText?: string;
}

/** POST /{page-id}/feed — text, links, and attached_media references. */
export interface MetaFeedRequest {
  access_token: string;
  message?: string;
  link?: string;
  /** Ids of previously uploaded unpublished photos. */
  attached_media?: MetaAttachedMedia[];
  scheduled_publish_time?: number;
  published?: boolean;
  place?: string;
  targeting?: Record<string, unknown>;
  feed_targeting?: Record<string, unknown>;
}

export interface MetaAttachedMedia {
  media_fbid: string;
}

/** POST /{page-id}/photos */
export interface MetaPhotoRequest {
  access_token: string;
  /** Public image URL. Mutually exclusive with a binary `source` upload. */
  url?: string;
  /**
   * Post text shown with the photo.
   * NOT `message` — that parameter is deprecated on this edge in favour of `caption`.
   */
  caption?: string;
  /** Accessibility alt text. */
  alt_text_custom?: string;
  /** false uploads without publishing, for attached_media composition. */
  published?: boolean;
  /** Short-lived unpublished upload. Requires published=false and forbids scheduling. */
  temporary?: boolean;
  scheduled_publish_time?: number;
  place?: string;
  targeting?: Record<string, unknown>;
}

/** POST /{page-id}/videos */
export interface MetaVideoRequest {
  access_token: string;
  /** Public video URL. Mutually exclusive with a binary `source` upload. */
  file_url?: string;
  title?: string;
  description?: string;
  published?: boolean;
  scheduled_publish_time?: number;
}

/** A fully transformed Facebook request, tagged with the call it needs. */
export interface MetaFacebookPost {
  kind: MetaPostKind;
  feed?: MetaFeedRequest;
  photo?: MetaPhotoRequest;
  video?: MetaVideoRequest;
  /** For MULTI_PHOTO: the images to upload unpublished, in order. */
  photos?: MetaMediaSource[];
  /** For PHOTO/VIDEO: binary fallback when the URL is not public. */
  binary?: MetaBinaryMedia;
}

/**
 * POST /{ig-user-id}/media — Instagram publishes in two steps:
 * create a container, wait for it to finish, then publish it.
 */
export interface InstagramContainerRequest {
  access_token: string;
  image_url?: string;
  video_url?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'REELS' | 'CAROUSEL' | 'STORIES';
  caption?: string;
  /** Self-disclosure of AI usage. Adds Instagram's "AI info" label. */
  is_ai_generated?: boolean;
  /** Marks a container as a carousel child. Children take no caption. */
  is_carousel_item?: boolean;
  /** Child container ids, for media_type=CAROUSEL. */
  children?: string[];
  alt_text?: string;
  location_id?: string;
  thumb_offset?: number;
}

export interface InstagramPublishRequest {
  access_token: string;
  creation_id: string;
}

export interface InstagramContainerStatus {
  id: string;
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
}

/** A fully transformed Instagram request. */
export interface InstagramPost {
  /** Parent container. For carousels, `children` is filled after child creation. */
  container: InstagramContainerRequest;
  /** Carousel children to create before the parent container. */
  childContainers?: InstagramContainerRequest[];
}

export interface MetaPostResponse {
  id: string;
  /** Present on /photos and /videos responses — the id of the resulting feed post. */
  post_id?: string;
  /** Facebook's public link to the post. */
  permalink_url?: string;
  /** Instagram's equivalent — the IG media node names this field `permalink`. */
  permalink?: string;
  created_time?: string;
}

export interface MetaCarouselConfig {
  maxItems: number;
  minItems: number;
  supportedMediaTypes: ('image' | 'video')[];
}

export const META_CAROUSEL_LIMITS: Record<MetaPlatform, MetaCarouselConfig> = {
  [MetaPlatform.FACEBOOK]: {
    maxItems: 10,
    minItems: 2,
    supportedMediaTypes: ['image', 'video'],
  },
  [MetaPlatform.INSTAGRAM]: {
    maxItems: 10,
    minItems: 2,
    supportedMediaTypes: ['image', 'video'],
  },
};

/** Instagram rejects captions longer than this. */
export const INSTAGRAM_CAPTION_MAX_LENGTH = 2200;

/** Facebook truncates the visible post body around this length. */
export const FACEBOOK_MESSAGE_MAX_LENGTH = 63206;
