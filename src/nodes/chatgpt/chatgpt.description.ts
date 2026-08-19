import {
  modelProperty,
  numberOption,
  optionsProperty,
  promptProperty,
  showFor,
  simplifyProperty,
  stringOption,
  type INodeDescription,
  type INodeProperty,
} from '../core';
import {
  CHATGPT_CREDENTIALS_NAME,
  CHATGPT_NODE_NAME,
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_MODERATION_MODEL,
  DEFAULT_VISION_MODEL,
  EMBEDDING_MODEL_OPTIONS,
  IMAGE_MODEL_OPTIONS,
} from './chatgpt.constants';

const TEXT_MESSAGE = showFor('text', 'message');
const TEXT_CLASSIFY = showFor('text', 'classify');
const IMAGE_GENERATE = showFor('image', 'generate');
const IMAGE_ANALYZE = showFor('image', 'analyze');
const EMBEDDING_CREATE = showFor('embedding', 'create');

export const chatGptProperties: INodeProperty[] = [
  {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    default: 'text',
    required: true,
    options: [
      { name: 'Text', value: 'text', description: 'Chat completions and moderation' },
      { name: 'Image', value: 'image', description: 'Generate an image or describe one' },
      { name: 'Embedding', value: 'embedding', description: 'Turn text into vectors' },
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
      { name: 'Classify', value: 'classify', description: 'Check text against moderation policy' },
    ],
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    default: 'generate',
    required: true,
    displayOptions: { show: { resource: ['image'] } },
    options: [
      { name: 'Generate', value: 'generate', description: 'Create an image from a prompt' },
      {
        name: 'Analyze',
        value: 'analyze',
        description: 'Describe or answer questions about images',
      },
    ],
  },
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    default: 'create',
    required: true,
    displayOptions: { show: { resource: ['embedding'] } },
    options: [{ name: 'Create', value: 'create', description: 'Create embedding vectors' }],
  },

  modelProperty(TEXT_MESSAGE, CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, 'Chat model to answer with'),
  {
    displayName: 'System Prompt',
    name: 'systemPrompt',
    type: 'string',
    default: '',
    description: 'Instruction that frames how the model should answer',
    displayOptions: TEXT_MESSAGE,
  },
  promptProperty(TEXT_MESSAGE, 'The user message to send'),
  {
    displayName: 'Previous Messages',
    name: 'messages',
    type: 'json',
    default: [],
    description: 'Earlier turns as [{ "role": "user", "content": "..." }], sent before the prompt',
    displayOptions: TEXT_MESSAGE,
  },
  {
    displayName: 'JSON Output',
    name: 'jsonOutput',
    type: 'boolean',
    default: false,
    description: 'Force a JSON object reply and parse it into the output item',
    displayOptions: TEXT_MESSAGE,
  },
  simplifyProperty(TEXT_MESSAGE),
  optionsProperty(TEXT_MESSAGE, [
    numberOption('Temperature', 'temperature', 'Higher values make replies more varied', {
      minValue: 0,
      maxValue: 2,
    }),
    numberOption('Max Tokens', 'maxTokens', 'Upper bound on the reply length', { minValue: 1 }),
    numberOption('Top P', 'topP', 'Nucleus sampling cutoff', { minValue: 0, maxValue: 1 }),
    numberOption('Frequency Penalty', 'frequencyPenalty', 'Discourages repeated tokens', {
      minValue: -2,
      maxValue: 2,
    }),
    numberOption('Presence Penalty', 'presencePenalty', 'Discourages repeated topics', {
      minValue: -2,
      maxValue: 2,
    }),
    numberOption('Seed', 'seed', 'Makes sampling repeatable for the same input'),
    {
      displayName: 'Stop Sequences',
      name: 'stop',
      type: 'json',
      default: [],
      description: 'Strings that end the reply, as an array',
    },
    stringOption('End User ID', 'user', 'Stable id for abuse monitoring on your side'),
  ]),

  modelProperty(
    TEXT_CLASSIFY,
    [
      { name: 'Omni Moderation Latest', value: 'omni-moderation-latest' },
      { name: 'Text Moderation Latest', value: 'text-moderation-latest' },
    ],
    DEFAULT_MODERATION_MODEL,
    'Moderation model to classify with'
  ),
  {
    displayName: 'Input',
    name: 'input',
    type: 'string',
    default: '',
    required: true,
    description: 'Text to check against the moderation categories',
    displayOptions: TEXT_CLASSIFY,
  },

  modelProperty(
    IMAGE_GENERATE,
    IMAGE_MODEL_OPTIONS,
    DEFAULT_IMAGE_MODEL,
    'Image model to draw with'
  ),
  promptProperty(IMAGE_GENERATE, 'Description of the image to create'),
  optionsProperty(IMAGE_GENERATE, [
    {
      displayName: 'Size',
      name: 'size',
      type: 'options',
      default: '1024x1024',
      typeOptions: { allowCustomValue: true },
      options: [
        { name: '1024x1024', value: '1024x1024' },
        { name: '1024x1792 (Portrait)', value: '1024x1792' },
        { name: '1792x1024 (Landscape)', value: '1792x1024' },
        { name: '512x512', value: '512x512' },
      ],
    },
    {
      displayName: 'Quality',
      name: 'quality',
      type: 'options',
      default: 'standard',
      typeOptions: { allowCustomValue: true },
      options: [
        { name: 'Standard', value: 'standard' },
        { name: 'HD', value: 'hd' },
      ],
    },
    {
      displayName: 'Style',
      name: 'style',
      type: 'options',
      default: 'vivid',
      options: [
        { name: 'Vivid', value: 'vivid' },
        { name: 'Natural', value: 'natural' },
      ],
    },
    numberOption('Number of Images', 'numberOfImages', 'How many images to return', {
      minValue: 1,
      maxValue: 10,
    }),
    {
      displayName: 'Response Format',
      name: 'responseFormat',
      type: 'options',
      default: 'url',
      description: 'A URL expires within the hour; base64 comes back inline',
      options: [
        { name: 'URL', value: 'url' },
        { name: 'Base64', value: 'b64_json' },
      ],
    },
    stringOption('End User ID', 'user'),
  ]),

  modelProperty(
    IMAGE_ANALYZE,
    CHAT_MODEL_OPTIONS,
    DEFAULT_VISION_MODEL,
    'Vision-capable chat model'
  ),
  promptProperty(IMAGE_ANALYZE, 'What to ask about the images'),
  {
    displayName: 'Image URLs',
    name: 'imageUrls',
    type: 'json',
    default: [],
    required: true,
    description: 'Image URLs or data URIs to send, as an array',
    displayOptions: IMAGE_ANALYZE,
  },
  simplifyProperty(IMAGE_ANALYZE),
  optionsProperty(IMAGE_ANALYZE, [
    {
      displayName: 'Detail',
      name: 'detail',
      type: 'options',
      default: 'auto',
      description: 'Low costs fewer tokens; high reads fine print',
      options: [
        { name: 'Auto', value: 'auto' },
        { name: 'Low', value: 'low' },
        { name: 'High', value: 'high' },
      ],
    },
    numberOption('Max Tokens', 'maxTokens', 'Upper bound on the answer length', { minValue: 1 }),
    numberOption('Temperature', 'temperature', 'Higher values make answers more varied', {
      minValue: 0,
      maxValue: 2,
    }),
  ]),

  modelProperty(
    EMBEDDING_CREATE,
    EMBEDDING_MODEL_OPTIONS,
    DEFAULT_EMBEDDING_MODEL,
    'Embedding model to vectorise with'
  ),
  {
    displayName: 'Input',
    name: 'input',
    type: 'json',
    default: '',
    required: true,
    description: 'A string, or an array of strings to embed in one call',
    displayOptions: EMBEDDING_CREATE,
  },
  optionsProperty(EMBEDDING_CREATE, [
    numberOption('Dimensions', 'dimensions', 'Shorten the vector, on models that support it', {
      minValue: 1,
    }),
    stringOption('End User ID', 'user'),
  ]),
];

export const chatGptDescription: INodeDescription = {
  displayName: 'ChatGPT',
  name: CHATGPT_NODE_NAME,
  version: 1,
  group: ['transform'],
  description: 'Send prompts, moderate text, create images and embeddings with OpenAI models',
  defaults: { name: 'ChatGPT' },
  inputs: ['main'],
  outputs: ['main'],
  credentials: [{ name: CHATGPT_CREDENTIALS_NAME, required: true }],
  properties: chatGptProperties,
  memory: { historyParameter: 'messages', promptParameter: 'prompt', replyField: 'content' },
};
