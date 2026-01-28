/**
 * Session management for ptyx
 *
 * Provides recording, export, and replay capabilities for terminal sessions.
 *
 * @example
 * ```typescript
 * import { createAgent } from 'ptyx';
 * import { createSessionRecorder, SessionPlayer } from 'ptyx/session';
 *
 * // Record a session
 * const { middleware, getRecorder } = createSessionRecorder();
 * const agent = await createAgent({ command: 'node', middleware: [middleware] });
 *
 * // ... interact with agent ...
 *
 * // Export session
 * const recorder = getRecorder();
 * recorder.end();
 * const json = recorder.export('json');
 * const cast = recorder.export('asciinema');
 *
 * // Replay session
 * const player = SessionPlayer.fromJSON(json);
 * await player.play((data) => process.stdout.write(data));
 * ```
 *
 * @packageDocumentation
 */

import type { Message, Middleware } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Session data structure
 */
export interface SessionData {
  /** Unique session ID */
  id: string;
  /** Agent ID that created this session */
  agentId: string;
  /** Agent name */
  agentName: string;
  /** Command that was executed */
  command: string;
  /** Command arguments */
  args: string[];
  /** Session start timestamp (ms) */
  startTime: number;
  /** Session end timestamp (ms) */
  endTime?: number;
  /** Recorded messages */
  messages: SessionMessage[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Terminal dimensions */
  terminal?: {
    cols: number;
    rows: number;
  };
}

/**
 * Compact message format for storage
 */
export interface SessionMessage {
  /** Timestamp offset from session start (ms) */
  ts: number;
  /** Direction: 'i' (in) or 'o' (out) */
  dir: 'i' | 'o';
  /** Raw data */
  data: string;
}

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'asciinema' | 'typescript' | 'script';

// ═══════════════════════════════════════════════════════════════════════════════
// Session Recorder
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Records terminal sessions for later export and replay
 */
export class SessionRecorder {
  private _data: SessionData;
  private _startTime: number;
  private _ended = false;

  constructor(
    agentId: string,
    agentName: string,
    command: string,
    args: string[] = [],
    terminal?: { cols: number; rows: number }
  ) {
    this._startTime = Date.now();
    this._data = {
      id: `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      agentName,
      command,
      args,
      startTime: this._startTime,
      messages: [],
      terminal,
    };
  }

  /**
   * Record a message
   */
  record(msg: Message): void {
    if (this._ended) return;

    this._data.messages.push({
      ts: msg.ts - this._startTime,
      dir: msg.direction === 'in' ? 'i' : 'o',
      data: msg.raw,
    });
  }

  /**
   * Mark session as ended
   */
  end(): void {
    if (this._ended) return;
    this._ended = true;
    this._data.endTime = Date.now();
  }

  /**
   * Set metadata for the session
   */
  setMetadata(key: string, value: unknown): void {
    if (!this._data.metadata) {
      this._data.metadata = {};
    }
    this._data.metadata[key] = value;
  }

  /**
   * Export session in specified format
   */
  export(format: ExportFormat): string {
    switch (format) {
      case 'json':
        return this.toJSON();
      case 'asciinema':
        return this.toAsciinema();
      case 'typescript':
        return this.toTypeScript();
      case 'script':
        return this.toScript();
      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  /**
   * Export as JSON
   */
  private toJSON(): string {
    return JSON.stringify(this._data, null, 2);
  }

  /**
   * Export as asciinema v2 format (.cast)
   */
  private toAsciinema(): string {
    const header = {
      version: 2,
      width: this._data.terminal?.cols ?? 120,
      height: this._data.terminal?.rows ?? 30,
      timestamp: Math.floor(this._startTime / 1000),
      title: `${this._data.command} ${this._data.args.join(' ')}`.trim(),
      env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
    };

    const events = this._data.messages
      .filter(m => m.dir === 'o') // Only output for playback
      .map(m => [m.ts / 1000, 'o', m.data]);

    return JSON.stringify(header) + '\n' +
           events.map(e => JSON.stringify(e)).join('\n');
  }

  /**
   * Export as TypeScript replay script
   */
  private toTypeScript(): string {
    const inputs = this._data.messages.filter(m => m.dir === 'i');
    const escapeString = (s: string) => JSON.stringify(s);

    return `/**
 * Session Replay Script
 * Generated from session: ${this._data.id}
 * Command: ${this._data.command} ${this._data.args.join(' ')}
 * Date: ${new Date(this._startTime).toISOString()}
 */

import { createAgent } from 'ptyx';

async function replay() {
  const agent = await createAgent({
    command: ${escapeString(this._data.command)},
    args: ${JSON.stringify(this._data.args)},
  });

  // Replay inputs with timing
${inputs.map(m => `  await agent.wait(${m.ts}); agent.write(${escapeString(m.data)});`).join('\n')}

  await agent.dispose();
}

replay().catch(console.error);
`;
  }

  /**
   * Export as script-style recording (only output)
   */
  private toScript(): string {
    return this._data.messages
      .filter(m => m.dir === 'o')
      .map(m => m.data)
      .join('');
  }

  /**
   * Get raw session data
   */
  getData(): Readonly<SessionData> {
    return this._data;
  }

  /**
   * Get session ID
   */
  get id(): string {
    return this._data.id;
  }

  /**
   * Get message count
   */
  get messageCount(): number {
    return this._data.messages.length;
  }

  /**
   * Get session duration (ms)
   */
  get duration(): number {
    const endTime = this._data.endTime ?? Date.now();
    return endTime - this._startTime;
  }

  /**
   * Check if session has ended
   */
  get ended(): boolean {
    return this._ended;
  }

  /**
   * Create recorder from JSON data
   */
  static fromJSON(json: string): SessionRecorder {
    const data: SessionData = JSON.parse(json);
    const recorder = new SessionRecorder(
      data.agentId,
      data.agentName,
      data.command,
      data.args,
      data.terminal
    );
    recorder._data = data;
    recorder._startTime = data.startTime;
    if (data.endTime) {
      recorder._ended = true;
    }
    return recorder;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session Player
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Replays recorded terminal sessions
 */
export class SessionPlayer {
  private _data: SessionData;
  private _position = 0;
  private _playing = false;
  private _paused = false;
  private _speed = 1;

  constructor(data: SessionData) {
    this._data = data;
  }

  /**
   * Create player from JSON string
   */
  static fromJSON(json: string): SessionPlayer {
    return new SessionPlayer(JSON.parse(json));
  }

  /**
   * Create player from SessionData
   */
  static fromData(data: SessionData): SessionPlayer {
    return new SessionPlayer(data);
  }

  /**
   * Play the session
   * @param onOutput - Callback for each output frame
   * @param options - Playback options
   */
  async play(
    onOutput: (data: string, ts: number) => void,
    options?: { speed?: number; skipDelays?: boolean }
  ): Promise<void> {
    const { speed = 1, skipDelays = false } = options ?? {};
    this._speed = speed;
    this._playing = true;
    this._paused = false;
    this._position = 0;

    const outputs = this._data.messages.filter(m => m.dir === 'o');
    let lastTs = 0;

    for (const msg of outputs) {
      if (!this._playing) break;

      // Handle pause
      while (this._paused && this._playing) {
        await new Promise(r => setTimeout(r, 100));
      }

      if (!this._playing) break;

      // Apply delay
      if (!skipDelays) {
        const delay = (msg.ts - lastTs) / this._speed;
        if (delay > 0) {
          await new Promise(r => setTimeout(r, Math.min(delay, 2000))); // Cap at 2s
        }
      }

      onOutput(msg.data, msg.ts);
      lastTs = msg.ts;
      this._position++;
    }

    this._playing = false;
  }

  /**
   * Pause playback
   */
  pause(): void {
    this._paused = true;
  }

  /**
   * Resume playback
   */
  resume(): void {
    this._paused = false;
  }

  /**
   * Stop playback
   */
  stop(): void {
    this._playing = false;
    this._paused = false;
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    this._speed = Math.max(0.1, Math.min(10, speed));
  }

  /**
   * Get current position (frame number)
   */
  get position(): number {
    return this._position;
  }

  /**
   * Get total number of output frames
   */
  get totalFrames(): number {
    return this._data.messages.filter(m => m.dir === 'o').length;
  }

  /**
   * Check if currently playing
   */
  get playing(): boolean {
    return this._playing;
  }

  /**
   * Check if paused
   */
  get paused(): boolean {
    return this._paused;
  }

  /**
   * Get session data
   */
  get data(): Readonly<SessionData> {
    return this._data;
  }

  /**
   * Get session duration (ms)
   */
  get duration(): number {
    if (this._data.messages.length === 0) return 0;
    return this._data.messages[this._data.messages.length - 1].ts;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a session recorder middleware
 *
 * @example
 * ```typescript
 * const { middleware, getRecorder } = createSessionRecorder();
 * const agent = await createAgent({ command: 'node', middleware: [middleware] });
 *
 * // After session
 * const recorder = getRecorder();
 * recorder.end();
 * console.log(recorder.export('json'));
 * ```
 */
export function createSessionRecorder(): {
  /** Middleware to add to agent */
  middleware: Middleware;
  /** Get the recorder instance (available after first message) */
  getRecorder: () => SessionRecorder;
  /** Check if recorder is initialized */
  hasRecorder: () => boolean;
} {
  let recorder: SessionRecorder | null = null;

  const middleware: Middleware = {
    name: 'session-recorder',
    direction: 'both',
    priority: 1, // Very high priority - record everything
    fn: async (msg, ctx, next) => {
      if (!recorder) {
        recorder = new SessionRecorder(
          ctx.agent.id,
          ctx.agent.name,
          ctx.config.command,
          ctx.config.args ?? [],
          ctx.config.cols && ctx.config.rows
            ? { cols: ctx.config.cols, rows: ctx.config.rows }
            : undefined
        );
      }
      recorder.record(msg);
      await next();
    },
  };

  return {
    middleware,
    getRecorder: () => {
      if (!recorder) {
        throw new Error('Recorder not initialized. Send at least one message first.');
      }
      return recorder;
    },
    hasRecorder: () => recorder !== null,
  };
}

/**
 * Create a session player from various sources
 */
export function createSessionPlayer(
  source: string | SessionData | SessionRecorder
): SessionPlayer {
  if (typeof source === 'string') {
    return SessionPlayer.fromJSON(source);
  }
  if (source instanceof SessionRecorder) {
    return SessionPlayer.fromData(source.getData());
  }
  return SessionPlayer.fromData(source);
}
