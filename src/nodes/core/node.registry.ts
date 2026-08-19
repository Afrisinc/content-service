import { NodeOperationError } from './node.errors';
import type { INodeDescription, INodeType } from './node.types';

/** Holds every node available to a host application, keyed by machine name and version. */
export class NodeRegistry {
  private readonly nodes = new Map<string, Map<number, INodeType>>();

  register(node: INodeType): this {
    const { name, version } = node.description;
    const versions = this.nodes.get(name) ?? new Map<number, INodeType>();

    if (versions.has(version)) {
      throw new NodeOperationError(`Node "${name}" v${version} is already registered`);
    }

    versions.set(version, node);
    this.nodes.set(name, versions);
    return this;
  }

  /** Returns the requested version, or the highest registered one when no version is given. */
  get(name: string, version?: number): INodeType {
    const versions = this.nodes.get(name);
    if (!versions) {
      throw new NodeOperationError(`Unknown node "${name}"`);
    }

    if (version === undefined) {
      const latest = Math.max(...versions.keys());
      return versions.get(latest) as INodeType;
    }

    const node = versions.get(version);
    if (!node) {
      throw new NodeOperationError(`Node "${name}" has no version ${version}`);
    }
    return node;
  }

  has(name: string, version?: number): boolean {
    const versions = this.nodes.get(name);
    return version === undefined ? !!versions : !!versions?.has(version);
  }

  list(): INodeDescription[] {
    return [...this.nodes.values()].flatMap(versions =>
      [...versions.values()].map(node => node.description)
    );
  }
}
