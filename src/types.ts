import type { IPty } from 'node-pty';
import type { EventEmitter } from 'node:events';

// ═══════════════════════════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for spawning any CLI process
 */
export interface AgentConfig {
  /** Command to execute (e.g., 'claude', 'node', 'python', 'bash') */
  command: string;
  
  /** Arguments to pass to the command */
  args?: string[];
  
  /** Working directory */
  cwd?: string;
  
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  
  /** Terminal columns (default: 120) */
  cols?: number;
  
  /** Terminal rows (default: 30) */
  rows?: number;
  
  /** Shell to use for shell mode */
  shell?: string | boolean;
  
  /** Enable debug logging */
  debug?: boolean;
  
  /** Middleware pipeline */
  middleware?: Middleware[];
  
  /** Auto-restart on crash */
  autoRestart?: boolean;
  
  /** Max restart attempts */
  maxRestarts?: number;
  
  /** Restart delay in ms */
  restartDelay?: number;
  
  /** Timeout for operations (ms) */
  timeout?: number;
  
  /** Custom name for this agent instance */
  name?: string;
}

/**
 * Runtime options that can be changed after creation
 */
export interface AgentOptions {
  /** Pause output processing */
  paused?: boolean;
  
  /** Buffer output instead of streaming */
  buffered?: boolean;
  
  /** Echo input back to output */
  echo?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Message Types
// ═══════════════════════════════════════════════════════════════════════════════

export type MessageDirection = 'in' | 'out';

/**
 * Represents data flowing through the PTY
 */
export interface Message {
  /** Raw data with escape sequences */
  raw: string;
  
  /** Cleaned text (ANSI stripped) */
  text: string;
  
  /** Direction: 'in' (to process) or 'out' (from process) */
  direction: MessageDirection;
  
  /** Timestamp */
  ts: number;
  
  /** Source agent ID */
  agentId: string;
  
  /** Sequence number */
  seq: number;
  
  /** Custom metadata from middleware */
  meta: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Context available to middleware
 */
export interface Context {
  /** The agent instance */
  agent: Agent;
  
  /** Agent configuration */
  config: AgentConfig;
  
  /** Message history */
  history: Message[];
  
  /** Shared state across middleware */
  state: Map<string, unknown>;
  
  /** Send data to the process */
  send: (data: string) => void;
  
  /** Emit data as output (bypass process) */
  emit: (data: string) => void;
  
  /** Log debug message */
  log: (msg: string) => void;
}

/**
 * Middleware function signature
 */
export type MiddlewareFn = (
  msg: Message,
  ctx: Context,
  next: () => Promise<void>
) => Promise<void> | void;

/**
 * Middleware definition
 */
export interface Middleware {
  /** Unique identifier */
  name: string;
  
  /** Which direction(s) to handle */
  direction: MessageDirection | 'both';
  
  /** The handler function */
  fn: MiddlewareFn;
  
  /** Priority (lower = earlier, default: 100) */
  priority?: number;
  
  /** Only active when enabled */
  enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AgentEvents {
  /** Raw data received/sent */
  data: (data: string, direction: MessageDirection) => void;
  
  /** Processed message */
  message: (msg: Message) => void;
  
  /** Process spawned */
  spawn: (pid: number) => void;
  
  /** Process exited */
  exit: (code: number, signal?: number) => void;
  
  /** Error occurred */
  error: (err: Error) => void;
  
  /** Terminal resized */
  resize: (cols: number, rows: number) => void;
  
  /** Agent ready (first prompt or timeout) */
  ready: () => void;
  
  /** Process restarted */
  restart: (attempt: number) => void;
  
  /** Idle timeout */
  idle: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Universal PTY Agent interface
 */
export interface Agent extends EventEmitter {
  /** Unique agent ID */
  readonly id: string;
  
  /** Agent name (from config or generated) */
  readonly name: string;
  
  /** Underlying PTY instance */
  readonly pty: IPty | null;
  
  /** Process ID */
  readonly pid: number | undefined;
  
  /** Is the process running */
  readonly running: boolean;
  
  /** Message history */
  readonly history: readonly Message[];
  
  /** Current configuration */
  readonly config: Readonly<AgentConfig>;
  
  // Lifecycle
  spawn(): Promise<void>;
  kill(signal?: string): void;
  dispose(): Promise<void>;
  
  // I/O
  write(data: string): void;
  send(data: string): void;
  sendLine(data: string): void;
  resize(cols: number, rows: number): void;
  
  // Middleware
  use(mw: Middleware): this;
  unuse(name: string): boolean;
  
  // Utilities
  clear(): void;
  wait(ms: number): Promise<void>;
  waitFor(pattern: RegExp | string, timeout?: number): Promise<Message>;

  // Enhanced API
  /** Wait for pattern and return match details (pexpect-like) */
  expect(pattern: RegExp | string, options?: ExpectOptions): Promise<ExpectResult>;
  /** Wait for ALL patterns to match (in any order) */
  waitForAll(patterns: (RegExp | string)[], timeout?: number): Promise<Message[]>;
  /** Wait for FIRST pattern to match */
  waitForAny(patterns: (RegExp | string)[], timeout?: number): Promise<WaitForAnyResult>;
  /** Wait for no output for specified duration */
  waitForIdle(idleMs?: number, timeout?: number): Promise<void>;
  /** Send special keys (ctrl+c, enter, escape, etc.) */
  sendKeys(keys: string | string[]): void;
  /** Send data without logging (for passwords) */
  sendSecret(data: string): void;
  /** Check agent health status */
  healthcheck(): Promise<HealthcheckResult>;

  // Events (typed)
  on<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): this;
  off<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): this;
  once<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): this;
  emit<K extends keyof AgentEvents>(event: K, ...args: Parameters<AgentEvents[K]>): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Types (for specific CLIs)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter provides CLI-specific behavior
 */
export interface Adapter {
  /** Adapter name */
  name: string;
  
  /** Detect if this adapter should handle the command */
  detect: (config: AgentConfig) => boolean;
  
  /** Modify config before spawn */
  configure?: (config: AgentConfig) => AgentConfig;
  
  /** Get default middleware for this CLI */
  middleware?: () => Middleware[];
  
  /** Detect ready state */
  isReady?: (msg: Message) => boolean;
  
  /** Detect if process is waiting for input */
  isPrompt?: (msg: Message) => boolean;
  
  /** Parse tool/function calls (if applicable) */
  parseToolCall?: (msg: Message) => ToolCall | null;
}

/**
 * Tool/function call information
 */
export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
  raw: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Enhanced API Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for expect() method
 */
export interface ExpectOptions {
  /** Timeout in ms (defaults to agent timeout) */
  timeout?: number;
  /** Echo matched content to debug */
  echo?: boolean;
}

/**
 * Result from expect() method
 */
export interface ExpectResult {
  /** The regex match result */
  match: RegExpMatchArray | null;
  /** Content before the match */
  before: string;
  /** Content after the match */
  after: string;
}

/**
 * Result from waitForAny() method
 */
export interface WaitForAnyResult {
  /** The pattern that matched */
  pattern: RegExp | string;
  /** The message that matched */
  message: Message;
  /** Index of the pattern in the original array */
  index: number;
}

/**
 * Result from healthcheck() method
 */
export interface HealthcheckResult {
  /** Is the agent healthy and responsive */
  healthy: boolean;
  /** Is the process currently running */
  running: boolean;
  /** Process ID if running */
  pid: number | undefined;
  /** Time since agent creation in ms */
  uptime: number;
  /** Number of messages in history */
  messageCount: number;
  /** Node.js memory usage */
  memoryUsage?: NodeJS.MemoryUsage;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for agent factory
 */
export interface CreateAgentOptions extends AgentConfig {
  /** Auto-spawn on creation (default: true) */
  autoSpawn?: boolean;
  
  /** Adapter to use (auto-detected if not specified) */
  adapter?: Adapter;
}

/**
 * Shorthand for common CLIs
 */
export interface AgentPresets {
  claude: (args?: string[]) => Promise<Agent>;
  node: (script: string, args?: string[]) => Promise<Agent>;
  python: (script: string, args?: string[]) => Promise<Agent>;
  bash: (command?: string) => Promise<Agent>;
  shell: () => Promise<Agent>;
}
