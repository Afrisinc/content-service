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
   */
  async assignPhotos(copy: PostCopy, groupId?: string): Promise<PhotoAssignment> {
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
    const library = groupId && (await this.assets.countForGroup(groupId)) > 0 ? groupId : undefined;

    const photosByIndex: Record<number, string> = {};
    const assetIds: string[] = [];
    const taken = new Set<string>();
    let reused = 0;

    for (const { slide, index } of photoSlides) {
      const chosen = await this.pickPhoto(slide.photoSubjects ?? [], taken, library);

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
        assetIds.push(chosen.id);
      }

      photosByIndex[index] = photoReference(chosen);
    }

    if (reused > 0) {
      logger.info(
        { reused, distinct: assetIds.length, slides: photoSlides.length },
        'Brand asset library too small for a distinct photograph per slide'
      );
    }

    return { photosByIndex, assetIds, reused };
  }

  /**
   * The best photograph available, in descending order of preference:
   * on-subject and unused, any approved and unused, then a repeat.
   *
   * Neither an off-subject photograph nor a repeated one is worth failing a post
   * over — a library with two photo slides and one approved image is the normal
   * state of a young workspace, not an error. Only a genuinely empty library is.
   */
  private async pickPhoto(
    subjects: string[],
    taken: Set<string>,
    groupId?: string
  ): Promise<CandidatePhoto | null> {
    const onSubject = subjects.length ? await this.assets.findCandidates(subjects, groupId) : [];

    const freshOnSubject = onSubject.find(asset => !taken.has(asset.id));
    if (freshOnSubject) {
      return freshOnSubject;
    }

    const anyApproved = await this.assets.findCandidates([], groupId);
    return (
      anyApproved.find(asset => !taken.has(asset.id)) ?? onSubject[0] ?? anyApproved[0] ?? null
    );
  }

  async recordUse(assetIds: string[]): Promise<void> {
    await this.assets.recordUse(assetIds);
  }
}

export const artDirectionService = new ArtDirectionService();
