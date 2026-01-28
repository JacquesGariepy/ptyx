/**
 * Streams Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'node:stream';
import {
  createReadStream,
  createWriteStream,
  createDuplexStream,
  collectOutput,
} from './streams';
import type { Message, Agent } from './types';
import { createMessage } from './utils';
import { EventEmitter } from 'node:events';

// Mock agent
function createMockAgent(): Agent & EventEmitter {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    id: 'test-agent',
    name: 'test',
    pty: null,
    pid: undefined,
    running: true,
    history: [],
    config: { command: 'test' },
    spawn: vi.fn(),
    kill: vi.fn(),
    dispose: vi.fn(),
    write: vi.fn(),
    send: vi.fn(),
    sendLine: vi.fn(),
    resize: vi.fn(),
    use: vi.fn().mockReturnThis(),
    unuse: vi.fn(),
    clear: vi.fn(),
    wait: vi.fn(),
    waitFor: vi.fn(),
    expect: vi.fn(),
    waitForAll: vi.fn(),
    waitForAny: vi.fn(),
    waitForIdle: vi.fn(),
    sendKeys: vi.fn(),
    sendSecret: vi.fn(),
    healthcheck: vi.fn(),
  }) as any;
}

describe('createReadStream', () => {
  let agent: Agent & EventEmitter;

  beforeEach(() => {
    agent = createMockAgent();
  });

  it('should create readable stream', () => {
    const stream = createReadStream(agent);
    expect(stream).toBeInstanceOf(Readable);
  });

  it('should emit data on agent output', async () => {
    const stream = createReadStream(agent);
    const chunks: string[] = [];

    const endPromise = new Promise<void>((resolve) => {
      stream.on('data', (chunk) => chunks.push(chunk.toString()));
      stream.on('end', () => resolve());
    });

    // Emit message
    const msg = createMessage('hello', 'out', 'test', 1);
    agent.emit('message', msg);

    // End stream
    agent.emit('exit', 0);

    await endPromise;
    expect(chunks).toContain('hello');
  });

  it('should filter only output messages', async () => {
    const stream = createReadStream(agent);
    const chunks: string[] = [];

    stream.on('data', (chunk) => chunks.push(chunk.toString()));

    // Emit input (should be ignored)
    agent.emit('message', createMessage('input', 'in', 'test', 1));
    // Emit output (should be captured)
    agent.emit('message', createMessage('output', 'out', 'test', 2));

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('output');
  });

  it('should strip ANSI when raw=false', async () => {
    const stream = createReadStream(agent, { raw: false });
    const chunks: string[] = [];

    stream.on('data', (chunk) => chunks.push(chunk.toString()));

    const msg = createMessage('\x1b[32mgreen\x1b[0m', 'out', 'test', 1);
    msg.text = 'green'; // Stripped version
    agent.emit('message', msg);

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(chunks[0]).toBe('green');
  });

  it('should emit Message objects in objectMode', async () => {
    const stream = createReadStream(agent, { objectMode: true });

    const msgPromise = new Promise<Message>((resolve) => {
      stream.on('data', (msg: Message) => resolve(msg));
    });

    agent.emit('message', createMessage('hello', 'out', 'test', 1));

    const msg = await msgPromise;
    expect(msg.direction).toBe('out');
    expect(msg.text).toBe('hello');
  });

  it('should end on agent exit', async () => {
    const stream = createReadStream(agent);

    const endPromise = new Promise<void>((resolve) => {
      stream.on('end', () => resolve());
      stream.on('close', () => resolve()); // Also handle close event
    });

    // Need to start reading for the stream to emit end
    stream.resume();

    agent.emit('exit', 0);

    await endPromise;
  });
});

describe('createWriteStream', () => {
  let agent: Agent & EventEmitter;

  beforeEach(() => {
    agent = createMockAgent();
  });

  it('should create writable stream', () => {
    const stream = createWriteStream(agent);
    expect(stream).toBeInstanceOf(Writable);
  });

  it('should send data to agent', async () => {
    const stream = createWriteStream(agent);

    await new Promise<void>((resolve) => {
      stream.write('hello', () => {
        expect(agent.send).toHaveBeenCalledWith('hello');
        resolve();
      });
    });
  });

  it('should add newline when addNewline=true', async () => {
    const stream = createWriteStream(agent, { addNewline: true });

    await new Promise<void>((resolve) => {
      stream.write('hello', () => {
        expect(agent.sendLine).toHaveBeenCalledWith('hello');
        resolve();
      });
    });
  });

  it('should not add newline if already present', async () => {
    const stream = createWriteStream(agent, { addNewline: true });

    await new Promise<void>((resolve) => {
      stream.write('hello\n', () => {
        expect(agent.send).toHaveBeenCalledWith('hello\n');
        resolve();
      });
    });
  });

  it('should error when agent not running', async () => {
    (agent as any).running = false;
    const stream = createWriteStream(agent);

    const errorPromise = new Promise<Error>((resolve) => {
      stream.on('error', (err) => resolve(err));
    });

    stream.write('hello');

    const err = await errorPromise;
    expect(err.message).toContain('not running');
  });
});

describe('createDuplexStream', () => {
  let agent: Agent & EventEmitter;

  beforeEach(() => {
    agent = createMockAgent();
  });

  it('should handle both read and write', async () => {
    const stream = createDuplexStream(agent);
    const received: string[] = [];

    stream.on('data', (chunk) => received.push(chunk.toString()));

    // Write to stream
    stream.write('input');
    expect(agent.send).toHaveBeenCalledWith('input');

    // Emit output from agent
    agent.emit('message', createMessage('output', 'out', 'test', 1));

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(received).toContain('output');
  });
});

describe('collectOutput', () => {
  let agent: Agent & EventEmitter;

  beforeEach(() => {
    agent = createMockAgent();
  });

  it('should collect all output', async () => {
    const promise = collectOutput(agent, { timeout: 100 });

    agent.emit('message', createMessage('hello ', 'out', 'test', 1));
    agent.emit('message', createMessage('world', 'out', 'test', 2));
    agent.emit('exit', 0);

    const output = await promise;
    expect(output).toBe('hello world');
  });

  it('should timeout if no exit', async () => {
    const promise = collectOutput(agent, { timeout: 50 });

    agent.emit('message', createMessage('partial', 'out', 'test', 1));

    const output = await promise;
    expect(output).toBe('partial');
  });

  it('should ignore input messages', async () => {
    const promise = collectOutput(agent, { timeout: 100 });

    agent.emit('message', createMessage('input', 'in', 'test', 1));
    agent.emit('message', createMessage('output', 'out', 'test', 2));
    agent.emit('exit', 0);

    const output = await promise;
    expect(output).toBe('output');
  });
});
