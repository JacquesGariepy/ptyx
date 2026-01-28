/**
 * PtyAgent Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtyAgent, createAgent, exec, wrap } from './agent';
import type { AgentConfig, Message, Middleware } from './types';
import { createMessage } from './utils';

// Mock node-pty
const mockPty = {
  pid: 12345,
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPty),
}));

// Helper to create config
function createConfig(command: string, args: string[] = []): AgentConfig {
  return { command, args };
}

describe('PtyAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mock handlers
    mockPty.onData.mockImplementation(() => {});
    mockPty.onExit.mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should create agent with default config', () => {
      const agent = new PtyAgent(createConfig('echo'));
      expect(agent.id).toBeDefined();
      expect(agent.name).toMatch(/^agent-/);
      expect(agent.running).toBe(false);
      expect(agent.config.command).toBe('echo');
    });

    it('should use custom name if provided', () => {
      const agent = new PtyAgent({ command: 'test', name: 'my-agent' });
      expect(agent.name).toBe('my-agent');
    });

    it('should apply default config values', () => {
      const agent = new PtyAgent(createConfig('test'));
      expect(agent.config.args).toEqual([]);
      expect(agent.config.timeout).toBe(30000);
      expect(agent.config.maxRestarts).toBe(3);
      expect(agent.config.autoRestart).toBe(false);
    });

    it('should apply middleware from config', () => {
      const mw: Middleware = {
        name: 'test',
        direction: 'both',
        fn: vi.fn(),
        priority: 100,
      };
      const agent = new PtyAgent({ command: 'test', middleware: [mw] });
      // Middleware is registered internally
      expect(agent).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    it('should spawn process', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      expect(agent.running).toBe(true);
      expect(agent.pid).toBe(12345);
    });

    it('should emit spawn event', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      const handler = vi.fn();
      agent.on('spawn', handler);
      await agent.spawn();
      expect(handler).toHaveBeenCalledWith(12345);
    });

    it('should not spawn twice', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      await agent.spawn(); // Should be no-op
      expect(agent.running).toBe(true);
    });

    it('should throw if disposed', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.dispose();
      await expect(agent.spawn()).rejects.toThrow('disposed');
    });

    it('should kill process', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      agent.kill();
      expect(mockPty.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should kill with custom signal', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      agent.kill('SIGKILL');
      expect(mockPty.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });

  describe('I/O', () => {
    it('should write to pty', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      agent.write('test');
      expect(mockPty.write).toHaveBeenCalledWith('test');
    });

    it('should not write when not running', () => {
      const agent = new PtyAgent(createConfig('echo'));
      agent.write('test');
      expect(mockPty.write).not.toHaveBeenCalled();
    });

    it('should send through middleware', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      agent.send('test');
      // Give middleware time to process
      await new Promise(r => setTimeout(r, 10));
      expect(mockPty.write).toHaveBeenCalled();
    });

    it('should sendLine with newline', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      agent.sendLine('test');
      await new Promise(r => setTimeout(r, 10));
      expect(mockPty.write).toHaveBeenCalledWith('test\n');
    });

    it('should resize terminal', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      agent.resize(100, 50);
      expect(mockPty.resize).toHaveBeenCalledWith(100, 50);
    });
  });

  describe('middleware', () => {
    it('should add middleware with use()', () => {
      const agent = new PtyAgent(createConfig('echo'));
      const mw: Middleware = {
        name: 'test',
        direction: 'both',
        fn: vi.fn(),
        priority: 100,
      };
      const result = agent.use(mw);
      expect(result).toBe(agent); // Chainable
    });

    it('should remove middleware with unuse()', () => {
      const agent = new PtyAgent(createConfig('echo'));
      const mw: Middleware = {
        name: 'test',
        direction: 'both',
        fn: vi.fn(),
        priority: 100,
      };
      agent.use(mw);
      expect(agent.unuse('test')).toBe(true);
      expect(agent.unuse('nonexistent')).toBe(false);
    });
  });

  describe('utilities', () => {
    it('should clear history', () => {
      const agent = new PtyAgent(createConfig('echo'));
      agent.clear();
      expect(agent.history).toHaveLength(0);
    });

    it('should wait for specified time', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      const start = Date.now();
      await agent.wait(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('waitFor', () => {
    it('should resolve on pattern match', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();

      // Simulate output after delay
      setTimeout(() => {
        const msg = createMessage('Hello world', 'out', agent.id, 1);
        agent.emit('message', msg);
      }, 10);

      const result = await agent.waitFor(/world/);
      expect(result.text).toContain('world');
    });

    it('should timeout if pattern not found', async () => {
      const agent = new PtyAgent(createConfig('echo'));
      await agent.spawn();
      await expect(agent.waitFor(/notfound/, 100)).rejects.toThrow('Timeout');
    });
  });

  describe('enhanced API', () => {
    describe('expect', () => {
      it('should return match details', async () => {
        const agent = new PtyAgent(createConfig('echo'));
        await agent.spawn();

        setTimeout(() => {
          const msg = createMessage('prefix:match:suffix', 'out', agent.id, 1);
          agent.emit('message', msg);
        }, 10);

        const result = await agent.expect(/match/, { timeout: 1000 });
        expect(result.match).toBeTruthy();
        expect(result.match![0]).toBe('match');
        expect(result.before).toBe('prefix:');
        expect(result.after).toBe(':suffix');
      });
    });

    describe('waitForAll', () => {
      it('should wait for all patterns', async () => {
        const agent = new PtyAgent(createConfig('echo'));
        await agent.spawn();

        setTimeout(() => {
          agent.emit('message', createMessage('first', 'out', agent.id, 1));
        }, 10);
        setTimeout(() => {
          agent.emit('message', createMessage('second', 'out', agent.id, 2));
        }, 20);

        const results = await agent.waitForAll([/first/, /second/], 1000);
        expect(results).toHaveLength(2);
      });
    });

    describe('waitForAny', () => {
      it('should resolve on first match', async () => {
        const agent = new PtyAgent(createConfig('echo'));
        await agent.spawn();

        setTimeout(() => {
          agent.emit('message', createMessage('first', 'out', agent.id, 1));
        }, 10);

        const result = await agent.waitForAny([/first/, /second/], 1000);
        expect(result.index).toBe(0);
        expect(result.message.text).toBe('first');
      });
    });

    describe('sendKeys', () => {
      it('should send special keys', async () => {
        const agent = new PtyAgent(createConfig('echo'));
        await agent.spawn();
        agent.sendKeys(['ctrl+c']);
        expect(mockPty.write).toHaveBeenCalledWith('\x03');
      });

      it('should send multiple keys', async () => {
        const agent = new PtyAgent(createConfig('echo'));
        await agent.spawn();
        agent.sendKeys(['ctrl+c', 'enter']);
        expect(mockPty.write).toHaveBeenCalledTimes(2);
      });
    });

    describe('sendSecret', () => {
      it('should write without logging', async () => {
        const agent = new PtyAgent(createConfig('echo'));
        await agent.spawn();
        agent.sendSecret('password123');
        expect(mockPty.write).toHaveBeenCalledWith('password123');
        // History should have redacted entry
        expect(agent.history.some(m => m.meta.secret === true)).toBe(true);
      });
    });

    describe('healthcheck', () => {
      it('should return health status', async () => {
        const agent = new PtyAgent(createConfig('echo'));
        await agent.spawn();
        const health = await agent.healthcheck();
        expect(health.healthy).toBe(true);
        expect(health.running).toBe(true);
        expect(health.pid).toBe(12345);
        expect(health.uptime).toBeGreaterThanOrEqual(0);
      });
    });
  });
});

describe('Factory Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPty.onData.mockImplementation(() => {});
    mockPty.onExit.mockImplementation(() => {});
  });

  describe('createAgent', () => {
    it('should auto-spawn by default', async () => {
      const agent = await createAgent({ command: 'echo' });
      expect(agent.running).toBe(true);
      await agent.dispose();
    });

    it('should not spawn if autoSpawn is false', async () => {
      const agent = await createAgent({ command: 'echo', autoSpawn: false });
      expect(agent.running).toBe(false);
      await agent.dispose();
    });
  });

  describe('exec', () => {
    it('should parse command string', async () => {
      const agent = await exec('node -e "console.log(1)"');
      expect(agent.config.command).toBe('node');
      expect(agent.config.args).toContain('-e');
      await agent.dispose();
    });
  });

  describe('wrap', () => {
    it('should wrap command with args', async () => {
      const agent = await wrap('node', ['-i']);
      expect(agent.config.command).toBe('node');
      expect(agent.config.args).toContain('-i');
      await agent.dispose();
    });
  });
});
