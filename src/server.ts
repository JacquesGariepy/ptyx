/**
 * WebSocket Server for ptyx
 *
 * Exposes PTY agents over WebSocket for web-based terminal applications.
 *
 * @example
 * ```typescript
 * import { createServer } from 'ptyx/server';
 *
 * const server = createServer({
 *   port: 8080,
 *   agentConfig: { command: 'bash' },
 *   authenticate: (req) => req.headers['authorization'] === 'Bearer token',
 * });
 *
 * server.on('listening', (port) => {
 *   console.log(`Terminal server on ws://localhost:${port}`);
 * });
 *
 * await server.start();
 * ```
 *
 * @packageDocumentation
 */

import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { PtyAgent, createAgent } from './agent.js';
import type { AgentConfig, Message } from './types.js';
import { createLogger, type Logger } from './logger.js';
import { uid } from './utils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Port to listen on (default: 8080) */
  port?: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** Default agent configuration */
  agentConfig?: Partial<AgentConfig>;
  /** Authentication handler */
  authenticate?: (req: IncomingMessage) => boolean | Promise<boolean>;
  /** Maximum connections per IP (default: 5) */
  maxConnectionsPerIP?: number;
  /** Maximum total connections (default: 100) */
  maxConnections?: number;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Client-to-server message format
 */
export interface ClientMessage {
  /** Message type */
  type: 'input' | 'resize' | 'ping';
  /** Input data (for 'input' type) */
  data?: string;
  /** Terminal columns (for 'resize' type) */
  cols?: number;
  /** Terminal rows (for 'resize' type) */
  rows?: number;
}

/**
 * Server-to-client message format
 */
export interface ServerMessage {
  /** Message type */
  type: 'output' | 'exit' | 'error' | 'pong' | 'connected';
  /** Output data */
  data?: string;
  /** Exit code */
  code?: number;
  /** Error message */
  error?: string;
  /** Connection ID */
  connectionId?: string;
}

/**
 * Server events
 */
export interface ServerEvents {
  listening: (port: number) => void;
  connection: (connectionId: string, req: IncomingMessage) => void;
  disconnect: (connectionId: string, code: number, reason: string) => void;
  error: (err: Error) => void;
  close: () => void;
}

/**
 * Connection info
 */
interface Connection {
  id: string;
  ip: string;
  agent: PtyAgent;
  connectedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WebSocket Server
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WebSocket terminal server
 */
export class PtyServer extends EventEmitter {
  private _wss: any = null; // WebSocketServer type from 'ws'
  private readonly _connections: Map<string, Connection> = new Map();
  private readonly _ipConnections: Map<string, Set<string>> = new Map();
  private readonly _config: Required<ServerConfig>;
  private readonly _log: Logger;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _started = false;

  constructor(config: ServerConfig = {}) {
    super();
    this._config = {
      port: config.port ?? 8080,
      host: config.host ?? '0.0.0.0',
      agentConfig: config.agentConfig ?? {},
      authenticate: config.authenticate ?? (() => true),
      maxConnectionsPerIP: config.maxConnectionsPerIP ?? 5,
      maxConnections: config.maxConnections ?? 100,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      debug: config.debug ?? false,
    };

    this._log = createLogger('Server', { forceDebug: this._config.debug });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════════════════

  /** Number of active connections */
  get connections(): number {
    return this._connections.size;
  }

  /** Check if server is running */
  get running(): boolean {
    return this._started && this._wss !== null;
  }

  /** Get connection IDs */
  get connectionIds(): string[] {
    return Array.from(this._connections.keys());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Server already started');
    }

    this._log.info('Starting server', { port: this._config.port, host: this._config.host });

    try {
      // Dynamic import of ws module (optional dependency)
      // Use type assertion to handle dynamic import typing
      const wsModule = await import('ws').catch(() => null);

      if (!wsModule) {
        throw new Error('WebSocket module not found. Install ws: npm install ws');
      }

      // Handle both ESM and CJS module formats
      const WebSocketServer = (wsModule as any).WebSocketServer ||
                              (wsModule as any).default?.WebSocketServer ||
                              (wsModule as any).Server;

      this._wss = new WebSocketServer({
        port: this._config.port,
        host: this._config.host,
      });

      this._wss.on('connection', (socket: any, req: IncomingMessage) => {
        this._handleConnection(socket, req);
      });

      this._wss.on('error', (err: Error) => {
        this._log.error('Server error', err);
        this.emit('error', err);
      });

      this._started = true;

      // Start heartbeat
      this._startHeartbeat();

      this._log.info('Server started');
      this.emit('listening', this._config.port);

    } catch (err) {
      this._log.error('Failed to start server', err);
      throw err;
    }
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (!this._started) return;

    this._log.info('Stopping server');

    // Stop heartbeat
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    // Close all connections
    const closePromises: Promise<void>[] = [];
    for (const [id] of this._connections) {
      closePromises.push(this._closeConnection(id, 1001, 'Server shutting down'));
    }
    await Promise.all(closePromises);

    // Close server
    if (this._wss) {
      await new Promise<void>((resolve) => {
        this._wss.close(() => resolve());
      });
      this._wss = null;
    }

    this._started = false;
    this._log.info('Server stopped');
    this.emit('close');
  }

  /**
   * Broadcast a message to all connections
   */
  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const conn of this._connections.values()) {
      // Get the WebSocket from the connection
      // Note: We'd need to store the socket in the Connection interface
    }
  }

  /**
   * Close a specific connection
   */
  async closeConnection(connectionId: string, reason = 'Closed by server'): Promise<void> {
    await this._closeConnection(connectionId, 1000, reason);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Connection Handling
  // ═══════════════════════════════════════════════════════════════════════════

  private async _handleConnection(socket: any, req: IncomingMessage): Promise<void> {
    const connectionId = uid();
    const ip = this._getClientIP(req);

    this._log.debug('New connection', { connectionId, ip });

    // Check max connections
    if (this._connections.size >= this._config.maxConnections) {
      this._log.warn('Max connections reached, rejecting', { ip });
      socket.close(1013, 'Max connections reached');
      return;
    }

    // Check connections per IP
    const ipConns = this._ipConnections.get(ip) ?? new Set();
    if (ipConns.size >= this._config.maxConnectionsPerIP) {
      this._log.warn('Max connections per IP reached, rejecting', { ip });
      socket.close(1013, 'Too many connections from your IP');
      return;
    }

    // Authenticate
    try {
      const authed = await this._config.authenticate(req);
      if (!authed) {
        this._log.warn('Authentication failed', { ip });
        socket.close(4001, 'Unauthorized');
        return;
      }
    } catch (err) {
      this._log.error('Authentication error', { ip, error: err });
      socket.close(4001, 'Authentication error');
      return;
    }

    // Create agent
    let agent: PtyAgent;
    try {
      const defaultCommand = process.platform === 'win32' ? 'cmd.exe' : 'bash';
      agent = await createAgent({
        command: defaultCommand,
        ...this._config.agentConfig,
        name: `ws-${connectionId.slice(0, 8)}`,
      });
    } catch (err) {
      this._log.error('Failed to create agent', { connectionId, error: err });
      socket.close(4002, 'Failed to start terminal');
      return;
    }

    // Track connection
    const connection: Connection = {
      id: connectionId,
      ip,
      agent,
      connectedAt: Date.now(),
    };
    this._connections.set(connectionId, connection);
    ipConns.add(connectionId);
    this._ipConnections.set(ip, ipConns);

    this._log.info('Connection established', { connectionId, ip });
    this.emit('connection', connectionId, req);

    // Send connected message
    this._send(socket, { type: 'connected', connectionId });

    // Forward agent output to client
    agent.on('message', (msg: Message) => {
      if (msg.direction === 'out') {
        this._send(socket, { type: 'output', data: msg.raw });
      }
    });

    // Handle agent exit
    agent.on('exit', (code) => {
      this._log.debug('Agent exited', { connectionId, code });
      this._send(socket, { type: 'exit', code });
      socket.close(1000, 'Process exited');
    });

    // Handle agent errors
    agent.on('error', (err) => {
      this._log.error('Agent error', { connectionId, error: err.message });
      this._send(socket, { type: 'error', error: err.message });
    });

    // Handle client messages
    socket.on('message', (data: Buffer | string) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this._handleClientMessage(socket, agent, msg);
      } catch (err) {
        this._log.error('Invalid message', { connectionId, error: err });
        this._send(socket, { type: 'error', error: 'Invalid message format' });
      }
    });

    // Handle client disconnect
    socket.on('close', (code: number, reason: string) => {
      this._log.info('Connection closed', { connectionId, code, reason: reason?.toString() });
      this._cleanupConnection(connectionId);
      this.emit('disconnect', connectionId, code, reason?.toString() ?? '');
    });

    // Handle socket errors
    socket.on('error', (err: Error) => {
      this._log.error('Socket error', { connectionId, error: err.message });
      this._cleanupConnection(connectionId);
    });
  }

  private _handleClientMessage(socket: any, agent: PtyAgent, msg: ClientMessage): void {
    switch (msg.type) {
      case 'input':
        if (msg.data) {
          agent.write(msg.data);
        }
        break;

      case 'resize':
        if (msg.cols && msg.rows) {
          agent.resize(msg.cols, msg.rows);
        }
        break;

      case 'ping':
        this._send(socket, { type: 'pong' });
        break;

      default:
        this._log.warn('Unknown message type', { type: (msg as any).type });
    }
  }

  private async _closeConnection(connectionId: string, code: number, reason: string): Promise<void> {
    const connection = this._connections.get(connectionId);
    if (!connection) return;

    this._log.debug('Closing connection', { connectionId, code, reason });

    // Dispose agent
    try {
      await connection.agent.dispose();
    } catch (err) {
      this._log.error('Error disposing agent', { connectionId, error: err });
    }

    this._cleanupConnection(connectionId);
  }

  private _cleanupConnection(connectionId: string): void {
    const connection = this._connections.get(connectionId);
    if (!connection) return;

    // Remove from tracking
    this._connections.delete(connectionId);

    const ipConns = this._ipConnections.get(connection.ip);
    if (ipConns) {
      ipConns.delete(connectionId);
      if (ipConns.size === 0) {
        this._ipConnections.delete(connection.ip);
      }
    }

    // Dispose agent if still running
    if (connection.agent.running) {
      connection.agent.dispose().catch(err => {
        this._log.error('Error disposing agent during cleanup', { connectionId, error: err });
      });
    }
  }

  private _send(socket: any, message: ServerMessage): void {
    if (socket.readyState === 1) { // WebSocket.OPEN
      socket.send(JSON.stringify(message));
    }
  }

  private _getClientIP(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
      return ips.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  private _startHeartbeat(): void {
    this._heartbeatTimer = setInterval(() => {
      // Ping all connections - in a full implementation, we'd track pong responses
      // and close connections that don't respond
    }, this._config.heartbeatInterval);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Event emitter overrides for type safety
  // ═══════════════════════════════════════════════════════════════════════════

  override on<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K]
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K]
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof ServerEvents>(
    event: K,
    listener: ServerEvents[K]
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof ServerEvents>(
    event: K,
    ...args: Parameters<ServerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new WebSocket terminal server
 */
export function createServer(config?: ServerConfig): PtyServer {
  return new PtyServer(config);
}
