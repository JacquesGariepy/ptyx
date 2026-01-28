/**
 * Agent Pool for ptyx
 *
 * Provides connection pooling for managing multiple PTY agents.
 * Useful for high-throughput scenarios or server applications.
 *
 * @example
 * ```typescript
 * import { createAgentPool } from 'ptyx/pool';
 *
 * const pool = createAgentPool({
 *   maxAgents: 5,
 *   minIdle: 2,
 *   agentConfig: { command: 'node', args: ['-i'] },
 * });
 *
 * // Warm up pool
 * await pool.warmup();
 *
 * // Acquire agent
 * const agent = await pool.acquire();
 * agent.sendLine('console.log("hello")');
 * await agent.waitFor(/hello/);
 *
 * // Release back to pool
 * pool.release(agent);
 *
 * // Cleanup
 * await pool.destroy();
 * ```
 *
 * @packageDocumentation
 */

import { EventEmitter } from 'node:events';
import { PtyAgent, createAgent } from './agent.js';
import type { AgentConfig } from './types.js';
import { uid } from './utils.js';
import { createLogger, type Logger } from './logger.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pool configuration
 */
export interface PoolConfig {
  /** Maximum number of agents in the pool */
  maxAgents: number;
  /** Minimum number of idle agents to keep warm */
  minIdle?: number;
  /** Agent configuration template (name is auto-generated) */
  agentConfig: Omit<AgentConfig, 'name'>;
  /** Timeout when waiting to acquire an agent (ms) */
  acquireTimeout?: number;
  /** Time before destroying an idle agent (ms) */
  idleTimeout?: number;
  /** Validate agent before returning from pool */
  validate?: (agent: PtyAgent) => boolean | Promise<boolean>;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Internal pooled agent wrapper
 */
interface PooledAgent {
  agent: PtyAgent;
  inUse: boolean;
  lastUsed: number;
  useCount: number;
  createdAt: number;
}

/**
 * Pool events
 */
export interface PoolEvents {
  acquire: (agent: PtyAgent) => void;
  release: (agent: PtyAgent) => void;
  create: (agent: PtyAgent) => void;
  destroy: (agent: PtyAgent) => void;
  error: (err: Error, agent?: PtyAgent) => void;
  drain: () => void;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  /** Total agents in pool */
  size: number;
  /** Available (idle) agents */
  available: number;
  /** Agents currently in use */
  inUse: number;
  /** Requests waiting for an agent */
  waiting: number;
  /** Total agents created since pool start */
  totalCreated: number;
  /** Total agents destroyed since pool start */
  totalDestroyed: number;
  /** Total acquire operations */
  totalAcquires: number;
  /** Pool uptime in ms */
  uptime: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Pool
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pool of PTY agents for efficient resource management
 */
export class AgentPool extends EventEmitter {
  private readonly _agents: Map<string, PooledAgent> = new Map();
  private readonly _waitQueue: Array<{
    resolve: (agent: PtyAgent) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];
  private readonly _config: Required<PoolConfig>;
  private readonly _log: Logger;
  private _destroyed = false;
  private _idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _createdAt: number = Date.now();
  private _stats = {
    totalCreated: 0,
    totalDestroyed: 0,
    totalAcquires: 0,
  };

  constructor(config: PoolConfig) {
    super();
    this._config = {
      maxAgents: config.maxAgents,
      minIdle: config.minIdle ?? 0,
      agentConfig: config.agentConfig,
      acquireTimeout: config.acquireTimeout ?? 30000,
      idleTimeout: config.idleTimeout ?? 300000, // 5 minutes default
      validate: config.validate ?? (() => true),
      debug: config.debug ?? false,
    };

    this._log = createLogger('Pool', { forceDebug: this._config.debug });
    this._log.debug('Pool created', { maxAgents: this._config.maxAgents });

    // Start idle check timer
    this._startIdleCheck();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════════════════

  /** Total number of agents in the pool */
  get size(): number {
    return this._agents.size;
  }

  /** Number of available (idle) agents */
  get available(): number {
    let count = 0;
    for (const pooled of this._agents.values()) {
      if (!pooled.inUse && pooled.agent.running) count++;
    }
    return count;
  }

  /** Number of agents currently in use */
  get inUse(): number {
    let count = 0;
    for (const pooled of this._agents.values()) {
      if (pooled.inUse) count++;
    }
    return count;
  }

  /** Number of requests waiting for an agent */
  get waiting(): number {
    return this._waitQueue.length;
  }

  /** Check if pool has been destroyed */
  get destroyed(): boolean {
    return this._destroyed;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Core Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Acquire an agent from the pool
   * @throws Error if pool is destroyed or acquire times out
   */
  async acquire(): Promise<PtyAgent> {
    if (this._destroyed) {
      throw new Error('Pool has been destroyed');
    }

    this._stats.totalAcquires++;
    this._log.debug('Acquire requested', { available: this.available, size: this.size });

    // Try to find an available agent
    for (const pooled of this._agents.values()) {
      if (!pooled.inUse && pooled.agent.running) {
        const valid = await this._config.validate(pooled.agent);
        if (valid) {
          pooled.inUse = true;
          pooled.lastUsed = Date.now();
          pooled.useCount++;
          this._log.debug('Agent acquired', { agentId: pooled.agent.id });
          this.emit('acquire', pooled.agent);
          return pooled.agent;
        } else {
          this._log.debug('Agent failed validation, destroying', { agentId: pooled.agent.id });
          await this._destroyAgent(pooled.agent.id);
        }
      }
    }

    // Create new agent if under limit
    if (this._agents.size < this._config.maxAgents) {
      const agent = await this._createAgent();
      const pooled = this._agents.get(agent.id)!;
      pooled.inUse = true;
      pooled.lastUsed = Date.now();
      pooled.useCount++;
      this._log.debug('New agent created and acquired', { agentId: agent.id });
      this.emit('acquire', agent);
      return agent;
    }

    // Wait for available agent
    this._log.debug('Waiting for available agent', { waiting: this._waitQueue.length + 1 });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = this._waitQueue.findIndex(w => w.resolve === resolve);
        if (idx !== -1) this._waitQueue.splice(idx, 1);
        this._log.warn('Acquire timeout');
        reject(new Error(`Acquire timeout after ${this._config.acquireTimeout}ms`));
      }, this._config.acquireTimeout);

      this._waitQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Release an agent back to the pool
   */
  release(agent: PtyAgent): void {
    const pooled = this._agents.get(agent.id);
    if (!pooled) {
      this._log.warn('Attempted to release unknown agent', { agentId: agent.id });
      throw new Error('Agent not in pool');
    }

    if (!pooled.inUse) {
      this._log.warn('Agent already released', { agentId: agent.id });
      return;
    }

    pooled.inUse = false;
    pooled.lastUsed = Date.now();
    this._log.debug('Agent released', { agentId: agent.id });
    this.emit('release', agent);

    // Clear agent state for reuse
    agent.clear();

    // Serve waiting requests
    if (this._waitQueue.length > 0 && agent.running) {
      const waiter = this._waitQueue.shift()!;
      clearTimeout(waiter.timeout);
      pooled.inUse = true;
      pooled.useCount++;
      this._log.debug('Agent immediately re-acquired', { agentId: agent.id });
      this.emit('acquire', agent);
      waiter.resolve(agent);
    }
  }

  /**
   * Pre-warm the pool with idle agents
   */
  async warmup(count?: number): Promise<void> {
    const target = count ?? this._config.minIdle;
    const needed = Math.min(
      target - this.available,
      this._config.maxAgents - this._agents.size
    );

    this._log.debug('Warming up pool', { target, needed });

    const promises: Promise<PtyAgent>[] = [];
    for (let i = 0; i < needed; i++) {
      promises.push(this._createAgent());
    }

    await Promise.all(promises);
    this._log.info('Pool warmed up', { size: this.size, available: this.available });
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      size: this.size,
      available: this.available,
      inUse: this.inUse,
      waiting: this.waiting,
      totalCreated: this._stats.totalCreated,
      totalDestroyed: this._stats.totalDestroyed,
      totalAcquires: this._stats.totalAcquires,
      uptime: Date.now() - this._createdAt,
    };
  }

  /**
   * Destroy the pool and all agents
   */
  async destroy(): Promise<void> {
    if (this._destroyed) return;

    this._destroyed = true;
    this._log.info('Destroying pool');

    // Stop idle check
    if (this._idleCheckTimer) {
      clearInterval(this._idleCheckTimer);
      this._idleCheckTimer = null;
    }

    // Reject waiting requests
    while (this._waitQueue.length > 0) {
      const waiter = this._waitQueue.shift()!;
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Pool destroyed'));
    }

    // Destroy all agents
    const destroyPromises: Promise<void>[] = [];
    for (const id of this._agents.keys()) {
      destroyPromises.push(this._destroyAgent(id));
    }

    await Promise.all(destroyPromises);
    this.emit('drain');
    this._log.info('Pool destroyed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Internal
  // ═══════════════════════════════════════════════════════════════════════════

  private async _createAgent(): Promise<PtyAgent> {
    const agent = await createAgent({
      ...this._config.agentConfig,
      name: `pool-${uid().slice(0, 8)}`,
    });

    const pooled: PooledAgent = {
      agent,
      inUse: false,
      lastUsed: Date.now(),
      useCount: 0,
      createdAt: Date.now(),
    };

    this._agents.set(agent.id, pooled);
    this._stats.totalCreated++;

    // Handle agent exit
    agent.once('exit', () => {
      this._log.debug('Agent exited', { agentId: agent.id });
      this._agents.delete(agent.id);
      this._stats.totalDestroyed++;
    });

    // Handle agent errors
    agent.on('error', (err) => {
      this._log.error('Agent error', { agentId: agent.id, error: err.message });
      this.emit('error', err, agent);
    });

    this._log.debug('Agent created', { agentId: agent.id });
    this.emit('create', agent);
    return agent;
  }

  private async _destroyAgent(id: string): Promise<void> {
    const pooled = this._agents.get(id);
    if (!pooled) return;

    this._agents.delete(id);
    this._stats.totalDestroyed++;

    this._log.debug('Destroying agent', { agentId: id });
    this.emit('destroy', pooled.agent);

    try {
      await pooled.agent.dispose();
    } catch (err) {
      this._log.error('Error disposing agent', { agentId: id, error: err });
    }
  }

  private _startIdleCheck(): void {
    // Check every minute for idle agents
    this._idleCheckTimer = setInterval(() => {
      if (this._destroyed) return;

      const now = Date.now();
      const toDestroy: string[] = [];

      for (const [id, pooled] of this._agents) {
        // Don't destroy agents that are in use or below minimum idle count
        if (pooled.inUse) continue;
        if (this.available <= this._config.minIdle) continue;

        // Check if agent has been idle too long
        const idleTime = now - pooled.lastUsed;
        if (idleTime > this._config.idleTimeout) {
          toDestroy.push(id);
        }
      }

      // Destroy idle agents
      for (const id of toDestroy) {
        this._log.debug('Destroying idle agent', { agentId: id });
        this._destroyAgent(id).catch(err => {
          this._log.error('Error destroying idle agent', { agentId: id, error: err });
        });
      }
    }, 60000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Event emitter overrides for type safety
  // ═══════════════════════════════════════════════════════════════════════════

  override on<K extends keyof PoolEvents>(
    event: K,
    listener: PoolEvents[K]
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof PoolEvents>(
    event: K,
    listener: PoolEvents[K]
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof PoolEvents>(
    event: K,
    listener: PoolEvents[K]
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof PoolEvents>(
    event: K,
    ...args: Parameters<PoolEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new agent pool
 */
export function createAgentPool(config: PoolConfig): AgentPool {
  return new AgentPool(config);
}
