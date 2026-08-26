import { BrandAssetRepository, brandAssetRepository } from '@/repositories/brandAsset.repository';
import { PostCopy } from '@/types/post.types';
import { BadRequestError } from '@/utils/http-error';
import { logger } from '@/utils/logger';

export interface PhotoAssignment {
  photosByIndex: Record<number, string>;
  assetIds: string[];
  /** How many slides had to share a photograph because the library is small. */
  reused: number;
}

interface CandidatePhoto {
  id: string;
  reference: string;
  url: string;
  subjects: string[];
}

/** Case- and whitespace-insensitive, so "Office" tags a photo an LLM calls "office". */
function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase();
}

/**
 * What the render service resolves the photograph by. It reads files from its own
 * disk, which never holds an image uploaded through this service — so a stored
 * url is sent whenever there is one, and the bare reference only as a fallback
 * for photographs shipped alongside the renderer.
 */
function photoReference(asset: CandidatePhoto): string {
  return asset.url?.trim() || asset.reference;
}

/** Slide roles the arc renders on a photograph. */
const PHOTO_ROLES = new Set(['proof', 'differentiator']);

export class ArtDirectionService {
  constructor(private readonly assets: BrandAssetRepository = brandAssetRepository) {}

  /**
   * @param groupId the brand being published for. Its own library wins; a brand
   * with none falls back to the shared pool.
   * @param assetIds brand asset sets picked by hand for this post — the same
   * ids the asset selector's checkboxes carry. When given, they replace the
   * group's library as the pool every slide draws from.
   */
  async assignPhotos(
    copy: PostCopy,
    userId: string,
    groupId?: string,
    assetIds?: string[]
  ): Promise<PhotoAssignment> {
    // A one-frame post has no proof slide, so the single frame is the photo
    // slide. A pair opens on azure and closes on a photograph, so only its
    // second frame wants one.
    const wantsPhoto = (role: string, total: number, index: number) =>
      total === 1 || (total === 2 ? index === 1 : PHOTO_ROLES.has(role));

    const photoSlides = copy.slides
      .map((slide, index) => ({ slide, index }))
      .filter(entry => wantsPhoto(entry.slide.role, copy.slides.length, entry.index));

    if (!photoSlides.length) {
      return { photosByIndex: {}, assetIds: [], reused: 0 };
    }

    // Resolved once: asking per slide would hit the database for every frame.
    // An explicit selection already is the pool, so the group lookup is skipped.
    const library =
      !assetIds?.length && groupId && (await this.assets.countForGroup(groupId, userId)) > 0
        ? groupId
        : undefined;

    const photosByIndex: Record<number, string> = {};
    const chosenIds: string[] = [];
    const taken = new Set<string>();
    let reused = 0;

    for (const { slide, index } of photoSlides) {
      const chosen = await this.pickPhoto(
        slide.photoSubjects ?? [],
        taken,
        userId,
        library,
        assetIds
      );

      if (!chosen) {
        // A single post reads perfectly well on azure, so a bare library is not fatal.
        if (copy.slides.length <= 2) {
          break;
        }
        throw new BadRequestError(
          'there is no approved photograph in the brand asset library — add one under ' +
            'Settings, mark it approved, and run this again'
        );
      }

      if (taken.has(chosen.id)) {
        reused += 1;
      } else {
        taken.add(chosen.id);
        chosenIds.push(chosen.id);
      }

      photosByIndex[index] = photoReference(chosen);
    }

    if (reused > 0) {
      logger.info(
        { reused, distinct: chosenIds.length, slides: photoSlides.length },
        'Brand asset library too small for a distinct photograph per slide'
      );
    }

    return { photosByIndex, assetIds: chosenIds, reused };
  }

  /**
   * The best photograph available, in descending order of preference:
   * on-subject and unused, any approved and unused, then a repeat.
   *
   * Neither an off-subject photograph nor a repeated one is worth failing a post
   * over — a library with two photo slides and one approved image is the normal
   * state of a young workspace, not an error. Only a genuinely empty library is.
   *
   * The subject match happens here, in application code, rather than as a
   * database filter: tags are typed by hand and the LLM invents its own nouns
   * per slide, so comparing them case- and whitespace-insensitively catches
   * "Office" against "office" that an exact array-overlap filter would miss.
   */
  private async pickPhoto(
    subjects: string[],
    taken: Set<string>,
    userId: string,
    groupId?: string,
    assetIds?: string[]
  ): Promise<CandidatePhoto | null> {
    const pool = await this.assets.findCandidates([], userId, groupId, assetIds);
    const available = pool.filter(asset => !taken.has(asset.id));

    if (subjects.length) {
      const wanted = new Set(subjects.map(normalizeSubject));
      const onSubject = available.find(asset =>
        asset.subjects.some(tag => wanted.has(normalizeSubject(tag)))
      );
      if (onSubject) {
        return onSubject;
      }

      if (pool.length) {
        logger.info(
          { subjects, userId, groupId },
          'No brand asset photograph matched these subjects — using any approved photo instead'
        );
      }
    }

    return available[0] ?? pool[0] ?? null;
  }

  async recordUse(assetIds: string[]): Promise<void> {
    await this.assets.recordUse(assetIds);
  }
}

export const artDirectionService = new ArtDirectionService();
