/**
 * Builtin Adapters
 *
 * This module exports all builtin adapters for convenience.
 * Import individual adapters or the entire bundle.
 *
 * @example
 * // Import all builtin adapters
 * import { builtinAdapters, registerBuiltins } from 'pty-agent/adapters/builtins';
 * registerBuiltins();
 *
 * // Or import individually
 * import claudeAdapter from 'pty-agent/adapters/claude';
 * import pythonAdapter from 'pty-agent/adapters/python';
 */

import { claudeAdapter } from './claude.js';
import { nodeAdapter } from './node.js';
import { pythonAdapter } from './python.js';
import { bashAdapter } from './bash.js';
import { registerAdapters } from '../adapters.js';
import type { Adapter } from '../types.js';

// Re-export individual adapters
export { claudeAdapter } from './claude.js';
export { nodeAdapter } from './node.js';
export { pythonAdapter } from './python.js';
export { bashAdapter } from './bash.js';

/**
 * All builtin adapters in recommended order
 */
export const builtinAdapters: Adapter[] = [
  claudeAdapter,
  nodeAdapter,
  pythonAdapter,
  bashAdapter,
];

/**
 * Register all builtin adapters at once
 *
 * @example
 * import { registerBuiltins } from 'pty-agent/adapters/builtins';
 * registerBuiltins();
 */
export function registerBuiltins(): void {
  registerAdapters(builtinAdapters);
}

export default builtinAdapters;
