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
 * // Register AI adapters
 * import { claudeAdapter } from 'ptyx/adapters/ai';
 * registerAdapter(claudeAdapter);
 *
 * // Or register all AI adapters at once
 * import { registerAiAdapters } from 'ptyx/adapters/ai';
 * registerAiAdapters();
 *
 * // Or register REPL builtins (node, python, bash)
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
  metrics,
  audit,
} from './middleware.js';

// Session Management
export {
  SessionRecorder,
  SessionPlayer,
  createSessionRecorder,
  createSessionPlayer,
} from './session.js';

// Streams API
export {
  createReadStream,
  createWriteStream,
  createDuplexStream,
  pipeOutput,
  pipeInput,
  connectStdio,
  collectOutput,
} from './streams.js';

// Agent Pool
export {
  AgentPool,
  createAgentPool,
} from './pool.js';

// WebSocket Server
export {
  PtyServer,
  createServer,
} from './server.js';

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

// Logger
export {
  createLogger,
  setLogLevel,
  getLogLevel,
  LogLevel,
  defaultLogger,
  type Logger,
} from './logger.js';

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

// Enhanced API Types
export type {
  ExpectOptions,
  ExpectResult,
  WaitForAnyResult,
  HealthcheckResult,
} from './types.js';

// Middleware Types
export type {
  LogOptions,
  FileLogOptions,
  InterceptOptions,
  InjectOptions,
  RateLimitOptions,
  BufferOptions,
  RecorderOptions,
  MetricsData,
  MetricsOptions,
  AuditLogEntry,
  AuditOptions,
} from './middleware.js';

// Session Types
export type {
  SessionData,
  SessionMessage,
  ExportFormat,
} from './session.js';

// Streams Types
export type {
  ReadStreamOptions,
  WriteStreamOptions,
  DuplexStreamOptions,
} from './streams.js';

// Pool Types
export type {
  PoolConfig,
  PoolEvents,
  PoolStats,
} from './pool.js';

// Server Types
export type {
  ServerConfig,
  ClientMessage,
  ServerMessage,
  ServerEvents,
} from './server.js';

// Terminal Detection & Emulation
export {
  detectTerminal,
  detectProfile,
  createTerminalEmulator,
  createTerminalEnv,
  applyTerminalEnv,
  supportsFeature,
  getCapabilities,
  createProfile,
  TerminalProfiles,
} from './terminal.js';

// Terminal Types
export type {
  TerminalInfo,
  TerminalProfile,
  TerminalEmulatorOptions,
} from './terminal.js';
