import { BrandAssetRepository, brandAssetRepository } from '@/repositories/brandAsset.repository';
import { PostCopy } from '@/types/post.types';
import { BadRequestError } from '@/utils/http-error';

export interface PhotoAssignment {
  photosByIndex: Record<number, string>;
  assetIds: string[];
}

/** Slide roles the arc renders on a photograph. */
const PHOTO_ROLES = new Set(['proof', 'differentiator']);

export class ArtDirectionService {
  constructor(private readonly assets: BrandAssetRepository = brandAssetRepository) {}

  async assignPhotos(copy: PostCopy): Promise<PhotoAssignment> {
    // A one-frame post has no proof slide, so the single frame is the photo slide.
    const wantsPhoto = (role: string, total: number) => total === 1 || PHOTO_ROLES.has(role);

    const photoSlides = copy.slides
      .map((slide, index) => ({ slide, index }))
      .filter(entry => wantsPhoto(entry.slide.role, copy.slides.length));

    if (!photoSlides.length) {
      return { photosByIndex: {}, assetIds: [] };
    }

    const photosByIndex: Record<number, string> = {};
    const assetIds: string[] = [];
    const taken = new Set<string>();

    for (const { slide, index } of photoSlides) {
      const candidates = await this.assets.findCandidates(slide.photoSubjects ?? []);
      const chosen = candidates.find(asset => !taken.has(asset.id));

      if (!chosen) {
        // A single post reads perfectly well on azure, so a bare library is not fatal.
        if (copy.slides.length === 1) {
          break;
        }
        throw new BadRequestError(
          `no approved photograph is available for the ${slide.role} slide — add one to the brand asset library`
        );
      }

      taken.add(chosen.id);
      assetIds.push(chosen.id);
      photosByIndex[index] = chosen.reference;
    }

    return { photosByIndex, assetIds };
  }

  async recordUse(assetIds: string[]): Promise<void> {
    await this.assets.recordUse(assetIds);
  }
}

export const artDirectionService = new ArtDirectionService();
