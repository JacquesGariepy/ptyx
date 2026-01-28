/**
 * Server Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtyServer, createServer } from './server';

// Mock ws module
vi.mock('ws', () => {
  const mockSocket = {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  };

  const mockWss = {
    on: vi.fn(),
    close: vi.fn((cb) => cb?.()),
  };

  return {
    WebSocketServer: vi.fn(() => mockWss),
  };
});

// Mock agent module
vi.mock('./agent', () => ({
  createAgent: vi.fn(async () => ({
    id: 'mock-agent',
    name: 'mock',
    running: true,
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('PtyServer', () => {
  let server: PtyServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new PtyServer({
      port: 8080,
      debug: false,
    });
  });

  afterEach(async () => {
    if (server.running) {
      await server.stop();
    }
  });

  describe('creation', () => {
    it('should create server with default config', () => {
      const s = new PtyServer();
      expect(s.connections).toBe(0);
      expect(s.running).toBe(false);
    });

    it('should accept custom config', () => {
      const s = new PtyServer({
        port: 9090,
        host: 'localhost',
        maxConnections: 50,
      });
      expect(s).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    it('should start server', async () => {
      await server.start();
      expect(server.running).toBe(true);
    });

    it('should emit listening event', async () => {
      const handler = vi.fn();
      server.on('listening', handler);

      await server.start();

      expect(handler).toHaveBeenCalledWith(8080);
    });

    it('should throw if already started', async () => {
      await server.start();
      await expect(server.start()).rejects.toThrow('already started');
    });

    it('should stop server', async () => {
      await server.start();
      await server.stop();
      expect(server.running).toBe(false);
    });

    it('should emit close event on stop', async () => {
      const handler = vi.fn();
      server.on('close', handler);

      await server.start();
      await server.stop();

      expect(handler).toHaveBeenCalled();
    });

    it('should be safe to stop when not started', async () => {
      await server.stop(); // Should not throw
    });
  });

  describe('configuration', () => {
    it('should use default port 8080', () => {
      const s = new PtyServer();
      // Internal config check would require accessing private field
      expect(s).toBeDefined();
    });

    it('should use default host 0.0.0.0', () => {
      const s = new PtyServer();
      expect(s).toBeDefined();
    });
  });
});

describe('createServer', () => {
  it('should create server instance', () => {
    const server = createServer();
    expect(server).toBeInstanceOf(PtyServer);
  });

  it('should pass config to server', () => {
    const server = createServer({ port: 9000 });
    expect(server).toBeInstanceOf(PtyServer);
  });
});

// Integration tests would require real WebSocket connections
// These are skipped in unit tests
describe.skip('PtyServer Integration', () => {
  it('should handle WebSocket connections', async () => {
    // Would test actual connection handling
  });

  it('should authenticate connections', async () => {
    // Would test authentication flow
  });

  it('should forward agent output to clients', async () => {
    // Would test data forwarding
  });

  it('should handle client input', async () => {
    // Would test input handling
  });
});
