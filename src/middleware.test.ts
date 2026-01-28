/**
 * Middleware Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
} from './middleware';
import type { Message, Context, Middleware } from './types';

// Helper to create mock message
function createMockMessage(text: string, direction: 'in' | 'out' = 'out'): Message {
  return {
    raw: text,
    text,
    direction,
    ts: Date.now(),
    agentId: 'test-agent',
    seq: 1,
    meta: {},
  };
}

// Helper to create mock context
function createMockContext(): Context {
  return {
    agent: { id: 'test', name: 'test-agent' } as any,
    config: { command: 'test' } as any,
    history: [],
    state: new Map(),
    send: vi.fn(),
    emit: vi.fn(),
    log: vi.fn(),
  };
}

describe('middleware factory', () => {
  it('should create middleware with correct structure', () => {
    const fn = vi.fn();
    const mw = middleware('test', 'both', fn, 50);

    expect(mw.name).toBe('test');
    expect(mw.direction).toBe('both');
    expect(mw.fn).toBe(fn);
    expect(mw.priority).toBe(50);
    expect(mw.enabled).toBe(true);
  });

  it('should use default priority of 100', () => {
    const mw = middleware('test', 'in', vi.fn());
    expect(mw.priority).toBe(100);
  });
});

describe('logger', () => {
  it('should log messages', async () => {
    const log = vi.fn();
    const mw = logger({ logger: log });
    const msg = createMockMessage('test output');
    const ctx = createMockContext();

    await mw.fn(msg, ctx, async () => {});

    expect(log).toHaveBeenCalled();
  });

  it('should respect input/output flags', async () => {
    const log = vi.fn();
    const mw = logger({ logger: log, input: false, output: true });

    const inMsg = createMockMessage('input', 'in');
    const outMsg = createMockMessage('output', 'out');
    const ctx = createMockContext();

    await mw.fn(inMsg, ctx, async () => {});
    expect(log).not.toHaveBeenCalled();

    await mw.fn(outMsg, ctx, async () => {});
    expect(log).toHaveBeenCalled();
  });

  it('should truncate long messages', async () => {
    const log = vi.fn();
    const mw = logger({ logger: log, maxLength: 10 });
    const msg = createMockMessage('a'.repeat(50));

    await mw.fn(msg, createMockContext(), async () => {});

    expect(log).toHaveBeenCalled();
    // Second argument is the text
    const loggedText = log.mock.calls[0][1];
    expect(loggedText).toContain('...');
  });
});

describe('interceptor', () => {
  it('should block matching patterns', async () => {
    const next = vi.fn();
    const mw = interceptor({ block: [/password/i] });

    const msg = createMockMessage('my password is secret');
    await mw.fn(msg, createMockContext(), next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should allow non-matching patterns', async () => {
    const next = vi.fn();
    const mw = interceptor({ block: [/password/i] });

    const msg = createMockMessage('hello world');
    await mw.fn(msg, createMockContext(), next);

    expect(next).toHaveBeenCalled();
  });

  it('should transform input messages', async () => {
    const mw = interceptor({
      transformIn: (msg) => ({ ...msg, raw: 'modified' }),
    });

    const msg = createMockMessage('original', 'in');
    await mw.fn(msg, createMockContext(), async () => {});

    expect(msg.raw).toBe('modified');
  });

  it('should transform output messages', async () => {
    const mw = interceptor({
      transformOut: (msg) => ({ ...msg, raw: 'modified' }),
    });

    const msg = createMockMessage('original', 'out');
    await mw.fn(msg, createMockContext(), async () => {});

    expect(msg.raw).toBe('modified');
  });

  it('should use allow list when provided', async () => {
    const next = vi.fn();
    const mw = interceptor({ allow: [/allowed/] });

    await mw.fn(createMockMessage('blocked message'), createMockContext(), next);
    expect(next).not.toHaveBeenCalled();

    await mw.fn(createMockMessage('allowed message'), createMockContext(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('inject', () => {
  it('should prepend content', async () => {
    const mw = inject({ prefix: '[PREFIX]' });
    const msg = createMockMessage('test', 'in');

    await mw.fn(msg, createMockContext(), async () => {});

    expect(msg.raw).toBe('[PREFIX]test');
  });

  it('should append content', async () => {
    const mw = inject({ suffix: '[SUFFIX]' });
    const msg = createMockMessage('test', 'in');

    await mw.fn(msg, createMockContext(), async () => {});

    expect(msg.raw).toBe('test[SUFFIX]');
  });

  it('should inject only once when once=true', async () => {
    const mw = inject({ prefix: '[X]', once: true });
    const ctx = createMockContext();

    const msg1 = createMockMessage('first', 'in');
    await mw.fn(msg1, ctx, async () => {});
    expect(msg1.raw).toBe('[X]first');

    const msg2 = createMockMessage('second', 'in');
    await mw.fn(msg2, ctx, async () => {});
    expect(msg2.raw).toBe('second'); // Not modified
  });
});

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow messages under limit', async () => {
    const next = vi.fn();
    const mw = rateLimit({ max: 5, window: 1000 });

    for (let i = 0; i < 5; i++) {
      await mw.fn(createMockMessage('test', 'in'), createMockContext(), next);
    }

    expect(next).toHaveBeenCalledTimes(5);
  });

  it('should block messages over limit', async () => {
    const next = vi.fn();
    const onLimit = vi.fn();
    const mw = rateLimit({ max: 2, window: 1000, onLimit });

    await mw.fn(createMockMessage('1', 'in'), createMockContext(), next);
    await mw.fn(createMockMessage('2', 'in'), createMockContext(), next);
    await mw.fn(createMockMessage('3', 'in'), createMockContext(), next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(onLimit).toHaveBeenCalled();
  });

  it('should reset after window expires', async () => {
    const next = vi.fn();
    const mw = rateLimit({ max: 2, window: 1000 });

    await mw.fn(createMockMessage('1', 'in'), createMockContext(), next);
    await mw.fn(createMockMessage('2', 'in'), createMockContext(), next);

    vi.advanceTimersByTime(1100);

    await mw.fn(createMockMessage('3', 'in'), createMockContext(), next);
    expect(next).toHaveBeenCalledTimes(3);
  });
});

describe('recorder', () => {
  it('should record messages', async () => {
    const rec = recorder();

    await rec.fn(createMockMessage('test1'), createMockContext(), async () => {});
    await rec.fn(createMockMessage('test2'), createMockContext(), async () => {});

    const recording = rec.getRecording();
    expect(recording).toHaveLength(2);
  });

  it('should respect maxSize', async () => {
    const rec = recorder({ maxSize: 2 });

    await rec.fn(createMockMessage('1'), createMockContext(), async () => {});
    await rec.fn(createMockMessage('2'), createMockContext(), async () => {});
    await rec.fn(createMockMessage('3'), createMockContext(), async () => {});

    const recording = rec.getRecording();
    expect(recording).toHaveLength(2);
    expect(recording[0].text).toBe('2');
    expect(recording[1].text).toBe('3');
  });

  it('should clear recording', async () => {
    const rec = recorder();

    await rec.fn(createMockMessage('test'), createMockContext(), async () => {});
    rec.clear();

    expect(rec.getRecording()).toHaveLength(0);
  });
});

describe('filter', () => {
  it('should pass matching messages', async () => {
    const next = vi.fn();
    const mw = filter(/success/);

    await mw.fn(createMockMessage('operation success'), createMockContext(), next);
    expect(next).toHaveBeenCalled();
  });

  it('should block non-matching messages', async () => {
    const next = vi.fn();
    const mw = filter(/success/);

    await mw.fn(createMockMessage('operation failed'), createMockContext(), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('should support invert option', async () => {
    const next = vi.fn();
    const mw = filter(/error/, { invert: true });

    await mw.fn(createMockMessage('error occurred'), createMockContext(), next);
    expect(next).not.toHaveBeenCalled();

    next.mockClear();
    await mw.fn(createMockMessage('success'), createMockContext(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('stealth', () => {
  it('should remove proxy indicators', async () => {
    const mw = stealth();
    const msg = createMockMessage('ptyx [proxy] test', 'in');

    await mw.fn(msg, createMockContext(), async () => {});

    expect(msg.raw).not.toContain('ptyx');
    expect(msg.raw).not.toContain('[proxy]');
  });
});

describe('metrics', () => {
  it('should track message counts', async () => {
    const met = metrics();

    await met.fn(createMockMessage('in', 'in'), createMockContext(), async () => {});
    await met.fn(createMockMessage('out', 'out'), createMockContext(), async () => {});

    const data = met.getMetrics();
    expect(data.messagesIn).toBe(1);
    expect(data.messagesOut).toBe(1);
  });

  it('should track bytes', async () => {
    const met = metrics();

    await met.fn(createMockMessage('hello', 'in'), createMockContext(), async () => {});
    await met.fn(createMockMessage('world!', 'out'), createMockContext(), async () => {});

    const data = met.getMetrics();
    expect(data.bytesIn).toBe(5);
    expect(data.bytesOut).toBe(6);
  });

  it('should track latency', async () => {
    const met = metrics({ trackLatency: true });

    await met.fn(createMockMessage('input', 'in'), createMockContext(), async () => {});
    await new Promise(r => setTimeout(r, 10));
    await met.fn(createMockMessage('output', 'out'), createMockContext(), async () => {});

    const data = met.getMetrics();
    expect(data.latencies.length).toBeGreaterThan(0);
    expect(data.latencies[0]).toBeGreaterThanOrEqual(0);
  });

  it('should reset metrics', async () => {
    const met = metrics();

    await met.fn(createMockMessage('test', 'in'), createMockContext(), async () => {});
    met.reset();

    const data = met.getMetrics();
    expect(data.messagesIn).toBe(0);
    expect(data.bytesIn).toBe(0);
  });

  it('should call onUpdate callback', async () => {
    const onUpdate = vi.fn();
    const met = metrics({ onUpdate });

    await met.fn(createMockMessage('test', 'in'), createMockContext(), async () => {});

    expect(onUpdate).toHaveBeenCalled();
  });
});

describe('audit', () => {
  it('should write audit entries', async () => {
    const writer = vi.fn();
    const mw = audit({ writer });

    await mw.fn(createMockMessage('test'), createMockContext(), async () => {});

    expect(writer).toHaveBeenCalled();
    const entry = writer.mock.calls[0][0];
    expect(entry.agentId).toBe('test-agent');
    expect(entry.direction).toBe('out');
    expect(entry.dataLength).toBe(4);
    expect(entry.dataHash).toBeDefined();
  });

  it('should include metadata when requested', async () => {
    const writer = vi.fn();
    const mw = audit({ writer, includeMeta: true });

    const msg = createMockMessage('test');
    msg.meta.custom = 'value';
    await mw.fn(msg, createMockContext(), async () => {});

    const entry = writer.mock.calls[0][0];
    expect(entry.meta).toBeDefined();
    expect(entry.meta.custom).toBe('value');
  });

  it('should use custom hash function', async () => {
    const writer = vi.fn();
    const hashFn = vi.fn().mockReturnValue('custom-hash');
    const mw = audit({ writer, hashFn });

    await mw.fn(createMockMessage('test'), createMockContext(), async () => {});

    expect(hashFn).toHaveBeenCalledWith('test');
    const entry = writer.mock.calls[0][0];
    expect(entry.dataHash).toBe('custom-hash');
  });
});

describe('buffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should buffer output and flush on interval', async () => {
    const onFlush = vi.fn();
    const mw = buffer({ onFlush, interval: 100 });

    await mw.fn(createMockMessage('hello '), createMockContext(), async () => {});
    await mw.fn(createMockMessage('world'), createMockContext(), async () => {});

    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(onFlush).toHaveBeenCalledWith('hello world');
  });

  it('should flush on pattern match', async () => {
    const onFlush = vi.fn();
    const mw = buffer({ onFlush, flushOn: /\n/ });

    await mw.fn(createMockMessage('hello\n'), createMockContext(), async () => {});

    expect(onFlush).toHaveBeenCalledWith('hello\n');
  });
});

describe('echo', () => {
  it('should emit input as output', async () => {
    const mw = echo();
    const ctx = createMockContext();

    await mw.fn(createMockMessage('test', 'in'), ctx, async () => {});

    expect(ctx.emit).toHaveBeenCalled();
  });
});
