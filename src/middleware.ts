import type { Middleware, MiddlewareFn, Message, Context } from './types.js';
import * as fs from 'node:fs';
import { createLogger } from './logger.js';

// Default logger for middleware
const defaultLog = createLogger('middleware');

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware Factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a middleware definition
 */
export function middleware(
  name: string,
  direction: 'in' | 'out' | 'both',
  fn: MiddlewareFn,
  priority = 100
): Middleware {
  return { name, direction, fn, priority, enabled: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Logging Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface LogOptions {
  /** Log input messages */
  input?: boolean;
  /** Log output messages */
  output?: boolean;
  /** Custom logger */
  logger?: (direction: string, text: string) => void;
  /** Include timestamps */
  timestamps?: boolean;
  /** Max message length to log */
  maxLength?: number;
}

/**
 * Logging middleware
 */
export function logger(options: LogOptions = {}): Middleware {
  const {
    input = true,
    output = true,
    logger: log = (dir: string, text: string) => defaultLog.info(`${dir} ${text}`),
    timestamps = true,
    maxLength = 200,
  } = options;
  
  return middleware(
    'logger',
    'both',
    async (msg, ctx, next) => {
      const shouldLog =
        (msg.direction === 'in' && input) ||
        (msg.direction === 'out' && output);
      
      if (shouldLog) {
        const ts = timestamps ? `[${new Date().toISOString()}] ` : '';
        const dir = msg.direction === 'in' ? '>>>' : '<<<';
        const text = msg.text.length > maxLength
          ? msg.text.slice(0, maxLength) + '...'
          : msg.text;

        log(dir, `${ts}${text.replace(/\n/g, '\\n')}`);
      }
      
      await next();
    },
    10 // High priority
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// File Logger Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface FileLogOptions {
  /** Path to log file */
  path: string;
  /** Append mode (default: true) */
  append?: boolean;
  /** Include raw data (with ANSI) */
  raw?: boolean;
}

/**
 * Log all I/O to a file
 */
export function fileLogger(options: FileLogOptions): Middleware {
  const { path: filePath, append = true, raw = false } = options;
  
  const stream = fs.createWriteStream(filePath, {
    flags: append ? 'a' : 'w',
  });
  
  stream.write(`\n=== Session: ${new Date().toISOString()} ===\n`);
  
  return middleware(
    'file-logger',
    'both',
    async (msg, ctx, next) => {
      const prefix = msg.direction === 'in' ? '>>> ' : '<<< ';
      const content = raw ? msg.raw : msg.text;
      stream.write(`${prefix}${content}`);
      await next();
    },
    5 // Very high priority
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Interceptor Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface InterceptOptions {
  /** Transform input */
  transformIn?: (msg: Message) => Message | null;
  /** Transform output */
  transformOut?: (msg: Message) => Message | null;
  /** Block patterns */
  block?: RegExp[];
  /** Allow only patterns */
  allow?: RegExp[];
}

/**
 * Intercept and transform messages
 */
export function interceptor(options: InterceptOptions = {}): Middleware {
  const { transformIn, transformOut, block = [], allow } = options;
  
  return middleware(
    'interceptor',
    'both',
    async (msg, ctx, next) => {
      // Check allow/block
      if (allow && allow.length > 0) {
        if (!allow.some(p => p.test(msg.text))) return;
      } else if (block.length > 0) {
        if (block.some(p => p.test(msg.text))) return;
      }
      
      // Transform
      if (msg.direction === 'in' && transformIn) {
        const result = transformIn(msg);
        if (!result) return;
        Object.assign(msg, result);
      }
      
      if (msg.direction === 'out' && transformOut) {
        const result = transformOut(msg);
        if (!result) return;
        Object.assign(msg, result);
      }
      
      await next();
    },
    50
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Injection Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface InjectOptions {
  /** Content to prepend to input */
  prefix?: string;
  /** Content to append to input */
  suffix?: string;
  /** Only inject on first message */
  once?: boolean;
}

/**
 * Inject content into messages
 */
export function inject(options: InjectOptions): Middleware {
  const { prefix = '', suffix = '', once = false } = options;
  let injected = false;
  
  return middleware(
    'inject',
    'in',
    async (msg, ctx, next) => {
      if (once && injected) {
        await next();
        return;
      }
      
      if (prefix) msg.raw = prefix + msg.raw;
      if (suffix) msg.raw = msg.raw + suffix;
      
      injected = true;
      await next();
    },
    40
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rate Limiter Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface RateLimitOptions {
  /** Max messages per window */
  max: number;
  /** Window size in ms */
  window: number;
  /** Callback when limited */
  onLimit?: () => void;
}

/**
 * Rate limit input messages
 */
export function rateLimit(options: RateLimitOptions): Middleware {
  const { max, window: windowMs, onLimit } = options;
  const timestamps: number[] = [];
  
  return middleware(
    'rate-limit',
    'in',
    async (msg, ctx, next) => {
      const now = Date.now();
      
      // Clean old timestamps
      while (timestamps.length && timestamps[0] < now - windowMs) {
        timestamps.shift();
      }
      
      if (timestamps.length >= max) {
        msg.meta.rateLimited = true;
        onLimit?.();
        return; // Block
      }
      
      timestamps.push(now);
      await next();
    },
    20
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Buffer Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface BufferOptions {
  /** Callback with buffered output */
  onFlush: (buffer: string) => void;
  /** Flush interval in ms */
  interval?: number;
  /** Flush on pattern */
  flushOn?: RegExp;
}

/**
 * Buffer output messages
 */
export function buffer(options: BufferOptions): Middleware {
  const { onFlush, interval = 100, flushOn } = options;
  let buf = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (buf) {
      onFlush(buf);
      buf = '';
    }
  };
  
  return middleware(
    'buffer',
    'out',
    async (msg, ctx, next) => {
      buf += msg.text;
      
      if (flushOn && flushOn.test(buf)) {
        flush();
      } else {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, interval);
      }
      
      await next();
    },
    150
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Echo Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Echo input to output (for debugging)
 */
export function echo(): Middleware {
  return middleware(
    'echo',
    'in',
    async (msg, ctx, next) => {
      ctx.emit(`[echo] ${msg.text}`);
      await next();
    },
    200
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Recorder Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface RecorderOptions {
  /** Max messages to keep */
  maxSize?: number;
}

/**
 * Record messages for later replay
 */
export function recorder(options: RecorderOptions = {}): Middleware & {
  getRecording: () => Message[];
  clear: () => void;
} {
  const { maxSize = 1000 } = options;
  const recording: Message[] = [];
  
  const mw = middleware(
    'recorder',
    'both',
    async (msg, ctx, next) => {
      recording.push({ ...msg });
      
      if (recording.length > maxSize) {
        recording.shift();
      }
      
      await next();
    },
    1 // Highest priority
  );
  
  return {
    ...mw,
    getRecording: () => [...recording],
    clear: () => { recording.length = 0; },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Filter Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filter output by pattern
 */
export function filter(
  pattern: RegExp,
  options: { invert?: boolean } = {}
): Middleware {
  const { invert = false } = options;
  
  return middleware(
    'filter',
    'out',
    async (msg, ctx, next) => {
      const matches = pattern.test(msg.text);
      const shouldPass = invert ? !matches : matches;
      
      if (shouldPass) {
        await next();
      }
    },
    100
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stealth Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Remove traces of proxy from environment
 */
export function stealth(): Middleware {
  return middleware(
    'stealth',
    'in',
    async (msg, ctx, next) => {
      // Remove any proxy indicators from input
      msg.raw = msg.raw
        .replace(/ptyx/gi, '')
        .replace(/\[proxy\]/gi, '')
        .replace(/\[intercepted\]/gi, '');
      
      await next();
    },
    2
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Metrics Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface MetricsData {
  /** Count of input messages */
  messagesIn: number;
  /** Count of output messages */
  messagesOut: number;
  /** Total bytes received as input */
  bytesIn: number;
  /** Total bytes sent as output */
  bytesOut: number;
  /** Recent latencies in ms (input to output) */
  latencies: number[];
  /** Session start time */
  startTime: number;
  /** Count of errors */
  errors: number;
}

export interface MetricsOptions {
  /** Track latency for input->output pairs */
  trackLatency?: boolean;
  /** Max latency samples to keep */
  maxLatencySamples?: number;
  /** Callback when metrics update */
  onUpdate?: (metrics: MetricsData) => void;
}

/**
 * Metrics middleware for performance monitoring
 */
export function metrics(options: MetricsOptions = {}): Middleware & {
  getMetrics: () => MetricsData;
  reset: () => void;
} {
  const { trackLatency = true, maxLatencySamples = 100, onUpdate } = options;

  const data: MetricsData = {
    messagesIn: 0,
    messagesOut: 0,
    bytesIn: 0,
    bytesOut: 0,
    latencies: [],
    startTime: Date.now(),
    errors: 0,
  };

  let lastInputTime = 0;

  const mw = middleware(
    'metrics',
    'both',
    async (msg, ctx, next) => {
      try {
        if (msg.direction === 'in') {
          data.messagesIn++;
          data.bytesIn += msg.raw.length;
          if (trackLatency) lastInputTime = Date.now();
        } else {
          data.messagesOut++;
          data.bytesOut += msg.raw.length;
          if (trackLatency && lastInputTime > 0) {
            const latency = Date.now() - lastInputTime;
            data.latencies.push(latency);
            if (data.latencies.length > maxLatencySamples) {
              data.latencies.shift();
            }
            lastInputTime = 0;
          }
        }

        onUpdate?.({ ...data, latencies: [...data.latencies] });
        await next();
      } catch (err) {
        data.errors++;
        throw err;
      }
    },
    5 // High priority
  );

  return {
    ...mw,
    getMetrics: () => ({ ...data, latencies: [...data.latencies] }),
    reset: () => {
      data.messagesIn = 0;
      data.messagesOut = 0;
      data.bytesIn = 0;
      data.bytesOut = 0;
      data.latencies = [];
      data.startTime = Date.now();
      data.errors = 0;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Audit Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuditLogEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Agent ID */
  agentId: string;
  /** Agent name */
  agentName: string;
  /** Message direction */
  direction: 'in' | 'out';
  /** Hash of the content (for integrity) */
  dataHash: string;
  /** Content length */
  dataLength: number;
  /** Sequence number */
  seq: number;
  /** Optional metadata */
  meta?: Record<string, unknown>;
}

export interface AuditOptions {
  /** Write audit log entry */
  writer: (entry: AuditLogEntry) => void | Promise<void>;
  /** Include message metadata */
  includeMeta?: boolean;
  /** Custom hash function (default: simple hash) */
  hashFn?: (data: string) => string;
}

/**
 * Simple hash function for audit logging
 */
function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Audit logging middleware for compliance and security
 */
export function audit(options: AuditOptions): Middleware {
  const { writer, includeMeta = false, hashFn = simpleHash } = options;

  return middleware(
    'audit',
    'both',
    async (msg, ctx, next) => {
      const entry: AuditLogEntry = {
        timestamp: new Date(msg.ts).toISOString(),
        agentId: msg.agentId,
        agentName: ctx.agent.name,
        direction: msg.direction,
        dataHash: hashFn(msg.raw),
        dataLength: msg.raw.length,
        seq: msg.seq,
        ...(includeMeta && Object.keys(msg.meta).length > 0 ? { meta: msg.meta } : {}),
      };

      await writer(entry);
      await next();
    },
    2 // Very high priority - runs before most other middleware
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

export type { Middleware, MiddlewareFn, Message, Context };
