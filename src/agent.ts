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

/**
 * PtyAgent - Universal transparent PTY wrapper
 * 
 * Can wrap any CLI process while remaining completely invisible.
 * Supports middleware for interception, transformation, and logging.
 */
export class PtyAgent extends EventEmitter implements IAgent {
  private _pty: IPty | null = null;
  private _running = false;
  private _history: Message[] = [];
  private _middlewares: Middleware[] = [];
  private _state: Map<string, unknown> = new Map();
  private _seq = 0;
  private _restartCount = 0;
  private _disposed = false;
  private _buffer: FlushBuffer;
  
  public readonly id: string;
  public readonly name: string;
  public readonly config: Readonly<AgentConfig>;
  
  constructor(config: AgentConfig) {
    super();
    
    this.id = uid();
    this.name = config.name || `agent-${this.id.slice(0, 6)}`;
    
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
    
    this.debug(`Agent created: ${this.name} (${this.config.command})`);
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
  
  private debug(message: string): void {
    if (this.config.debug) {
      const prefix = `[pty-agent:${this.name}]`;
      console.error(`${prefix} ${message}`);
    }
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
