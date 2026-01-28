/**
 * Builtin Adapters
 *
 * This module exports all builtin adapters for convenience.
 * Import individual adapters or the entire bundle.
 *
 * @example
 * // Import all builtin adapters
 * import { builtinAdapters, registerBuiltins } from 'ptyx/adapters/builtins';
 * registerBuiltins();
 *
 * // Or import individually
 * import claudeAdapter from 'ptyx/adapters/claude';
 * import pythonAdapter from 'ptyx/adapters/python';
 */

import { nodeAdapter } from './node.js';
import { pythonAdapter } from './python.js';
import { bashAdapter } from './bash.js';
import { registerAdapters } from '../adapters.js';
import type { Adapter } from '../types.js';

// Re-export individual adapters (REPL/shells only, AI adapters are in ./ai/)
export { nodeAdapter } from './node.js';
export { pythonAdapter } from './python.js';
export { bashAdapter } from './bash.js';

/**
 * Builtin REPL/shell adapters
 * For AI CLI adapters, use 'ptyx/adapters/ai'
 */
export const builtinAdapters: Adapter[] = [
  nodeAdapter,
  pythonAdapter,
  bashAdapter,
];

/**
 * Register all builtin adapters at once
 *
 * @example
 * import { registerBuiltins } from 'ptyx/adapters/builtins';
 * registerBuiltins();
 */
export function registerBuiltins(): void {
  registerAdapters(builtinAdapters);
}

export default builtinAdapters;
