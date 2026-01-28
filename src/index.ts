/**
 * ptyx
 *
 * Universal transparent PTY wrapper for any CLI.
 * Launch and control any command-line application invisibly.
 *
 * @example
 * ```typescript
 * import { createAgent, createWithAdapter, registerAdapter } from 'ptyx';
 *
 * // Basic usage - wrap any CLI
 * const agent = await createAgent({
 *   command: 'my-cli',
 *   args: ['--interactive'],
 * });
 *
 * // With adapter injection
 * const agent = await createWithAdapter({
 *   command: 'my-cli',
 *   adapter: myCustomAdapter,
 * });
 *
 * // With plugin loading
 * const agent = await createWithAdapter({
 *   command: 'claude',
 *   adapterPlugin: 'ptyx-adapter-claude',
 * });
 *
 * // Register adapters globally
 * import claudeAdapter from 'ptyx/adapters/claude';
 * registerAdapter(claudeAdapter);
 *
 * // Or register all builtins
 * import { registerBuiltins } from 'ptyx/adapters/builtins';
 * registerBuiltins();
 *
 * // Intercept everything
 * agent.on('message', (msg) => {
 *   console.log(`[${msg.direction}] ${msg.text}`);
 * });
 *
 * // Send input
 * agent.sendLine('Hello!');
 *
 * // Wait for pattern
 * await agent.waitFor(/done/i);
 *
 * // Cleanup
 * await agent.dispose();
 * ```
 *
 * @packageDocumentation
 */

// Core
export { PtyAgent, createAgent, exec, wrap } from './agent.js';

// Adapter System
export {
  // Registry
  registerAdapter,
  registerAdapters,
  unregisterAdapter,
  getAdapters,
  clearAdapters,
  findAdapter,
  // Plugin loading
  loadAdapterPlugin,
  loadAdapterPlugins,
  // Factory
  createWithAdapter,
  // Builder
  defineAdapter,
  // Fallback
  genericAdapter,
} from './adapters.js';

// Middleware
export {
  middleware,
  logger,
  fileLogger,
  interceptor,
  inject,
  rateLimit,
  buffer,
  echo,
  recorder,
  filter,
  stealth,
} from './middleware.js';

// Utilities
export {
  uid,
  stripAnsi,
  createMessage,
  formatLine,
  sleep,
  matchPattern,
  withTimeout,
  FlushBuffer,
  escapeShell,
  isTTY,
  getTerminalSize,
} from './utils.js';

// Types
export type {
  Agent,
  AgentConfig,
  AgentEvents,
  AgentOptions,
  Message,
  MessageDirection,
  Middleware,
  MiddlewareFn,
  Context,
  Adapter,
  ToolCall,
  CreateAgentOptions,
} from './types.js';

export type {
  CreateWithAdapterOptions,
  PluginModule,
} from './adapters.js';
