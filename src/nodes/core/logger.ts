import type { ILogger } from './node.types';

/** Default sink so a node can run with no logging stack wired up. */
export const silentLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
