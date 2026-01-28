/**
 * ptyx Configuration Example
 *
 * This file shows how to configure ptyx programmatically.
 * You can create a configuration file that registers adapters,
 * sets up middleware, and configures defaults.
 *
 * Usage:
 *   1. Create a config file (e.g., ptyx.config.ts)
 *   2. Import and call registerConfig() at app startup
 *   3. Use createWithAdapter() - adapters will be auto-detected
 */

import {
  registerAdapter,
  registerAdapters,
  loadAdapterPlugin,
  defineAdapter,
  createWithAdapter,
  type Adapter,
  type AgentConfig,
} from 'ptyx';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Options
// ═══════════════════════════════════════════════════════════════════════════════

export interface PtyxConfig {
  /** Adapters to register */
  adapters?: Adapter[];

  /** Plugin paths to load (npm packages or local files) */
  plugins?: string[];

  /** Use all builtin AI adapters */
  useAiAdapters?: boolean;

  /** Use REPL/shell adapters */
  useBuiltins?: boolean;

  /** Default environment variables */
  defaultEnv?: Record<string, string>;

  /** Default terminal size */
  defaultSize?: { cols: number; rows: number };

  /** Enable debug mode */
  debug?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Example Configuration
// ═══════════════════════════════════════════════════════════════════════════════

export const config: PtyxConfig = {
  // Use all AI CLI adapters (claude, copilot, gemini, etc.)
  useAiAdapters: true,

  // Also include REPL/shell adapters (node, python, bash)
  useBuiltins: true,

  // Load additional plugins from npm or local files
  plugins: [
    // 'ptyx-adapter-my-custom-cli',
    // './adapters/my-local-adapter.js',
  ],

  // Register custom inline adapters
  adapters: [
    // Custom adapter for a specific CLI
    defineAdapter({
      name: 'my-internal-cli',
      detect: (cfg) => cfg.command.includes('internal-cli'),
      isPrompt: (msg) => msg.text.endsWith('>>> '),
      configure: (cfg) => ({
        ...cfg,
        env: { ...cfg.env, INTERNAL_MODE: 'true' },
      }),
    }),
  ],

  // Default environment for all agents
  defaultEnv: {
    TERM: 'xterm-256color',
    FORCE_COLOR: '1',
  },

  // Default terminal size
  defaultSize: {
    cols: 120,
    rows: 30,
  },

  // Enable debug logging
  debug: false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Loader
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply configuration to ptyx
 */
export async function registerConfig(cfg: PtyxConfig = config): Promise<void> {
  // Load AI adapters
  if (cfg.useAiAdapters) {
    const { registerAiAdapters } = await import('ptyx/adapters/ai');
    registerAiAdapters();
  }

  // Load builtin adapters
  if (cfg.useBuiltins) {
    const { registerBuiltins } = await import('ptyx/adapters/builtins');
    registerBuiltins();
  }

  // Load plugins
  if (cfg.plugins?.length) {
    for (const plugin of cfg.plugins) {
      await loadAdapterPlugin(plugin);
    }
  }

  // Register custom adapters
  if (cfg.adapters?.length) {
    registerAdapters(cfg.adapters);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Usage Examples
// ═══════════════════════════════════════════════════════════════════════════════

async function example1_BasicUsage() {
  // Apply config once at startup
  await registerConfig(config);

  // Now create agents - adapters are auto-detected
  const claude = await createWithAdapter({ command: 'claude' });
  const ollama = await createWithAdapter({ command: 'ollama', args: ['run', 'llama3'] });
  const python = await createWithAdapter({ command: 'python3', args: ['-i'] });

  // Use agents...
  claude.sendLine('Hello!');
}

async function example2_CustomConfig() {
  // Override config for specific use case
  await registerConfig({
    useAiAdapters: false,  // Don't load all AI adapters
    adapters: [
      defineAdapter({
        name: 'ollama-only',
        detect: (cfg) => cfg.command === 'ollama',
        isPrompt: (msg) => msg.text.includes('>>>'),
      }),
    ],
  });

  const agent = await createWithAdapter({ command: 'ollama', args: ['run', 'llama3'] });
}

async function example3_EnvBased() {
  // Load adapters based on environment
  const isDev = process.env.NODE_ENV === 'development';

  await registerConfig({
    useAiAdapters: true,
    debug: isDev,
    defaultEnv: {
      TERM: 'xterm-256color',
      ...(isDev && { DEBUG: '1' }),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON Configuration (alternative format)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * You can also use a JSON config file (ptyx.json):
 *
 * {
 *   "$schema": "https://example.com/ptyx.schema.json",
 *   "useAiAdapters": true,
 *   "useBuiltins": true,
 *   "plugins": [
 *     "ptyx-adapter-custom"
 *   ],
 *   "defaultEnv": {
 *     "TERM": "xterm-256color"
 *   },
 *   "defaultSize": {
 *     "cols": 120,
 *     "rows": 30
 *   }
 * }
 */

export async function loadJsonConfig(path: string): Promise<PtyxConfig> {
  const fs = await import('fs');
  const content = fs.readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Integration Example
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Example: Create a custom CLI wrapper with pre-configured adapters
 */
async function createMyCLI() {
  // Load all AI adapters
  await registerConfig({ useAiAdapters: true });

  // Parse command line
  const [,, command, ...args] = process.argv;

  if (!command) {
    console.log('Usage: my-cli <command> [args...]');
    process.exit(1);
  }

  // Create agent with auto-detected adapter
  const agent = await createWithAdapter({
    command,
    args,
    debug: process.env.DEBUG === '1',
  });

  // Transparent I/O
  agent.on('data', (data, dir) => {
    if (dir === 'out') process.stdout.write(data);
  });

  process.stdin.setRawMode?.(true);
  process.stdin.on('data', (data) => agent.write(data.toString()));

  agent.on('exit', (code) => process.exit(code));
}
