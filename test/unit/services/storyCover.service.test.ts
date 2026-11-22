import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  draw: vi.fn(),
  upload: vi.fn(),
  setCoverImage: vi.fn(),
  folder: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: {
    STORY_COVER_MODEL: 'gpt-image-1',
    STORY_COVER_SIZE: '1024x1536',
    STORY_COVER_QUALITY: 'medium',
  },
}));
vi.mock('@/services/coverImage.service', () => ({ drawCoverImage: mocks.draw }));
vi.mock('@/repositories/story.repository', () => ({
  storyRepository: { setCoverImage: mocks.setCoverImage },
}));
vi.mock('@/utils/assets-client', () => ({
  getAssetsClient: () => ({ uploadBuffer: mocks.upload }),
  socialMediaFolderId: mocks.folder,
}));

const { StoryCoverService } = await import('@/services/storyCover.service');

const story = {
  id: 'story-1',
  userId: 'user-1',
  title: 'Static',
  premise: 'A radio operator hears a voice from a station that went dark decades ago.',
  genre: 'mystery',
  tone: null,
  coverImageUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.draw.mockResolvedValue(Buffer.from('png'));
  mocks.upload.mockResolvedValue({ url: 'https://cdn.afrisinc.com/story-cover.png' });
  mocks.folder.mockReturnValue('folder-1');
});

describe('StoryCoverService.generate', () => {
  it('draws a portrait book cover from the premise, with the story settings', async () => {
    await new StoryCoverService().generate(story);

    const call = mocks.draw.mock.calls[0][0];
    expect(call).toMatchObject({
      defaultModel: 'gpt-image-1',
      size: '1024x1536',
      quality: 'medium',
      requestId: 'story-cover:story-1',
      userId: 'user-1',
    });
    expect(call.prompt).toContain('A cover for a mystery story');
    expect(call.prompt).toContain('no text, lettering');
  });

  it('stores the picture in the assets folder, tagged as a story cover', async () => {
    await new StoryCoverService().generate(story);

    expect(mocks.upload).toHaveBeenCalledWith(Buffer.from('png'), 'story-cover-story-1.png', {
      folderId: 'folder-1',
      tags: ['story', 'story-cover', 'ai-generated'],
    });
  });

  it('saves the address on the story and returns it', async () => {
    await expect(new StoryCoverService().generate(story)).resolves.toBe(
      'https://cdn.afrisinc.com/story-cover.png'
    );
    expect(mocks.setCoverImage).toHaveBeenCalledWith(
      'story-1',
      'https://cdn.afrisinc.com/story-cover.png'
    );
  });

  it('saves nothing when the assets service returns no address', async () => {
    mocks.upload.mockResolvedValue({});

    await expect(new StoryCoverService().generate(story)).rejects.toThrow('returned no URL');
    expect(mocks.setCoverImage).not.toHaveBeenCalled();
  });

  it('saves nothing when drawing fails', async () => {
    mocks.draw.mockRejectedValue(new Error('image API down'));

    await expect(new StoryCoverService().generate(story)).rejects.toThrow('image API down');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.setCoverImage).not.toHaveBeenCalled();
  });
});

describe('StoryCoverService.ensure', () => {
  it('leaves a story that already has a cover alone', async () => {
    await new StoryCoverService().ensure({ ...story, coverImageUrl: 'https://cdn/x.png' });

    expect(mocks.draw).not.toHaveBeenCalled();
  });

  it('draws a cover for a story that has none', async () => {
    await new StoryCoverService().ensure(story);

    expect(mocks.setCoverImage).toHaveBeenCalledTimes(1);
  });

  it('never throws, so a failed cover cannot stop an episode being written', async () => {
    mocks.draw.mockRejectedValue(new Error('image API down'));

    await expect(new StoryCoverService().ensure(story)).resolves.toBeUndefined();
    expect(mocks.setCoverImage).not.toHaveBeenCalled();
  });
});
