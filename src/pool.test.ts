/**
 * Pool Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentPool, createAgentPool } from './pool';
import { PtyAgent } from './agent';

// Mock the agent module
vi.mock('./agent', () => {
  const mockAgent = {
    id: 'mock-id',
    name: 'mock-agent',
    running: true,
    history: [],
    config: { command: 'test' },
    spawn: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };

  let agentCount = 0;

  return {
    PtyAgent: vi.fn(() => mockAgent),
    createAgent: vi.fn(async () => {
      agentCount++;
      return {
        ...mockAgent,
        id: `mock-id-${agentCount}`,
        name: `mock-agent-${agentCount}`,
      };
    }),
  };
});

describe('AgentPool', () => {
  let pool: AgentPool;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = new AgentPool({
      maxAgents: 3,
      minIdle: 0,
      agentConfig: { command: 'test' },
      acquireTimeout: 1000,
      idleTimeout: 60000,
    });
  });

  afterEach(async () => {
    await pool.destroy();
  });

  describe('creation', () => {
    it('should create pool with config', () => {
      expect(pool.size).toBe(0);
      expect(pool.available).toBe(0);
      expect(pool.inUse).toBe(0);
    });

    it('should track destroyed state', async () => {
      expect(pool.destroyed).toBe(false);
      await pool.destroy();
      expect(pool.destroyed).toBe(true);
    });
  });

  describe('acquire', () => {
    it('should acquire agent', async () => {
      const agent = await pool.acquire();
      expect(agent).toBeDefined();
      expect(agent.id).toMatch(/^mock-id/);
      expect(pool.inUse).toBe(1);
    });

    it('should create new agent when none available', async () => {
      const agent1 = await pool.acquire();
      const agent2 = await pool.acquire();
      expect(agent1.id).not.toBe(agent2.id);
      expect(pool.size).toBe(2);
    });

    it('should reuse released agents', async () => {
      const agent1 = await pool.acquire();
      const id1 = agent1.id;
      pool.release(agent1);

      const agent2 = await pool.acquire();
      expect(agent2.id).toBe(id1);
      expect(pool.size).toBe(1);
    });

    it('should throw when pool is destroyed', async () => {
      await pool.destroy();
      await expect(pool.acquire()).rejects.toThrow('destroyed');
    });

    it('should timeout when max agents reached', async () => {
      // Acquire all agents
      await pool.acquire();
      await pool.acquire();
      await pool.acquire();

      // Next acquire should timeout
      const timeoutPool = new AgentPool({
        maxAgents: 3,
        agentConfig: { command: 'test' },
        acquireTimeout: 50,
      });
      await timeoutPool.acquire();
      await timeoutPool.acquire();
      await timeoutPool.acquire();

      await expect(timeoutPool.acquire()).rejects.toThrow('timeout');
      await timeoutPool.destroy();
    });

    it('should emit acquire event', async () => {
      const handler = vi.fn();
      pool.on('acquire', handler);

      await pool.acquire();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('should release agent back to pool', async () => {
      const agent = await pool.acquire();
      expect(pool.available).toBe(0);

      pool.release(agent);
      expect(pool.available).toBe(1);
    });

    it('should throw for unknown agent', async () => {
      const fakeAgent = { id: 'unknown' } as PtyAgent;
      expect(() => pool.release(fakeAgent)).toThrow('not in pool');
    });

    it('should clear agent on release', async () => {
      const agent = await pool.acquire();
      pool.release(agent);
      expect(agent.clear).toHaveBeenCalled();
    });

    it('should emit release event', async () => {
      const handler = vi.fn();
      pool.on('release', handler);

      const agent = await pool.acquire();
      pool.release(agent);

      expect(handler).toHaveBeenCalledWith(agent);
    });

    it('should serve waiting requests', async () => {
      // Fill pool
      const agents = await Promise.all([
        pool.acquire(),
        pool.acquire(),
        pool.acquire(),
      ]);

      // Start waiting for agent
      const waitPromise = pool.acquire();
      expect(pool.waiting).toBe(1);

      // Release one
      pool.release(agents[0]);

      // Should resolve
      const acquired = await waitPromise;
      expect(acquired).toBeDefined();
      expect(pool.waiting).toBe(0);
    });
  });

  describe('warmup', () => {
    it('should pre-create agents', async () => {
      await pool.warmup(2);
      expect(pool.size).toBe(2);
      expect(pool.available).toBe(2);
    });

    it('should respect max agents limit', async () => {
      await pool.warmup(10); // More than maxAgents
      expect(pool.size).toBe(3); // maxAgents is 3
    });

    it('should use minIdle as default', async () => {
      const poolWithMinIdle = new AgentPool({
        maxAgents: 5,
        minIdle: 2,
        agentConfig: { command: 'test' },
      });

      await poolWithMinIdle.warmup();
      expect(poolWithMinIdle.available).toBe(2);

      await poolWithMinIdle.destroy();
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', async () => {
      const agent = await pool.acquire();
      const stats = pool.getStats();

      expect(stats.size).toBe(1);
      expect(stats.inUse).toBe(1);
      expect(stats.available).toBe(0);
      expect(stats.waiting).toBe(0);
      expect(stats.totalCreated).toBe(1);
      expect(stats.totalAcquires).toBe(1);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('destroy', () => {
    it('should destroy all agents', async () => {
      await pool.acquire();
      await pool.acquire();

      await pool.destroy();

      expect(pool.size).toBe(0);
      expect(pool.destroyed).toBe(true);
    });

    it('should reject waiting requests', async () => {
      const agents = await Promise.all([
        pool.acquire(),
        pool.acquire(),
        pool.acquire(),
      ]);

      const waitPromise = pool.acquire();

      await pool.destroy();

      await expect(waitPromise).rejects.toThrow('destroyed');
    });

    it('should emit drain event', async () => {
      const handler = vi.fn();
      pool.on('drain', handler);

      await pool.destroy();

      expect(handler).toHaveBeenCalled();
    });

    it('should be idempotent', async () => {
      await pool.destroy();
      await pool.destroy(); // Should not throw
    });
  });

  describe('validation', () => {
    it('should validate agents before returning', async () => {
      const validate = vi.fn().mockResolvedValue(true);
      const validatingPool = new AgentPool({
        maxAgents: 3,
        agentConfig: { command: 'test' },
        validate,
      });

      // First acquire creates a new agent (no validation)
      const agent = await validatingPool.acquire();
      // Release it back to the pool
      validatingPool.release(agent);
      // Second acquire should validate the existing agent
      await validatingPool.acquire();

      expect(validate).toHaveBeenCalled();

      await validatingPool.destroy();
    });

    it('should destroy invalid agents', async () => {
      let callCount = 0;
      const validate = vi.fn().mockImplementation(() => {
        callCount++;
        return callCount > 1; // First agent invalid, second valid
      });

      const validatingPool = new AgentPool({
        maxAgents: 3,
        agentConfig: { command: 'test' },
        validate,
      });

      // First acquire creates agent, validates (fails), destroys, creates new one
      const agent = await validatingPool.acquire();
      expect(agent).toBeDefined();

      await validatingPool.destroy();
    });
  });
});

describe('createAgentPool', () => {
  it('should create pool instance', () => {
    const pool = createAgentPool({
      maxAgents: 5,
      agentConfig: { command: 'test' },
    });

    expect(pool).toBeInstanceOf(AgentPool);
    pool.destroy();
  });
});
