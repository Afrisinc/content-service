import type { PriceTable } from './pricing';

/** Provider-agnostic node contracts. Nothing in `core/` may import outside this folder. */

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export interface ILogger {
  debug(meta: JsonObject, message: string): void;
  info(meta: JsonObject, message: string): void;
  warn(meta: JsonObject, message: string): void;
  error(meta: JsonObject, message: string): void;
}

export type NodePropertyType =
  'string' | 'number' | 'boolean' | 'options' | 'multiOptions' | 'json' | 'collection';

export interface INodePropertyOption {
  name: string;
  value: string | number;
  description?: string;
}

/** A property is offered only when every `show` rule matches and no `hide` rule does. */
export interface IDisplayOptions {
  show?: Record<string, Array<string | number | boolean>>;
  hide?: Record<string, Array<string | number | boolean>>;
}

export interface INodePropertyTypeOptions {
  minValue?: number;
  maxValue?: number;
  maxLength?: number;
  /** `options` only: accept a value outside the listed set, for models we do not know yet. */
  allowCustomValue?: boolean;
  /** Marks a value that must never reach a log, an error message, or an output item. */
  password?: boolean;
}

export interface INodeProperty {
  displayName: string;
  name: string;
  type: NodePropertyType;
  default: unknown;
  description?: string;
  required?: boolean;
  /** `options` and `multiOptions` only. */
  options?: INodePropertyOption[];
  /** `collection` only. */
  properties?: INodeProperty[];
  typeOptions?: INodePropertyTypeOptions;
  displayOptions?: IDisplayOptions;
}

export interface INodeCredentialUse {
  name: string;
  required?: boolean;
}

export interface INodeCredentialDescription {
  name: string;
  displayName: string;
  documentationUrl?: string;
  properties: INodeProperty[];
}

/**
 * Lets the runtime carry conversation memory for any node without knowing the provider:
 * prior turns go into `historyParameter`, the new message comes from `promptParameter`,
 * and the reply is read back from `replyField` on the output item.
 */
export interface INodeMemoryBinding {
  historyParameter: string;
  promptParameter: string;
  replyField: string;
}

export interface INodeDescription {
  displayName: string;
  /** Stable machine name used by the registry; never rename it, add a version instead. */
  name: string;
  version: number;
  group: Array<'input' | 'output' | 'transform'>;
  description: string;
  defaults: { name: string };
  inputs: string[];
  outputs: string[];
  credentials?: INodeCredentialUse[];
  properties: INodeProperty[];
  memory?: INodeMemoryBinding;
}

export interface INodeBinary {
  data: string;
  mimeType: string;
  fileName?: string;
}

export interface INodeItem<T extends JsonObject = JsonObject> {
  json: T;
  binary?: Record<string, INodeBinary>;
  /** Index of the input item this output was produced from. */
  pairedItem?: number;
  error?: JsonObject;
}

export type ResolvedParameters = Record<string, unknown>;

export interface INodeExecutionContext {
  /** Every input item, for operations that need to look across the batch. */
  getInputData(): INodeItem[];
  /** The item this execution is for. */
  getItem(): INodeItem;
  getItemIndex(): number;
  /** Parameter already resolved, defaulted and validated against the node description. */
  getNodeParameter<T = unknown>(name: string, fallback?: T): T;
  getAllParameters(): ResolvedParameters;
  getCredentials<T = JsonObject>(name: string): T;
  continueOnFail(): boolean;
  logger: ILogger;
  signal?: AbortSignal;
}

export interface INodeType {
  description: INodeDescription;
  /** Rates for this node's models, used to price a usage event. */
  pricing?: PriceTable;
  /** Runs once per input item and may fan out into several output items. */
  execute(context: INodeExecutionContext): Promise<INodeItem[]>;
  /** Optional token-by-token variant for operations that support it. */
  stream?(context: INodeExecutionContext): AsyncIterable<string>;
}
