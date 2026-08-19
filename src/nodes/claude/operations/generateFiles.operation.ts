import type Anthropic from '@anthropic-ai/sdk';
import type { INodeBinary, INodeExecutionContext, INodeItem, JsonObject } from '../../core';
import {
  CLAUDE_OPERATION,
  CLAUDE_RESOURCE,
  CODE_EXECUTION_BETA,
  DEFAULT_CODE_EXECUTION_TOOL,
  FILES_BETA,
  MAX_SERVER_TOOL_TURNS,
  SKILLS_BETA,
} from '../claude.constants';
import type { IClaudeClient } from '../claude.types';
import { asJson, buildMessageBody, fail, simplifiedMessage, textFrom } from './shared';

interface GeneratedFile extends JsonObject {
  fileId: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
}

/** Claude writes files into the sandbox; each one comes back as an output block reference. */
function fileIdsFrom(message: Anthropic.Beta.BetaMessage): string[] {
  const ids: string[] = [];

  for (const block of message.content) {
    if (block.type !== 'bash_code_execution_tool_result') {
      continue;
    }

    const result = block.content;
    if (result.type !== 'bash_code_execution_result' || !result.content) {
      continue;
    }

    for (const reference of result.content) {
      if (reference.type === 'bash_code_execution_output') {
        ids.push(reference.file_id);
      }
    }
  }

  return ids;
}

function stdoutFrom(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter(block => block.type === 'bash_code_execution_tool_result')
    .map(block => {
      const result = (block as Anthropic.Beta.BetaBashCodeExecutionToolResultBlock).content;
      return result.type === 'bash_code_execution_result' ? result.stdout : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Only the base name is kept: a file name is chosen by the model, not by us. */
function safeName(fileName: string, fallbackId: string): string {
  const base = fileName.split(/[\\/]/).pop()?.trim();
  return base && base !== '.' && base !== '..' ? base : fallbackId;
}

function skillsFrom(context: INodeExecutionContext): Anthropic.Beta.BetaSkillParams[] {
  const raw = context.getNodeParameter<unknown[]>('skills', []);

  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  return raw.map(entry => {
    const skill = entry as { skillId?: string; type?: string; version?: string };
    if (!skill?.skillId) {
      return fail('"skills" entries need a skillId', context.getItemIndex());
    }
    return {
      skill_id: skill.skillId,
      type: skill.type === 'custom' ? 'custom' : 'anthropic',
      ...(skill.version ? { version: skill.version } : {}),
    } as Anthropic.Beta.BetaSkillParams;
  });
}

export async function executeGenerateFiles(
  client: IClaudeClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const skills = skillsFrom(context);
  const toolType = context.getNodeParameter<string>(
    'codeExecutionTool',
    DEFAULT_CODE_EXECUTION_TOOL
  );
  const systemPrompt = context.getNodeParameter<string>('systemPrompt', '');

  const body = buildMessageBody(context, {
    messages: [{ role: 'user', content: context.getNodeParameter<string>('prompt') }],
    system: systemPrompt || undefined,
    tools: [{ type: toolType, name: 'code_execution' } as Anthropic.Beta.BetaToolUnion],
    ...(skills.length > 0 ? { container: { skills } } : {}),
    betas: [CODE_EXECUTION_BETA, FILES_BETA, ...(skills.length > 0 ? [SKILLS_BETA] : [])],
  });

  const conversation = [...body.messages];
  const fileIds: string[] = [];
  const transcript: string[] = [];

  let message = await client.message(body, context.signal);
  let turn = 0;

  // A long sandbox run pauses instead of finishing; resuming is what keeps the files.
  while (message.stop_reason === 'pause_turn' && turn < MAX_SERVER_TOOL_TURNS) {
    fileIds.push(...fileIdsFrom(message));
    transcript.push(stdoutFrom(message));
    conversation.push({ role: 'assistant', content: message.content });
    message = await client.message({ ...body, messages: conversation }, context.signal);
    turn += 1;
  }

  fileIds.push(...fileIdsFrom(message));
  transcript.push(stdoutFrom(message));

  const simplified = simplifiedMessage(message);
  const base = {
    resource: CLAUDE_RESOURCE.FILE,
    operation: CLAUDE_OPERATION.GENERATE,
    model: message.model,
  };

  if (simplified.refused) {
    context.logger.warn(
      { category: simplified.refusalCategory },
      '[claude] file generation was declined by the safety classifier'
    );
    return [{ json: { ...base, ...simplified, files: [] } }];
  }

  const download = context.getNodeParameter<boolean>('downloadFiles', true);
  const files: GeneratedFile[] = [];
  const binary: Record<string, INodeBinary> = {};

  for (const fileId of fileIds) {
    const metadata = await client.fileMetadata(fileId, context.signal);
    const fileName = safeName(metadata.filename, fileId);
    files.push({
      fileId,
      fileName,
      mediaType: metadata.mime_type,
      sizeBytes: metadata.size_bytes,
    });

    if (download) {
      const bytes = await client.downloadFile(fileId, context.signal);
      binary[fileName] = {
        data: Buffer.from(bytes).toString('base64'),
        mimeType: metadata.mime_type,
        fileName,
      };
    }
  }

  if (!context.getNodeParameter<boolean>('simplifyOutput', true)) {
    return [{ json: { ...base, response: asJson(message), files }, binary }];
  }

  return [
    {
      json: {
        ...base,
        content: textFrom(message),
        stdout: transcript.filter(Boolean).join('\n'),
        files,
        fileCount: files.length,
        usage: simplified.usage,
      },
      binary,
    },
  ];
}
