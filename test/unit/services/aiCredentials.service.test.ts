import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  claudeFromEnv: vi.fn(),
  chatGptFromEnv: vi.fn(),
}));

vi.mock('@/services/aiProviderConfig.service', () => ({
  aiProviderConfigService: { resolve: mocks.resolve },
}));
vi.mock('@/nodes', () => ({
  claudeCredentialsFromEnv: mocks.claudeFromEnv,
  chatGptCredentialsFromEnv: mocks.chatGptFromEnv,
}));

const { resolveChatGptConfig, resolveClaudeConfig } =
  await import('@/services/aiCredentials.service');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claudeFromEnv.mockReturnValue({ apiKey: 'env-anthropic' });
  mocks.chatGptFromEnv.mockReturnValue({ apiKey: 'env-openai' });
});

describe('resolveClaudeConfig', () => {
  it('uses the stored config and its model when one exists', async () => {
    mocks.resolve.mockResolvedValue({
      apiKey: 'db-anthropic',
      baseUrl: 'https://gw.example',
      model: 'claude-sonnet-5-5',
    });

    const config = await resolveClaudeConfig();

    expect(mocks.resolve).toHaveBeenCalledWith('anthropic', 'text');
    expect(config).toEqual({
      credentials: { apiKey: 'db-anthropic', baseUrl: 'https://gw.example' },
      model: 'claude-sonnet-5-5',
    });
    expect(mocks.claudeFromEnv).not.toHaveBeenCalled();
  });

  it('falls back to the environment when nothing is stored', async () => {
    mocks.resolve.mockResolvedValue(null);

    expect(await resolveClaudeConfig()).toEqual({ credentials: { apiKey: 'env-anthropic' } });
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });

  it('reuses the shared text key for another purpose but not its model', async () => {
    mocks.resolve.mockResolvedValueOnce(null).mockResolvedValueOnce({
      apiKey: 'db-anthropic',
      model: 'claude-sonnet-5-5',
    });

    const config = await resolveClaudeConfig('summary');

    expect(mocks.resolve).toHaveBeenNthCalledWith(1, 'anthropic', 'summary');
    expect(mocks.resolve).toHaveBeenNthCalledWith(2, 'anthropic', 'text');
    expect(config.credentials.apiKey).toBe('db-anthropic');
    expect(config.model).toBeUndefined();
  });

  it('prefers the purpose-specific config over the shared one', async () => {
    mocks.resolve.mockResolvedValueOnce({ apiKey: 'db-summary', model: 'claude-haiku-4-5' });

    const config = await resolveClaudeConfig('summary');

    expect(config.model).toBe('claude-haiku-4-5');
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });

  it('falls back to the environment when neither purpose nor text is stored', async () => {
    mocks.resolve.mockResolvedValue(null);

    expect(await resolveClaudeConfig('summary')).toEqual({
      credentials: { apiKey: 'env-anthropic' },
    });
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });
});

describe('resolveChatGptConfig', () => {
  it('maps organization and project from the stored config', async () => {
    mocks.resolve.mockResolvedValue({
      apiKey: 'db-openai',
      organizationId: 'org-1',
      projectId: 'proj-1',
      model: 'gpt-4o',
    });

    expect(await resolveChatGptConfig()).toEqual({
      credentials: {
        apiKey: 'db-openai',
        baseUrl: undefined,
        organizationId: 'org-1',
        projectId: 'proj-1',
      },
      model: 'gpt-4o',
    });
    expect(mocks.resolve).toHaveBeenCalledWith('openai', 'text');
  });

  it('falls back to the environment when nothing is stored', async () => {
    mocks.resolve.mockResolvedValue(null);

    expect(await resolveChatGptConfig('image')).toEqual({ credentials: { apiKey: 'env-openai' } });
  });
});
