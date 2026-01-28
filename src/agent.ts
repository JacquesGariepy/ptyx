import { EventEmitter } from 'node:events';
import type { IPty, IPtyForkOptions } from 'node-pty';
import type {
  Agent as IAgent,
  AgentConfig,
  AgentEvents,
  Message,
  MessageDirection,
  Middleware,
  MiddlewareFn,
  Context,
  ExpectOptions,
  ExpectResult,
  WaitForAnyResult,
  HealthcheckResult,
} from './types.js';
import {
  uid,
  createMessage,
  formatLine,
  sleep,
  matchPattern,
  withTimeout,
  FlushBuffer,
  getTerminalSize,
} from './utils.js';
import { createLogger, type Logger } from './logger.js';

/**
 * PtyAgent - Universal transparent PTY wrapper
 * 
 * Can wrap any CLI process while remaining completely invisible.
 * Supports middleware for interception, transformation, and logging.
 */
export class PtyAgent extends EventEmitter implements IAgent {
  /** Key codes mapping for sendKeys() */
  private static readonly KEY_CODES: Record<string, string> = {
    'enter': '\r',
    'return': '\r',
    'tab': '\t',
    'escape': '\x1b',
    'esc': '\x1b',
    'backspace': '\x7f',
    'delete': '\x1b[3~',
    'up': '\x1b[A',
    'down': '\x1b[B',
    'right': '\x1b[C',
    'left': '\x1b[D',
    'home': '\x1b[H',
    'end': '\x1b[F',
    'pageup': '\x1b[5~',
    'pagedown': '\x1b[6~',
    'insert': '\x1b[2~',
    'f1': '\x1bOP',
    'f2': '\x1bOQ',
    'f3': '\x1bOR',
    'f4': '\x1bOS',
    'f5': '\x1b[15~',
    'f6': '\x1b[17~',
    'f7': '\x1b[18~',
    'f8': '\x1b[19~',
    'f9': '\x1b[20~',
    'f10': '\x1b[21~',
    'f11': '\x1b[23~',
    'f12': '\x1b[24~',
    'ctrl+a': '\x01',
    'ctrl+b': '\x02',
    'ctrl+c': '\x03',
    'ctrl+d': '\x04',
    'ctrl+e': '\x05',
    'ctrl+f': '\x06',
    'ctrl+g': '\x07',
    'ctrl+h': '\x08',
    'ctrl+i': '\x09',
    'ctrl+j': '\x0a',
    'ctrl+k': '\x0b',
    'ctrl+l': '\x0c',
    'ctrl+m': '\x0d',
    'ctrl+n': '\x0e',
    'ctrl+o': '\x0f',
    'ctrl+p': '\x10',
    'ctrl+q': '\x11',
    'ctrl+r': '\x12',
    'ctrl+s': '\x13',
    'ctrl+t': '\x14',
    'ctrl+u': '\x15',
    'ctrl+v': '\x16',
    'ctrl+w': '\x17',
    'ctrl+x': '\x18',
    'ctrl+y': '\x19',
    'ctrl+z': '\x1a',
    'ctrl+[': '\x1b',
    'ctrl+\\': '\x1c',
    'ctrl+]': '\x1d',
    'ctrl+^': '\x1e',
    'ctrl+_': '\x1f',
  };

  private _pty: IPty | null = null;
  private _running = false;
  private _history: Message[] = [];
  private _middlewares: Middleware[] = [];
  private _state: Map<string, unknown> = new Map();
  private _seq = 0;
  private _restartCount = 0;
  private _disposed = false;
  private _buffer: FlushBuffer;
  private _log: Logger;
  private _createdAt: number = Date.now();

  public readonly id: string;
  public readonly name: string;
  public readonly config: Readonly<AgentConfig>;
  
  constructor(config: AgentConfig) {
    super();

    this.id = uid();
    this.name = config.name || `agent-${this.id.slice(0, 6)}`;

    // Create logger for this agent (respects PTYX_DEBUG env var)
    this._log = createLogger(`Agent:${this.name}`, {
      forceDebug: config.debug,
    });

    // Apply defaults
    this.config = Object.freeze({
      command: config.command,
      args: config.args || [],
      cwd: config.cwd || process.cwd(),
      env: { ...process.env, ...config.env } as Record<string, string>,
      cols: config.cols || getTerminalSize().cols,
      rows: config.rows || getTerminalSize().rows,
      shell: config.shell,
      debug: config.debug || false,
      middleware: config.middleware || [],
      autoRestart: config.autoRestart || false,
      maxRestarts: config.maxRestarts || 3,
      restartDelay: config.restartDelay || 1000,
      timeout: config.timeout || 30000,
      name: this.name,
    });

    // Setup output buffer
    this._buffer = new FlushBuffer(
      (data) => this.handleOutput(data),
      50
    );

    // Register initial middleware
    for (const mw of this.config.middleware || []) {
      this.use(mw);
    }

    this._log.debug(`Agent created: ${this.name} (${this.config.command})`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════════════════
  
  get pty(): IPty | null {
    return this._pty;
  }
  
  get pid(): number | undefined {
    return this._pty?.pid;
  }
  
  get running(): boolean {
    return this._running;
  }
  
  get history(): readonly Message[] {
    return this._history;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════
  
  async spawn(): Promise<void> {
    if (this._disposed) {
      throw new Error('Agent has been disposed');
    }
    
    if (this._running) {
      this.debug('Already running');
      return;
    }
    
    try {
      const nodePty = await import('node-pty');
      
      const ptyOptions: IPtyForkOptions = {
        name: 'xterm-256color',
        cols: this.config.cols,
        rows: this.config.rows,
        cwd: this.config.cwd,
        env: this.config.env,
      };
      
      this.debug(`Spawning: ${this.config.command} ${(this.config.args || []).join(' ')}`);

      // On Windows, spawn through cmd.exe to handle .cmd/.bat files
      let command = this.config.command;
      let args = this.config.args || [];

      if (process.platform === 'win32') {
        // Use cmd.exe to properly resolve .cmd batch files (like npm global packages)
        args = ['/c', command, ...args];
        command = 'cmd.exe';
      }

      // Spawn the process
      this._pty = nodePty.spawn(
        command,
        args,
        ptyOptions
      );
      
      this._running = true;
      
      // Wire events
      this._pty.onData((data: string) => {
        this._buffer.push(data);
      });
      
      this._pty.onExit(({ exitCode, signal }) => {
        this._running = false;
        this._buffer.flush();
        this.emit('exit', exitCode, signal);
        this.debug(`Exited: code=${exitCode}, signal=${signal}`);
        
        // Auto-restart logic
        if (this.config.autoRestart && !this._disposed) {
          this.handleRestart();
        }
      });
      
      this.emit('spawn', this._pty.pid);
      this.debug(`Spawned: PID=${this._pty.pid}`);
      
      // Emit ready after short delay (or first output)
      setTimeout(() => this.emit('ready'), 100);
      
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }
  
  private async handleRestart(): Promise<void> {
    if (this._restartCount >= (this.config.maxRestarts || 3)) {
      this.debug('Max restarts reached');
      return;
    }
    
    this._restartCount++;
    this.emit('restart', this._restartCount);
    this.debug(`Restarting (${this._restartCount}/${this.config.maxRestarts})`);
    
    await sleep(this.config.restartDelay || 1000);
    
    try {
      await this.spawn();
    } catch (err) {
      this.debug(`Restart failed: ${err}`);
    }
  }
  
  kill(signal = 'SIGTERM'): void {
    if (this._pty) {
      this._pty.kill(signal);
      this.debug(`Kill signal: ${signal}`);
    }
  }
  
  async dispose(): Promise<void> {
    if (this._disposed) return;
    
    this._disposed = true;
    this._buffer.clear();
    
    if (this._pty && this._running) {
      this.kill();
      
      // Wait for exit
      await Promise.race([
        new Promise<void>(resolve => this.once('exit', () => resolve())),
        sleep(5000),
      ]);
    }
    
    this._pty = null;
    this._running = false;
    this.removeAllListeners();
    
    this.debug('Disposed');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // I/O
  // ═══════════════════════════════════════════════════════════════════════════
  
  write(data: string): void {
    if (!this._pty || !this._running) {
      this.debug('Cannot write: not running');
      return;
    }
    this._pty.write(data);
    this.emit('data', data, 'in');
  }
  
  send(data: string): void {
    // Process through middleware
    const msg = createMessage(data, 'in', this.id, ++this._seq);
    
    this.runMiddleware(msg, 'in').then(() => {
      this.write(msg.raw);
      this._history.push(msg);
    });
  }
  
  sendLine(data: string): void {
    this.send(formatLine(data));
  }
  
  resize(cols: number, rows: number): void {
    if (this._pty) {
      this._pty.resize(cols, rows);
      this.emit('resize', cols, rows);
      this.debug(`Resized: ${cols}x${rows}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Middleware
  // ═══════════════════════════════════════════════════════════════════════════
  
  use(mw: Middleware): this {
    const priority = mw.priority ?? 100;
    const idx = this._middlewares.findIndex(m => (m.priority ?? 100) > priority);
    
    if (idx === -1) {
      this._middlewares.push(mw);
    } else {
      this._middlewares.splice(idx, 0, mw);
    }
    
    this.debug(`Middleware added: ${mw.name} (priority: ${priority})`);
    return this;
  }
  
  unuse(name: string): boolean {
    const idx = this._middlewares.findIndex(m => m.name === name);
    if (idx !== -1) {
      this._middlewares.splice(idx, 1);
      this.debug(`Middleware removed: ${name}`);
      return true;
    }
    return false;
  }
  
  private async runMiddleware(
    msg: Message,
    direction: MessageDirection
  ): Promise<void> {
    const ctx: Context = {
      agent: this,
      config: this.config,
      history: this._history,
      state: this._state,
      send: (data) => this.write(data),
      emit: (data) => this.emit('data', data, 'out'),
      log: (m) => this.debug(m),
    };
    
    // Filter applicable middleware
    const applicable = this._middlewares.filter(
      mw => (mw.enabled !== false) && 
            (mw.direction === 'both' || mw.direction === direction)
    );
    
    // Execute chain
    let idx = 0;
    const next = async (): Promise<void> => {
      if (idx >= applicable.length) return;
      const mw = applicable[idx++];
      try {
        await mw.fn(msg, ctx, next);
      } catch (err) {
        this.debug(`Middleware error (${mw.name}): ${err}`);
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    };
    
    await next();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════════════════════════
  
  clear(): void {
    this._history = [];
    this._state.clear();
    this.debug('History cleared');
  }
  
  wait(ms: number): Promise<void> {
    return sleep(ms);
  }
  
  async waitFor(
    pattern: RegExp | string,
    timeout?: number
  ): Promise<Message> {
    const ms = timeout ?? this.config.timeout ?? 30000;

    return withTimeout(
      new Promise<Message>((resolve) => {
        const handler = (msg: Message) => {
          if (msg.direction === 'out' && matchPattern(msg.text, pattern)) {
            this.off('message', handler);
            resolve(msg);
          }
        };
        this.on('message', handler);
      }),
      ms,
      `Timeout waiting for pattern: ${pattern}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Enhanced API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wait for pattern and return match details (pexpect-like API)
   */
  async expect(
    pattern: RegExp | string,
    options?: ExpectOptions
  ): Promise<ExpectResult> {
    const { timeout = this.config.timeout, echo = false } = options || {};
    const ms = timeout ?? 30000;
    let buffer = '';

    return withTimeout(
      new Promise<ExpectResult>((resolve) => {
        const handler = (msg: Message) => {
          if (msg.direction === 'out') {
            buffer += msg.text;
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
            const match = buffer.match(regex);
            if (match) {
              this.off('message', handler);
              const idx = match.index ?? 0;
              if (echo) {
                this.debug(`expect matched: ${match[0]}`);
              }
              resolve({
                match,
                before: buffer.slice(0, idx),
                after: buffer.slice(idx + match[0].length),
              });
            }
          }
        };
        this.on('message', handler);
      }),
      ms,
      `expect: timeout waiting for ${pattern}`
    );
  }

  /**
   * Wait for ALL patterns to match (in any order)
   */
  async waitForAll(
    patterns: (RegExp | string)[],
    timeout?: number
  ): Promise<Message[]> {
    const ms = timeout ?? this.config.timeout ?? 30000;
    const remaining = new Set(patterns);
    const matches: Message[] = [];

    return withTimeout(
      new Promise<Message[]>((resolve) => {
        const handler = (msg: Message) => {
          if (msg.direction === 'out') {
            for (const pattern of remaining) {
              if (matchPattern(msg.text, pattern)) {
                remaining.delete(pattern);
                matches.push(msg);
                if (remaining.size === 0) {
                  this.off('message', handler);
                  resolve(matches);
                }
                break;
              }
            }
          }
        };
        this.on('message', handler);
      }),
      ms,
      `waitForAll: timeout waiting for ${patterns.length} patterns`
    );
  }

  /**
   * Wait for FIRST pattern to match
   */
  async waitForAny(
    patterns: (RegExp | string)[],
    timeout?: number
  ): Promise<WaitForAnyResult> {
    const ms = timeout ?? this.config.timeout ?? 30000;

    return withTimeout(
      new Promise<WaitForAnyResult>((resolve) => {
        const handler = (msg: Message) => {
          if (msg.direction === 'out') {
            for (let i = 0; i < patterns.length; i++) {
              const pattern = patterns[i];
              if (matchPattern(msg.text, pattern)) {
                this.off('message', handler);
                resolve({ pattern, message: msg, index: i });
                return;
              }
            }
          }
        };
        this.on('message', handler);
      }),
      ms,
      `waitForAny: timeout waiting for any of ${patterns.length} patterns`
    );
  }

  /**
   * Wait for no output for specified duration (idle detection)
   */
  async waitForIdle(idleMs: number = 1000, timeout?: number): Promise<void> {
    const maxTimeout = timeout ?? this.config.timeout ?? 30000;
    let lastActivity = Date.now();

    return withTimeout(
      new Promise<void>((resolve) => {
        const resetTimer = () => {
          lastActivity = Date.now();
        };

        const checkIdle = () => {
          if (Date.now() - lastActivity >= idleMs) {
            this.off('message', resetTimer);
            resolve();
          } else {
            setTimeout(checkIdle, Math.min(100, idleMs / 10));
          }
        };

        this.on('message', resetTimer);
        setTimeout(checkIdle, idleMs);
      }),
      maxTimeout,
      `waitForIdle: timeout after ${maxTimeout}ms`
    );
  }

  /**
   * Send special keys (ctrl+c, enter, escape, arrows, etc.)
   */
  sendKeys(keys: string | string[]): void {
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const key of keyList) {
      const code = PtyAgent.KEY_CODES[key.toLowerCase()] ?? key;
      this.write(code);
    }
  }

  /**
   * Send data without logging (for passwords and secrets)
   * Bypasses middleware to avoid logging sensitive data
   */
  sendSecret(data: string): void {
    if (!this._pty || !this._running) {
      this.debug('Cannot write: not running');
      return;
    }
    // Write directly to PTY, bypassing middleware
    this._pty.write(data);
    // Add redacted entry to history
    const msg = createMessage('[REDACTED]', 'in', this.id, ++this._seq);
    msg.meta.secret = true;
    this._history.push(msg);
    this.emit('data', '[REDACTED]', 'in');
  }

  /**
   * Check agent health and status
   */
  async healthcheck(): Promise<HealthcheckResult> {
    return {
      healthy: this._running && !this._disposed,
      running: this._running,
      pid: this.pid,
      uptime: Date.now() - this._createdAt,
      messageCount: this._history.length,
      memoryUsage: process.memoryUsage(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Internal
  // ═══════════════════════════════════════════════════════════════════════════
  
  private handleOutput(data: string): void {
    const msg = createMessage(data, 'out', this.id, ++this._seq);
    
    this.runMiddleware(msg, 'out').then(() => {
      this._history.push(msg);
      this.emit('data', msg.raw, 'out');
      this.emit('message', msg);
    });
  }
  
  /**
   * Internal debug logging via centralized logger
   * Respects PTYX_DEBUG env var and config.debug option
   */
  private debug(message: string): void {
    this._log.debug(message);
  }

  /**
   * Get the logger instance for this agent
   * Useful for subclasses or middleware
   */
  get log(): Logger {
    return this._log;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Event emitter overrides for type safety
  // ═══════════════════════════════════════════════════════════════════════════
  
  override on<K extends keyof AgentEvents>(
    event: K,
    listener: AgentEvents[K]
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  
  override off<K extends keyof AgentEvents>(
    event: K,
    listener: AgentEvents[K]
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }
  
  override once<K extends keyof AgentEvents>(
    event: K,
    listener: AgentEvents[K]
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }
  
  override emit<K extends keyof AgentEvents>(
    event: K,
    ...args: Parameters<AgentEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new PTY agent
 */
export async function createAgent(
  config: AgentConfig & { autoSpawn?: boolean }
): Promise<PtyAgent> {
  const { autoSpawn = true, ...agentConfig } = config;
  const agent = new PtyAgent(agentConfig);
  
  if (autoSpawn) {
    await agent.spawn();
  }
  
  return agent;
}

/**
 * Create agent from command string
 */
export async function exec(
  command: string,
  options: Partial<AgentConfig> = {}
): Promise<PtyAgent> {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  
  return createAgent({
    command: cmd,
    args,
    ...options,
  });
}

/**
 * Wrap an existing command transparently
 */
export async function wrap(
  command: string,
  args: string[] = [],
  options: Partial<AgentConfig> = {}
): Promise<PtyAgent> {
  return createAgent({
    command,
    args,
    ...options,
  });
}
