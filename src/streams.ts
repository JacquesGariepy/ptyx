/**
 * Node.js Streams API for ptyx
 *
 * Provides Readable, Writable, and Duplex streams for agent I/O.
 *
 * @example
 * ```typescript
 * import { createAgent } from 'ptyx';
 * import { createReadStream, createWriteStream, createDuplexStream } from 'ptyx/streams';
 * import { pipeline } from 'node:stream/promises';
 *
 * const agent = await createAgent({ command: 'node', args: ['-i'] });
 *
 * // Read stream
 * const readable = createReadStream(agent);
 * readable.pipe(process.stdout);
 *
 * // Write stream
 * const writable = createWriteStream(agent);
 * process.stdin.pipe(writable);
 *
 * // Duplex stream
 * const duplex = createDuplexStream(agent);
 * ```
 *
 * @packageDocumentation
 */

import { Readable, Writable, Duplex } from 'node:stream';
import type { Agent, Message } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReadStreamOptions {
  /** Include ANSI escape codes (default: true) */
  raw?: boolean;
  /** Stream Message objects instead of strings (default: false) */
  objectMode?: boolean;
  /** High water mark for buffering */
  highWaterMark?: number;
}

export interface WriteStreamOptions {
  /** Add newline to each chunk (default: false) */
  addNewline?: boolean;
  /** High water mark for buffering */
  highWaterMark?: number;
}

export interface DuplexStreamOptions extends ReadStreamOptions, WriteStreamOptions {}

// ═══════════════════════════════════════════════════════════════════════════════
// Read Stream
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a readable stream from agent output
 *
 * @example
 * ```typescript
 * const readable = createReadStream(agent);
 * readable.on('data', (chunk) => console.log(chunk));
 *
 * // With options
 * const readable = createReadStream(agent, { raw: false, objectMode: true });
 * readable.on('data', (msg) => console.log(msg.text));
 * ```
 */
export function createReadStream(
  agent: Agent,
  options?: ReadStreamOptions
): Readable {
  const { raw = true, objectMode = false, highWaterMark } = options ?? {};

  const stream = new Readable({
    objectMode,
    highWaterMark,
    read() {
      // Pull-based reading not needed - we push data on events
    },
  });

  const messageHandler = (msg: Message) => {
    if (msg.direction === 'out') {
      if (objectMode) {
        stream.push(msg);
      } else {
        stream.push(raw ? msg.raw : msg.text);
      }
    }
  };

  const exitHandler = () => {
    stream.push(null); // Signal end of stream
    cleanup();
  };

  const errorHandler = (err: Error) => {
    stream.destroy(err);
    cleanup();
  };

  const cleanup = () => {
    agent.off('message', messageHandler);
    agent.off('exit', exitHandler);
    agent.off('error', errorHandler);
  };

  agent.on('message', messageHandler);
  agent.on('exit', exitHandler);
  agent.on('error', errorHandler);

  // Handle stream destruction
  stream.on('close', cleanup);

  return stream;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Write Stream
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a writable stream to agent input
 *
 * @example
 * ```typescript
 * const writable = createWriteStream(agent);
 * writable.write('console.log("hello")');
 * writable.write('\n');
 *
 * // With newline auto-add
 * const writable = createWriteStream(agent, { addNewline: true });
 * writable.write('console.log("hello")'); // Newline added automatically
 * ```
 */
export function createWriteStream(
  agent: Agent,
  options?: WriteStreamOptions
): Writable {
  const { addNewline = false, highWaterMark } = options ?? {};

  const stream = new Writable({
    highWaterMark,
    write(chunk, encoding, callback) {
      try {
        if (!agent.running) {
          callback(new Error('Agent is not running'));
          return;
        }

        const data = chunk.toString();
        if (addNewline && !data.endsWith('\n') && !data.endsWith('\r')) {
          agent.sendLine(data);
        } else {
          agent.send(data);
        }
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
    final(callback) {
      callback();
    },
    destroy(err, callback) {
      callback(err);
    },
  });

  // Handle agent exit
  const exitHandler = () => {
    if (!stream.destroyed) {
      stream.end();
    }
  };

  agent.on('exit', exitHandler);
  stream.on('close', () => {
    agent.off('exit', exitHandler);
  });

  return stream;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Duplex Stream
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a duplex stream for bidirectional agent I/O
 *
 * @example
 * ```typescript
 * const duplex = createDuplexStream(agent);
 *
 * // Read output
 * duplex.on('data', (chunk) => console.log(chunk));
 *
 * // Write input
 * duplex.write('console.log("hello")\n');
 *
 * // Use with pipeline
 * await pipeline(
 *   someInputStream,
 *   duplex,
 *   someOutputStream
 * );
 * ```
 */
export function createDuplexStream(
  agent: Agent,
  options?: DuplexStreamOptions
): Duplex {
  const {
    raw = true,
    objectMode = false,
    addNewline = false,
    highWaterMark,
  } = options ?? {};

  const duplex = new Duplex({
    objectMode,
    readableHighWaterMark: highWaterMark,
    writableHighWaterMark: highWaterMark,
    read() {
      // Pull-based reading not needed
    },
    write(chunk, encoding, callback) {
      try {
        if (!agent.running) {
          callback(new Error('Agent is not running'));
          return;
        }

        const data = chunk.toString();
        if (addNewline && !data.endsWith('\n') && !data.endsWith('\r')) {
          agent.sendLine(data);
        } else {
          agent.send(data);
        }
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
    final(callback) {
      callback();
    },
  });

  const messageHandler = (msg: Message) => {
    if (msg.direction === 'out') {
      if (objectMode) {
        duplex.push(msg);
      } else {
        duplex.push(raw ? msg.raw : msg.text);
      }
    }
  };

  const exitHandler = () => {
    duplex.push(null);
    cleanup();
  };

  const errorHandler = (err: Error) => {
    duplex.destroy(err);
    cleanup();
  };

  const cleanup = () => {
    agent.off('message', messageHandler);
    agent.off('exit', exitHandler);
    agent.off('error', errorHandler);
  };

  agent.on('message', messageHandler);
  agent.on('exit', exitHandler);
  agent.on('error', errorHandler);

  duplex.on('close', cleanup);

  return duplex;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pipe agent output to a writable stream
 *
 * @example
 * ```typescript
 * pipeOutput(agent, process.stdout);
 * pipeOutput(agent, fs.createWriteStream('output.log'), { raw: false });
 * ```
 */
export function pipeOutput(
  agent: Agent,
  destination: NodeJS.WritableStream,
  options?: ReadStreamOptions
): Readable {
  const readable = createReadStream(agent, options);
  readable.pipe(destination);
  return readable;
}

/**
 * Pipe a readable stream to agent input
 *
 * @example
 * ```typescript
 * pipeInput(process.stdin, agent);
 * pipeInput(fs.createReadStream('input.txt'), agent, { addNewline: true });
 * ```
 */
export function pipeInput(
  source: NodeJS.ReadableStream,
  agent: Agent,
  options?: WriteStreamOptions
): Writable {
  const writable = createWriteStream(agent, options);
  source.pipe(writable);
  return writable;
}

/**
 * Connect an agent to stdio (stdin/stdout)
 *
 * @example
 * ```typescript
 * const cleanup = connectStdio(agent);
 * // Later: cleanup();
 * ```
 */
export function connectStdio(
  agent: Agent,
  options?: { raw?: boolean }
): () => void {
  const { raw = true } = options ?? {};

  const readable = createReadStream(agent, { raw });
  const writable = createWriteStream(agent);

  readable.pipe(process.stdout);
  process.stdin.pipe(writable);

  return () => {
    readable.unpipe(process.stdout);
    process.stdin.unpipe(writable);
    readable.destroy();
    writable.destroy();
  };
}

/**
 * Collect all output from agent into a string
 *
 * @example
 * ```typescript
 * const output = await collectOutput(agent, { timeout: 5000 });
 * console.log(output);
 * ```
 */
export async function collectOutput(
  agent: Agent,
  options?: { raw?: boolean; timeout?: number }
): Promise<string> {
  const { raw = false, timeout = 30000 } = options ?? {};
  const chunks: string[] = [];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(chunks.join(''));
    }, timeout);

    const handler = (msg: Message) => {
      if (msg.direction === 'out') {
        chunks.push(raw ? msg.raw : msg.text);
      }
    };

    const exitHandler = () => {
      cleanup();
      resolve(chunks.join(''));
    };

    const errorHandler = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      agent.off('message', handler);
      agent.off('exit', exitHandler);
      agent.off('error', errorHandler);
    };

    agent.on('message', handler);
    agent.on('exit', exitHandler);
    agent.on('error', errorHandler);
  });
}
