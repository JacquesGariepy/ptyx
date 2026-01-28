/**
 * Example: Custom Adapter Plugin
 *
 * This file demonstrates how to create a custom adapter for any CLI.
 * It can be used as:
 *   - A local file: pty-agent --adapter ./custom-adapter.js my-cli
 *   - An npm package: pty-agent --adapter my-adapter-package my-cli
 *
 * Adapter plugins should export:
 *   - default: Adapter (single adapter)
 *   - adapter: Adapter (alternative named export)
 *   - adapters: Adapter[] (multiple adapters)
 */

import { defineAdapter, registerAdapter, createWithAdapter } from 'pty-agent';
import type { Adapter, AgentConfig, Message, Middleware } from 'pty-agent';

// ═══════════════════════════════════════════════════════════════════════════════
// Option 1: Using defineAdapter helper (recommended)
// ═══════════════════════════════════════════════════════════════════════════════

export const myCliAdapter = defineAdapter({
  name: 'my-cli',

  // Detect when this adapter should be used
  detect: (config: AgentConfig) => {
    return config.command.includes('my-cli') ||
           config.command.endsWith('/my-cli');
  },

  // Modify configuration before spawn
  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      MY_CLI_MODE: 'interactive',
    },
  }),

  // Detect when the CLI is ready for input
  isReady: (msg) => {
    return msg.text.includes('Ready>') || msg.text.includes('Initialized');
  },

  // Detect prompt pattern
  isPrompt: (msg) => {
    return /my-cli>\s*$/.test(msg.text);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Option 2: Full Adapter interface (more control)
// ═══════════════════════════════════════════════════════════════════════════════

export const advancedAdapter: Adapter = {
  name: 'advanced-cli',

  detect: (config: AgentConfig) => {
    return config.command === 'advanced-cli';
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      ADVANCED_MODE: 'true',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('[READY]');
  },

  isPrompt: (msg: Message) => {
    return /\$\s*$/.test(msg.text);
  },

  // Parse tool/function calls from output (optional)
  parseToolCall: (msg: Message) => {
    const match = msg.raw.match(/<tool name="([^"]+)">([\s\S]*?)<\/tool>/);
    if (!match) return null;

    return {
      name: match[1],
      raw: match[0],
      args: JSON.parse(match[2] || '{}'),
    };
  },

  // Add custom middleware (optional)
  middleware: (): Middleware[] => [
    {
      name: 'advanced-logger',
      direction: 'both',
      priority: 10,
      fn: async (msg, ctx, next) => {
        console.log(`[${msg.direction}] ${msg.text.slice(0, 50)}...`);
        await next();
      },
    },
    {
      name: 'tool-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        if (advancedAdapter.parseToolCall) {
          const tool = advancedAdapter.parseToolCall(msg);
          if (tool) {
            msg.meta.toolCall = tool;
            ctx.agent.emit('data', `Tool called: ${tool.name}`, 'out');
          }
        }
        await next();
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Export for plugin system
// ═══════════════════════════════════════════════════════════════════════════════

// Default export for single adapter
export default myCliAdapter;

// Named export for multiple adapters
export const adapters: Adapter[] = [myCliAdapter, advancedAdapter];

// ═══════════════════════════════════════════════════════════════════════════════
// Usage Examples
// ═══════════════════════════════════════════════════════════════════════════════

async function examples() {
  // 1. Register adapter globally
  registerAdapter(myCliAdapter);

  // 2. Create agent with injected adapter
  const agent1 = await createWithAdapter({
    command: 'my-cli',
    args: ['--interactive'],
    adapter: myCliAdapter, // Explicit injection
  });

  // 3. Create agent with auto-detection (after registering)
  const agent2 = await createWithAdapter({
    command: 'my-cli',
    // Will auto-detect myCliAdapter from registry
  });

  // 4. Create agent with plugin loading
  const agent3 = await createWithAdapter({
    command: 'my-cli',
    adapterPlugin: './custom-adapter.js', // Load and register
  });

  // Listen for events
  agent1.on('message', (msg) => {
    console.log(`[${msg.direction}] ${msg.text}`);
  });

  agent1.on('ready', () => {
    console.log('CLI is ready for input');
  });

  // Send input
  agent1.sendLine('hello');

  // Wait for response
  await agent1.waitFor(/response:/i);

  // Cleanup
  await agent1.dispose();
}
