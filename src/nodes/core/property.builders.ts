import type { IDisplayOptions, INodeProperty, INodePropertyOption } from './node.types';

/** Gates a property on the resource + operation pair that owns it. */
export const showFor = (resource: string, operation: string): IDisplayOptions => ({
  show: { resource: [resource], operation: [operation] },
});

/** Model lists go stale between releases, so an unlisted id is always accepted. */
export function modelProperty(
  displayOptions: IDisplayOptions,
  options: INodePropertyOption[],
  defaultModel: string,
  description: string
): INodeProperty {
  return {
    displayName: 'Model',
    name: 'model',
    type: 'options',
    options,
    default: defaultModel,
    required: true,
    typeOptions: { allowCustomValue: true },
    description,
    displayOptions,
  };
}

export function promptProperty(
  displayOptions: IDisplayOptions,
  description: string
): INodeProperty {
  return {
    displayName: 'Prompt',
    name: 'prompt',
    type: 'string',
    default: '',
    required: true,
    description,
    displayOptions,
  };
}

export function optionsProperty(
  displayOptions: IDisplayOptions,
  properties: INodeProperty[]
): INodeProperty {
  return {
    displayName: 'Options',
    name: 'options',
    type: 'collection',
    default: {},
    description: 'Settings sent to the API only when you set them',
    properties,
    displayOptions,
  };
}

export function simplifyProperty(displayOptions: IDisplayOptions): INodeProperty {
  return {
    displayName: 'Simplify Output',
    name: 'simplifyOutput',
    type: 'boolean',
    default: true,
    description: 'Return the answer instead of the full API response',
    displayOptions,
  };
}

export const numberOption = (
  displayName: string,
  name: string,
  description: string,
  typeOptions?: INodeProperty['typeOptions']
): INodeProperty => ({
  displayName,
  name,
  type: 'number',
  default: 0,
  description,
  typeOptions,
});

export const stringOption = (
  displayName: string,
  name: string,
  description?: string
): INodeProperty => ({
  displayName,
  name,
  type: 'string',
  default: '',
  description,
});

export const choiceOption = (
  displayName: string,
  name: string,
  options: INodePropertyOption[],
  defaultValue: string,
  description?: string
): INodeProperty => ({
  displayName,
  name,
  type: 'options',
  options,
  default: defaultValue,
  description,
});
