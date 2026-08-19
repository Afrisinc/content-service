import {
  choiceOption,
  modelProperty,
  numberOption,
  optionsProperty,
  promptProperty,
  simplifyProperty,
  stringOption,
  type IDisplayOptions,
  type INodeDescription,
  type INodeProperty,
} from '../core';
import {
  CLAUDE_CREDENTIALS_NAME,
  CLAUDE_MODEL_OPTIONS,
  CLAUDE_NODE_NAME,
  CODE_EXECUTION_TOOL_OPTIONS,
  DEFAULT_CODE_EXECUTION_TOOL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  EFFORT_OPTIONS,
  THINKING_OPTIONS,
} from './claude.constants';

const forOperations = (...operations: string[]): IDisplayOptions => ({
  show: { operation: operations },
});

const ALL_OPERATIONS: IDisplayOptions = {};

export const claudeProperties: INodeProperty[] = [
  {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    default: 'text',
    required: true,
    options: [
      { name: 'Text', value: 'text', description: 'Messages and classification' },
      { name: 'Image', value: 'image', description: 'Describe or answer questions about images' },
      {
        name: 'File',
        value: 'file',
        description: 'Have Claude write and run code to produce images and documents',
      },
    ],
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    default: 'message',
    required: true,
    displayOptions: { show: { resource: ['text'] } },
    options: [
      { name: 'Message', value: 'message', description: 'Send a prompt and get a reply' },
      { name: 'Classify', value: 'classify', description: 'Sort text into your own categories' },
    ],
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    default: 'analyze',
    required: true,
    displayOptions: { show: { resource: ['image'] } },
    options: [{ name: 'Analyze', value: 'analyze', description: 'Ask about one or more images' }],
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    default: 'generate',
    required: true,
    displayOptions: { show: { resource: ['file'] } },
    options: [
      {
        name: 'Generate',
        value: 'generate',
        description: "Run code in Anthropic's sandbox and return the files it produces",
      },
    ],
  },

  modelProperty(ALL_OPERATIONS, CLAUDE_MODEL_OPTIONS, DEFAULT_MODEL, 'Claude model to answer with'),
  {
    displayName: 'Max Tokens',
    name: 'maxTokens',
    type: 'number',
    default: DEFAULT_MAX_TOKENS,
    required: true,
    typeOptions: { minValue: 1, maxValue: 128000 },
    description: 'Required by the API. Values above ~32000 need streaming to avoid a timeout',
  },
  {
    displayName: 'Refusal Fallback',
    name: 'refusalFallback',
    type: 'boolean',
    default: true,
    description:
      'Let the API re-run a safety-declined request on another model inside the same call',
  },
  {
    ...simplifyProperty(ALL_OPERATIONS),
    displayOptions: { hide: { operation: ['classify'] } },
  },

  {
    displayName: 'System Prompt',
    name: 'systemPrompt',
    type: 'string',
    default: '',
    description: 'Instruction that frames how Claude should answer',
    displayOptions: forOperations('message', 'generate'),
  },
  promptProperty(
    forOperations('message', 'analyze', 'generate'),
    'What to ask Claude. For a file, describe the artefact you want produced'
  ),
  {
    displayName: 'Previous Messages',
    name: 'messages',
    type: 'json',
    default: [],
    description: 'Earlier turns as [{ "role": "user", "content": "..." }], sent before the prompt',
    displayOptions: forOperations('message'),
  },
  {
    displayName: 'JSON Schema',
    name: 'jsonSchema',
    type: 'json',
    default: {},
    description: 'JSON Schema for a structured reply; the parsed object lands in `parsed`',
    displayOptions: forOperations('message'),
  },

  {
    displayName: 'Input',
    name: 'input',
    type: 'string',
    default: '',
    required: true,
    description: 'Text to classify',
    displayOptions: forOperations('classify'),
  },
  {
    displayName: 'Categories',
    name: 'categories',
    type: 'json',
    default: [],
    required: true,
    description: 'The categories to choose between, as an array of strings',
    displayOptions: forOperations('classify'),
  },

  {
    displayName: 'Image URLs',
    name: 'imageUrls',
    type: 'json',
    default: [],
    required: true,
    description: 'Image URLs or data URIs to send, as an array',
    displayOptions: forOperations('analyze'),
  },

  {
    displayName: 'Skills',
    name: 'skills',
    type: 'json',
    default: [],
    description:
      'Agent Skills to load, as [{ "skillId": "pptx", "type": "anthropic" }] — needed for ' +
      'Office documents',
    displayOptions: forOperations('generate'),
  },
  {
    displayName: 'Download Files',
    name: 'downloadFiles',
    type: 'boolean',
    default: true,
    description: 'Fetch the produced bytes onto the item. Turn off to keep only the file ids',
    displayOptions: forOperations('generate'),
  },
  {
    ...choiceOption(
      'Code Execution Tool',
      'codeExecutionTool',
      CODE_EXECUTION_TOOL_OPTIONS,
      DEFAULT_CODE_EXECUTION_TOOL,
      'Pin the sandbox tool version'
    ),
    displayOptions: forOperations('generate'),
  },

  optionsProperty(ALL_OPERATIONS, [
    choiceOption(
      'Thinking',
      'thinking',
      THINKING_OPTIONS,
      'adaptive',
      'Omit to use the model default — thinking is already adaptive on Claude Opus 5'
    ),
    choiceOption(
      'Thinking Display',
      'thinkingDisplay',
      [
        { name: 'Summarized', value: 'summarized' },
        { name: 'Omitted', value: 'omitted' },
      ],
      'summarized',
      'Summarized returns a readable summary of the reasoning'
    ),
    choiceOption(
      'Effort',
      'effort',
      EFFORT_OPTIONS,
      'high',
      'Depth and token spend. Rejected by models older than Opus 4.5'
    ),
    {
      displayName: 'Stop Sequences',
      name: 'stopSequences',
      type: 'json',
      default: [],
      description: 'Strings that end the reply, as an array',
    },
    {
      displayName: 'Cache Prompt',
      name: 'cachePrompt',
      type: 'boolean',
      default: false,
      description: 'Cache the request prefix — repeated long context costs ~90% less',
    },
    numberOption('Temperature', 'temperature', 'Legacy models only; current models reject it', {
      minValue: 0,
      maxValue: 1,
    }),
    numberOption('Top P', 'topP', 'Legacy models only; current models reject it', {
      minValue: 0,
      maxValue: 1,
    }),
    stringOption('End User ID', 'userId', 'Stable id sent as request metadata'),
  ]),
];

export const claudeDescription: INodeDescription = {
  displayName: 'Claude',
  name: CLAUDE_NODE_NAME,
  version: 1,
  group: ['transform'],
  description:
    'Send prompts, classify text, analyze images, and generate files with Anthropic Claude',
  defaults: { name: 'Claude' },
  inputs: ['main'],
  outputs: ['main'],
  credentials: [{ name: CLAUDE_CREDENTIALS_NAME, required: true }],
  properties: claudeProperties,
  memory: { historyParameter: 'messages', promptParameter: 'prompt', replyField: 'content' },
};
