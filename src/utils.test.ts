import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uid,
  stripAnsi,
  createMessage,
  formatLine,
  matchPattern,
  FlushBuffer,
  escapeShell,
  getTerminalSize,
} from './utils.js';

describe('uid', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(uid());
    }
    expect(ids.size).toBe(100);
  });
  
  it('has correct format', () => {
    const id = uid();
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[32mgreen\x1b[0m')).toBe('green');
    expect(stripAnsi('\x1b[1;31mred bold\x1b[0m')).toBe('red bold');
  });
  
  it('preserves plain text', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });
});

describe('createMessage', () => {
  it('creates message with correct structure', () => {
    const msg = createMessage('hello', 'in', 'agent-1', 1);
    
    expect(msg.raw).toBe('hello');
    expect(msg.text).toBe('hello');
    expect(msg.direction).toBe('in');
    expect(msg.agentId).toBe('agent-1');
    expect(msg.seq).toBe(1);
    expect(msg.ts).toBeGreaterThan(0);
    expect(msg.meta).toEqual({});
  });
  
  it('strips ANSI from text', () => {
    const msg = createMessage('\x1b[32mhello\x1b[0m', 'out', 'a', 1);
    expect(msg.raw).toBe('\x1b[32mhello\x1b[0m');
    expect(msg.text).toBe('hello');
  });
});

describe('formatLine', () => {
  it('adds newline if missing', () => {
    expect(formatLine('hello')).toBe('hello\n');
  });
  
  it('preserves existing newline', () => {
    expect(formatLine('hello\n')).toBe('hello\n');
  });
});

describe('matchPattern', () => {
  it('matches string patterns', () => {
    expect(matchPattern('hello world', 'world')).toBe(true);
    expect(matchPattern('hello world', 'foo')).toBe(false);
  });
  
  it('matches regex patterns', () => {
    expect(matchPattern('hello world', /wor.d/)).toBe(true);
    expect(matchPattern('hello world', /^world/)).toBe(false);
  });
});

describe('FlushBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
  });
  
  it('flushes on newline', () => {
    const onFlush = vi.fn();
    const buf = new FlushBuffer(onFlush, 50);
    
    buf.push('hello');
    expect(onFlush).not.toHaveBeenCalled();
    
    buf.push('\n');
    expect(onFlush).toHaveBeenCalledWith('hello\n');
  });
  
  it('flushes on timeout', () => {
    const onFlush = vi.fn();
    const buf = new FlushBuffer(onFlush, 50);
    
    buf.push('hello');
    expect(onFlush).not.toHaveBeenCalled();
    
    vi.advanceTimersByTime(50);
    expect(onFlush).toHaveBeenCalledWith('hello');
  });
  
  it('clears buffer', () => {
    const onFlush = vi.fn();
    const buf = new FlushBuffer(onFlush, 50);
    
    buf.push('hello');
    buf.clear();
    
    vi.advanceTimersByTime(100);
    expect(onFlush).not.toHaveBeenCalled();
  });
});

describe('escapeShell', () => {
  it('escapes special characters', () => {
    expect(escapeShell('$HOME')).toBe('\\$HOME');
    expect(escapeShell('"test"')).toBe('\\"test\\"');
    expect(escapeShell('`cmd`')).toBe('\\`cmd\\`');
  });
});

describe('getTerminalSize', () => {
  it('returns dimensions', () => {
    const size = getTerminalSize();
    expect(size.cols).toBeGreaterThan(0);
    expect(size.rows).toBeGreaterThan(0);
  });
});
