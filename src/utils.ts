import type { Message, MessageDirection } from './types.js';

// Dynamic import for strip-ansi (ESM only)
let stripAnsiModule: ((text: string) => string) | null = null;

async function loadStripAnsi(): Promise<(text: string) => string> {
  if (!stripAnsiModule) {
    const mod = await import('strip-ansi');
    stripAnsiModule = mod.default;
  }
  return stripAnsiModule;
}

/**
 * Synchronous ANSI stripping (basic)
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Generate unique ID
 */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a message object
 */
export function createMessage(
  raw: string,
  direction: MessageDirection,
  agentId: string,
  seq: number
): Message {
  return {
    raw,
    text: stripAnsi(raw),
    direction,
    ts: Date.now(),
    agentId,
    seq,
    meta: {},
  };
}

/**
 * Format data for sending (ensure newline)
 */
export function formatLine(data: string): string {
  return data.endsWith('\n') ? data : data + '\n';
}

/**
 * Debounce helper
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Timeout promise wrapper
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simple pattern matching
 */
export function matchPattern(text: string, pattern: RegExp | string): boolean {
  if (typeof pattern === 'string') {
    return text.includes(pattern);
  }
  return pattern.test(text);
}

/**
 * Buffer that flushes on boundaries or timeout
 */
export class FlushBuffer {
  private buffer = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  
  constructor(
    private onFlush: (data: string) => void,
    private delay = 50,
    private boundaries = ['\n', '\r']
  ) {}
  
  push(chunk: string): void {
    this.buffer += chunk;
    
    if (this.timer) clearTimeout(this.timer);
    
    // Check for boundary
    if (this.boundaries.some(b => this.buffer.endsWith(b))) {
      this.flush();
    } else {
      this.timer = setTimeout(() => this.flush(), this.delay);
    }
  }
  
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer) {
      this.onFlush(this.buffer);
      this.buffer = '';
    }
  }
  
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buffer = '';
  }
}

/**
 * Escape shell special characters
 */
export function escapeShell(str: string): string {
  return str.replace(/([\\$`"!])/g, '\\$1');
}

/**
 * Check if running in TTY
 */
export function isTTY(): boolean {
  return process.stdout.isTTY ?? false;
}

/**
 * Get terminal size
 */
export function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 30,
  };
}
