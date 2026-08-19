import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeNode } from '@/nodes/claude/claude.node';
import { runClaude, streamClaude } from '@/nodes/claude';
import { REFUSAL_FALLBACK_BETA } from '@/nodes/claude/claude.constants';
import type { ClaudeCredentials, IClaudeClient } from '@/nodes/claude/claude.types';
import type { INodeExecutionContext } from '@/nodes/core';

const credentials: ClaudeCredentials = { apiKey: 'sk-ant-test' };

const message = (text: string, extra: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: {
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 5,
    cache_creation_input_tokens: 0,
    output_tokens_details: { thinking_tokens: 8 },
    iterations: null,
  },
  ...extra,
});

function buildClient() {
  return {
    message: vi.fn(async () => message('Hello there')),
    messageStream: vi.fn(),
    fileMetadata: vi.fn(async (fileId: string) => ({
      id: fileId,
      filename: 'slide-01.png',
      mime_type: 'image/png',
      size_bytes: 2048,
    })),
    downloadFile: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
  };
}

const codeExecutionReply = (fileIds: string[], stdout = 'saved 1 file') =>
  message('Here are your slides', {
    content: [
      { type: 'text', text: 'Here are your slides' },
      {
        type: 'bash_code_execution_tool_result',
        content: {
          type: 'bash_code_execution_result',
          stdout,
          stderr: '',
          return_code: 0,
          content: fileIds.map(file_id => ({ type: 'bash_code_execution_output', file_id })),
        },
      },
    ],
  });

let client: ReturnType<typeof buildClient>;
let factory: ReturnType<typeof vi.fn>;
let node: ClaudeNode;
let logger: {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  client = buildClient();
  factory = vi.fn(() => client as unknown as IClaudeClient);
  node = new ClaudeNode({ clientFactory: factory as never });
  logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
});

const run = (parameters: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  runClaude({ node, credentials, logger, parameters, ...extra });

const sentBody = () => client.message.mock.calls[0][0] as Record<string, unknown>;

describe('ClaudeNode text:message', () => {
  it('sends system top-level, history first, and enables refusal fallback', async () => {
    const output = await run({
      resource: 'text',
      operation: 'message',
      systemPrompt: 'Be brief',
      messages: [{ role: 'user', content: 'earlier' }],
      prompt: 'Say hi',
    });

    expect(sentBody()).toEqual({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: 'Be brief',
      messages: [
        { role: 'user', content: 'earlier' },
        { role: 'user', content: 'Say hi' },
      ],
      betas: [REFUSAL_FALLBACK_BETA],
      fallbacks: 'default',
    });
    expect(output[0].json).toMatchObject({
      resource: 'text',
      operation: 'message',
      content: 'Hello there',
      stopReason: 'end_turn',
      refused: false,
      servedByFallback: false,
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 5,
        thinkingTokens: 8,
        totalTokens: 125,
      },
    });
  });

  it('omits sampling and thinking configuration unless it was asked for', async () => {
    await run({ resource: 'text', operation: 'message', prompt: 'Say hi' });

    const body = sentBody();
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('output_config');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
  });

  it('maps the options it is given onto the request', async () => {
    await run({
      resource: 'text',
      operation: 'message',
      prompt: 'Say hi',
      options: {
        thinking: 'adaptive',
        thinkingDisplay: 'summarized',
        effort: 'max',
        stopSequences: ['END'],
        cachePrompt: true,
        temperature: 0.5,
        userId: 'user-1',
      },
    });

    expect(sentBody()).toMatchObject({
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'max' },
      stop_sequences: ['END'],
      cache_control: { type: 'ephemeral' },
      temperature: 0.5,
      metadata: { user_id: 'user-1' },
    });
  });

  it('disables thinking when asked', async () => {
    await run({
      resource: 'text',
      operation: 'message',
      prompt: 'Say hi',
      options: { thinking: 'disabled' },
    });

    expect(sentBody().thinking).toEqual({ type: 'disabled' });
  });

  it('drops the fallback beta when the caller turns it off', async () => {
    await run({
      resource: 'text',
      operation: 'message',
      prompt: 'Say hi',
      refusalFallback: false,
    });

    const body = sentBody();
    expect(body).not.toHaveProperty('betas');
    expect(body).not.toHaveProperty('fallbacks');
  });

  it('requests a schema-constrained reply and returns it parsed', async () => {
    client.message.mockResolvedValue(message('{"headline":"Ship it"}'));
    const schema = { type: 'object', properties: { headline: { type: 'string' } } };

    const output = await run({
      resource: 'text',
      operation: 'message',
      prompt: 'Write a headline',
      jsonSchema: schema,
    });

    expect(sentBody().output_config).toEqual({ format: { type: 'json_schema', schema } });
    expect(output[0].json.parsed).toEqual({ headline: 'Ship it' });
  });

  it('fails the item when a schema was requested but the reply is not JSON', async () => {
    client.message.mockResolvedValue(message('not json'));

    await expect(
      run({
        resource: 'text',
        operation: 'message',
        prompt: 'x',
        jsonSchema: { type: 'object' },
      })
    ).rejects.toThrow('Claude did not return valid JSON');
  });

  it('reports a safety decline as data instead of throwing', async () => {
    client.message.mockResolvedValue(
      message('', {
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: 'no' },
      })
    );

    const output = await run({ resource: 'text', operation: 'message', prompt: 'x' });

    expect(output[0].json).toMatchObject({
      refused: true,
      refusalCategory: 'cyber',
      content: '',
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('flags a reply that a fallback model produced', async () => {
    client.message.mockResolvedValue(
      message('rescued', {
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens_details: null,
          iterations: [{ type: 'fallback_message' }],
        },
      })
    );

    const output = await run({ resource: 'text', operation: 'message', prompt: 'x' });

    expect(output[0].json.servedByFallback).toBe(true);
  });

  it('returns the untouched API response when simplification is off', async () => {
    const output = await run({
      resource: 'text',
      operation: 'message',
      prompt: 'Say hi',
      simplifyOutput: false,
    });

    expect(output[0].json.response).toMatchObject({ id: 'msg_1' });
    expect(output[0].json).not.toHaveProperty('content');
  });

  it('rejects history that the Messages API would not accept', async () => {
    const parameters = { resource: 'text', operation: 'message', prompt: 'x' };

    await expect(
      run({ ...parameters, messages: [{ role: 'system', content: 'hi' }] })
    ).rejects.toThrow('role of user or assistant');
    await expect(run({ ...parameters, messages: '"plain"' })).rejects.toThrow(
      'must be an array of { role, content } objects'
    );
  });

  it('reuses one client across the items of a batch', async () => {
    await run(
      {
        resource: 'text',
        operation: 'message',
        prompt: (item: { json: { q: string } }) => item.json.q,
      },
      { items: [{ json: { q: 'one' } }, { json: { q: 'two' } }] }
    );

    expect(factory).toHaveBeenCalledTimes(1);
    expect(client.message).toHaveBeenCalledTimes(2);
  });
});

describe('ClaudeNode text:classify', () => {
  it('constrains the answer to the supplied categories', async () => {
    client.message.mockResolvedValue(
      message('{"category":"billing","confidence":0.92,"reasoning":"mentions an invoice"}')
    );

    const output = await run({
      resource: 'text',
      operation: 'classify',
      input: 'My invoice is wrong',
      categories: ['billing', 'technical'],
    });

    const body = sentBody();
    expect(body.max_tokens).toBe(1024);
    expect(body.output_config).toMatchObject({
      format: {
        type: 'json_schema',
        schema: expect.objectContaining({
          properties: expect.objectContaining({
            category: { type: 'string', enum: ['billing', 'technical'] },
          }),
        }),
      },
    });
    expect(output[0].json).toMatchObject({
      category: 'billing',
      confidence: 0.92,
      reasoning: 'mentions an invoice',
    });
  });

  it('requires at least one category', async () => {
    await expect(
      run({ resource: 'text', operation: 'classify', input: 'x', categories: [''] })
    ).rejects.toThrow('must contain at least one non-empty string');
  });
});

describe('ClaudeNode image:analyze', () => {
  it('sends URLs and data URIs as the right source blocks, images first', async () => {
    const output = await run({
      resource: 'image',
      operation: 'analyze',
      prompt: 'What is this?',
      imageUrls: ['https://img/1.png', 'data:image/jpeg;base64,QUJD'],
    });

    expect(sentBody().messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: 'https://img/1.png' } },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
          { type: 'text', text: 'What is this?' },
        ],
      },
    ]);
    expect(output[0].json).toMatchObject({ imageCount: 2, content: 'Hello there' });
  });

  it('rejects an image source it cannot send', async () => {
    await expect(
      run({
        resource: 'image',
        operation: 'analyze',
        prompt: 'x',
        imageUrls: ['/local/file.png'],
      })
    ).rejects.toThrow('must be an http(s) URL or a base64 data URI');
  });
});

describe('ClaudeNode streaming', () => {
  it('yields text deltas and ignores everything else on the stream', async () => {
    client.messageStream.mockResolvedValue(
      (async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } };
        yield { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } };
        yield { type: 'message_stop' };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of streamClaude({
      node,
      credentials,
      parameters: { resource: 'text', operation: 'message', prompt: 'Say hi' },
    })) {
      chunks.push(chunk);
    }

    expect(client.messageStream.mock.calls[0][0]).toMatchObject({ stream: true });
    expect(chunks.join('')).toBe('Hello');
  });

  it('refuses to stream an operation that cannot stream', async () => {
    const iterator = streamClaude({
      node,
      credentials,
      parameters: {
        resource: 'image',
        operation: 'analyze',
        prompt: 'x',
        imageUrls: ['https://img/1.png'],
      },
    });

    await expect(iterator.next()).rejects.toThrow('"image:analyze" cannot be streamed');
  });
});

describe('ClaudeNode guards', () => {
  it('rejects a resource and operation pair it has no handler for', async () => {
    const parameters: Record<string, unknown> = { resource: 'text', operation: 'summarize' };
    const context = {
      getInputData: () => [{ json: {} }],
      getItem: () => ({ json: {} }),
      getItemIndex: () => 0,
      getNodeParameter: (name: string, fallback?: unknown) => parameters[name] ?? fallback,
      getAllParameters: () => parameters,
      getCredentials: () => credentials,
      continueOnFail: () => false,
      logger,
    } as unknown as INodeExecutionContext;

    await expect(node.execute(context)).rejects.toThrow('Unsupported operation "text:summarize"');
  });

  it('turns a failing item into an error item when continueOnFail is set', async () => {
    client.message.mockRejectedValue(new Error('upstream down'));

    const output = await run(
      { resource: 'text', operation: 'message', prompt: 'Say hi' },
      { continueOnFail: true }
    );

    expect(output[0].error).toMatchObject({ message: 'upstream down' });
  });
});

describe('ClaudeNode file:generate', () => {
  it('runs the sandbox tool and returns the produced files as binary', async () => {
    client.message.mockResolvedValue(codeExecutionReply(['file_abc']));

    const output = await run({
      resource: 'file',
      operation: 'generate',
      prompt: 'Make five 1080x1350 social slides',
    });

    const body = sentBody();
    expect(body.tools).toEqual([{ type: 'code_execution_20260521', name: 'code_execution' }]);
    expect(body.betas).toEqual([
      'code-execution-2025-08-25',
      'files-api-2025-04-14',
      REFUSAL_FALLBACK_BETA,
    ]);
    expect(body).not.toHaveProperty('container');

    expect(client.fileMetadata).toHaveBeenCalledWith('file_abc', undefined);
    expect(client.downloadFile).toHaveBeenCalledWith('file_abc', undefined);
    expect(output[0].json).toMatchObject({
      resource: 'file',
      operation: 'generate',
      fileCount: 1,
      stdout: 'saved 1 file',
      files: [
        { fileId: 'file_abc', fileName: 'slide-01.png', mediaType: 'image/png', sizeBytes: 2048 },
      ],
    });
    expect(output[0].binary?.['slide-01.png']).toEqual({
      data: 'iVBORw==',
      mimeType: 'image/png',
      fileName: 'slide-01.png',
    });
  });

  it('loads Agent Skills into the container when asked', async () => {
    client.message.mockResolvedValue(codeExecutionReply([]));

    await run({
      resource: 'file',
      operation: 'generate',
      prompt: 'Build a deck',
      skills: [{ skillId: 'pptx', type: 'anthropic', version: 'latest' }],
    });

    const body = sentBody();
    expect(body.container).toEqual({
      skills: [{ skill_id: 'pptx', type: 'anthropic', version: 'latest' }],
    });
    expect(body.betas).toContain('skills-2025-10-02');
  });

  it('rejects a skill entry with no id', async () => {
    await expect(
      run({
        resource: 'file',
        operation: 'generate',
        prompt: 'Build a deck',
        skills: [{ type: 'anthropic' }],
      })
    ).rejects.toThrow('"skills" entries need a skillId');
  });

  it('resumes a paused sandbox turn and keeps files from every turn', async () => {
    client.message
      .mockResolvedValueOnce({
        ...codeExecutionReply(['file_1'], 'rendering'),
        stop_reason: 'pause_turn',
      })
      .mockResolvedValueOnce(codeExecutionReply(['file_2'], 'done'));

    const output = await run({
      resource: 'file',
      operation: 'generate',
      prompt: 'Render a long deck',
    });

    expect(client.message).toHaveBeenCalledTimes(2);
    const resumed = client.message.mock.calls[1][0] as { messages: unknown[] };
    expect(resumed.messages).toHaveLength(2);
    expect(output[0].json.fileCount).toBe(2);
    expect(output[0].json.stdout).toBe('rendering\ndone');
  });

  it('keeps only the file ids when downloading is turned off', async () => {
    client.message.mockResolvedValue(codeExecutionReply(['file_abc']));

    const output = await run({
      resource: 'file',
      operation: 'generate',
      prompt: 'Make a chart',
      downloadFiles: false,
    });

    expect(client.downloadFile).not.toHaveBeenCalled();
    expect(output[0].binary).toEqual({});
    expect(output[0].json.fileCount).toBe(1);
  });

  it('falls back to the file id when the model names a file unusably', async () => {
    client.message.mockResolvedValue(codeExecutionReply(['file_xyz']));
    client.fileMetadata.mockResolvedValue({
      id: 'file_xyz',
      filename: '../../etc/passwd',
      mime_type: 'text/plain',
      size_bytes: 10,
    });

    const output = await run({ resource: 'file', operation: 'generate', prompt: 'x' });

    expect(output[0].json.files).toEqual([
      { fileId: 'file_xyz', fileName: 'passwd', mediaType: 'text/plain', sizeBytes: 10 },
    ]);
  });

  it('reports a declined generation without downloading anything', async () => {
    client.message.mockResolvedValue(
      message('', {
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: 'no' },
      })
    );

    const output = await run({ resource: 'file', operation: 'generate', prompt: 'x' });

    expect(output[0].json).toMatchObject({ refused: true, files: [] });
    expect(client.downloadFile).not.toHaveBeenCalled();
  });
});
