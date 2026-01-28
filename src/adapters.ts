import type { Adapter, AgentConfig, Middleware } from './types.js';
import { PtyAgent, createAgent } from './agent.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Generic Adapter (fallback - always matches)
// ═══════════════════════════════════════════════════════════════════════════════

export const genericAdapter: Adapter = {
  name: 'generic',
  detect: () => true,
  isReady: () => true,
  isPrompt: () => false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Registry
// ═══════════════════════════════════════════════════════════════════════════════

const adapters: Adapter[] = [
  genericAdapter, // Fallback - will be kept last
];

/**
 * Register a custom adapter
 * Adapters are checked in order, first match wins.
 * Generic adapter is always last as fallback.
 */
export function registerAdapter(adapter: Adapter): void {
  // Remove generic, add new adapter, re-add generic at end
  const genericIdx = adapters.findIndex(a => a.name === 'generic');
  if (genericIdx !== -1) {
    adapters.splice(genericIdx, 1);
  }
  adapters.push(adapter);
  adapters.push(genericAdapter);
}

/**
 * Register multiple adapters at once
 */
export function registerAdapters(adapterList: Adapter[]): void {
  for (const adapter of adapterList) {
    registerAdapter(adapter);
  }
}

/**
 * Unregister an adapter by name
 */
export function unregisterAdapter(name: string): boolean {
  if (name === 'generic') return false; // Can't remove fallback
  const idx = adapters.findIndex(a => a.name === name);
  if (idx !== -1) {
    adapters.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Get all registered adapters
 */
export function getAdapters(): readonly Adapter[] {
  return [...adapters];
}

/**
 * Clear all adapters except generic
 */
export function clearAdapters(): void {
  adapters.length = 0;
  adapters.push(genericAdapter);
}

/**
 * Find adapter for config
 */
export function findAdapter(config: AgentConfig): Adapter {
  return adapters.find(a => a.detect(config)) || genericAdapter;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Plugin System
// ═══════════════════════════════════════════════════════════════════════════════

export interface PluginModule {
  /** Default export: single adapter */
  default?: Adapter;
  /** Named export: single adapter */
  adapter?: Adapter;
  /** Named export: multiple adapters */
  adapters?: Adapter[];
}

/**
 * Load adapter(s) from a module path (npm package or local file)
 *
 * @example
 * // Load from npm package
 * await loadAdapterPlugin('pty-agent-adapter-claude');
 *
 * // Load from local file
 * await loadAdapterPlugin('./my-adapter.js');
 *
 * // Load and get the adapter without auto-registering
 * const adapter = await loadAdapterPlugin('pty-agent-adapter-claude', { register: false });
 */
export async function loadAdapterPlugin(
  modulePath: string,
  options: { register?: boolean } = {}
): Promise<Adapter | Adapter[]> {
  const { register = true } = options;

  try {
    const mod: PluginModule = await import(modulePath);

    // Check for adapters array first
    if (mod.adapters && Array.isArray(mod.adapters)) {
      if (register) {
        registerAdapters(mod.adapters);
      }
      return mod.adapters;
    }

    // Check for single adapter
    const adapter = mod.default || mod.adapter;
    if (adapter && typeof adapter.detect === 'function') {
      if (register) {
        registerAdapter(adapter);
      }
      return adapter;
    }

    throw new Error(`Module "${modulePath}" does not export a valid adapter`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('does not export')) {
      throw err;
    }
    throw new Error(`Failed to load adapter plugin "${modulePath}": ${err}`);
  }
}

/**
 * Load multiple adapter plugins
 */
export async function loadAdapterPlugins(
  modulePaths: string[],
  options: { register?: boolean } = {}
): Promise<(Adapter | Adapter[])[]> {
  return Promise.all(
    modulePaths.map(path => loadAdapterPlugin(path, options))
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory with Adapter Injection
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateWithAdapterOptions extends AgentConfig {
  /** Auto-spawn on creation (default: true) */
  autoSpawn?: boolean;
  /** Explicitly specify adapter (bypasses auto-detection) */
  adapter?: Adapter;
  /** Load adapter from plugin before creating */
  adapterPlugin?: string;
}

/**
 * Create agent with adapter support
 *
 * @example
 * // Auto-detect adapter from registry
 * const agent = await createWithAdapter({ command: 'python3' });
 *
 * // Inject adapter directly
 * const agent = await createWithAdapter({
 *   command: 'my-cli',
 *   adapter: myCustomAdapter,
 * });
 *
 * // Load adapter from plugin
 * const agent = await createWithAdapter({
 *   command: 'claude',
 *   adapterPlugin: 'pty-agent-adapter-claude',
 * });
 */
export async function createWithAdapter(
  config: CreateWithAdapterOptions
): Promise<PtyAgent> {
  // Load plugin if specified
  if (config.adapterPlugin) {
    await loadAdapterPlugin(config.adapterPlugin);
  }

  // Use injected adapter or find from registry
  const adapter = config.adapter || findAdapter(config);

  // Apply adapter configuration
  let finalConfig: AgentConfig = { ...config };
  if (adapter.configure) {
    finalConfig = adapter.configure(finalConfig);
  }

  // Create agent
  const agent = await createAgent({
    ...finalConfig,
    autoSpawn: config.autoSpawn,
  });

  // Add adapter middleware
  if (adapter.middleware) {
    for (const mw of adapter.middleware()) {
      agent.use(mw);
    }
  }

  // Add adapter-specific event handling
  if (adapter.isPrompt) {
    agent.on('message', (msg) => {
      if (msg.direction === 'out' && adapter.isPrompt!(msg)) {
        agent.emit('ready');
      }
    });
  }

  return agent;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Builder Helper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper to create adapters with sensible defaults
 *
 * @example
 * const myAdapter = defineAdapter({
 *   name: 'my-cli',
 *   detect: (config) => config.command.includes('my-cli'),
 *   isPrompt: (msg) => msg.text.endsWith('> '),
 * });
 */
export function defineAdapter(options: {
  name: string;
  detect: (config: AgentConfig) => boolean;
  configure?: (config: AgentConfig) => AgentConfig;
  middleware?: () => Middleware[];
  isReady?: (msg: { text: string; raw: string }) => boolean;
  isPrompt?: (msg: { text: string; raw: string }) => boolean;
  parseToolCall?: (msg: { text: string; raw: string }) => { name: string; args?: Record<string, unknown>; raw: string } | null;
}): Adapter {
  return {
    name: options.name,
    detect: options.detect,
    configure: options.configure,
    middleware: options.middleware,
    isReady: options.isReady || options.isPrompt || (() => true),
    isPrompt: options.isPrompt,
    parseToolCall: options.parseToolCall,
  };
}

export {
  Adapter,
  PtyAgent,
};
