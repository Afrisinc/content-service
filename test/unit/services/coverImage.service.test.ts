import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runChatGpt: vi.fn(), get: vi.fn(), resolve: vi.fn() }));

vi.mock('axios', () => ({ default: { get: mocks.get } }));
vi.mock('@/adapters/nodes/nodeServices', () => ({ nodeServices: { tag: 'services' } }));
vi.mock('@/nodes', () => ({ runChatGpt: mocks.runChatGpt }));
vi.mock('@/services/aiCredentials.service', () => ({ resolveChatGptConfig: mocks.resolve }));

const { drawCoverImage } = await import('@/services/coverImage.service');

const options = {
  prompt: 'A quiet harbour at dawn',
  defaultModel: 'gpt-image-1',
  size: '1536x1024',
  quality: 'medium',
  requestId: 'cover:1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ credentials: { apiKey: 'sk' } });
});

describe('drawCoverImage', () => {
  it('asks for the size and quality given, with no response format', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { images: [{ b64Json: 'cG5n' }] } }]);

    await drawCoverImage({ ...options, userId: 'user-1' });

    const call = mocks.runChatGpt.mock.calls[0][0];
    expect(call.credentials).toEqual({ apiKey: 'sk' });
    expect(call.usageContext).toEqual({ requestId: 'cover:1', userId: 'user-1' });
    expect(call.parameters).toEqual({
      resource: 'image',
      operation: 'generate',
      model: 'gpt-image-1',
      prompt: 'A quiet harbour at dawn',
      options: { size: '1536x1024', quality: 'medium' },
    });
  });

  it('prefers the model saved in AI providers over the default', async () => {
    mocks.resolve.mockResolvedValue({ credentials: { apiKey: 'sk' }, model: 'gpt-image-2' });
    mocks.runChatGpt.mockResolvedValue([{ json: { images: [{ b64Json: 'cG5n' }] } }]);

    await drawCoverImage(options);

    expect(mocks.runChatGpt.mock.calls[0][0].parameters.model).toBe('gpt-image-2');
    expect(mocks.resolve).toHaveBeenCalledWith('image');
  });

  it('decodes the image the model returns inline', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { images: [{ b64Json: 'cG5n' }] } }]);

    expect(await drawCoverImage(options)).toEqual(Buffer.from('png'));
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('downloads the image when the model answers with an address instead', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { images: [{ url: 'https://img.test/a.png' }] } }]);
    mocks.get.mockResolvedValue({ data: Buffer.from('png') });

    expect(await drawCoverImage(options)).toEqual(Buffer.from('png'));
    expect(mocks.get).toHaveBeenCalledWith(
      'https://img.test/a.png',
      expect.objectContaining({ responseType: 'arraybuffer', timeout: 30_000 })
    );
  });

  it.each([[[{}]], [[]], [undefined]])(
    'fails when the model returns no image (%j)',
    async images => {
      mocks.runChatGpt.mockResolvedValue([{ json: { images } }]);

      await expect(drawCoverImage(options)).rejects.toThrow('the image model returned no cover');
    }
  );
});
