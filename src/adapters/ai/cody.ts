/**
 * Sourcegraph Cody CLI Adapter
 * https://sourcegraph.com/cody
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/cody cody chat
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const codyAdapter: Adapter = {
  name: 'cody',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'cody' ||
           cmd.endsWith('/cody') ||
           cmd.endsWith('\\cody') ||
           cmd.includes('sourcegraph');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      CODY_TELEMETRY_DISABLED: '1',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Cody') ||
           msg.text.includes('Ready') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>]\s*$/.test(msg.text);
  },

  middleware: (): Middleware[] => [
    {
      name: 'cody-context-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        // Detect context retrieval
        if (msg.text.includes('Searching') || msg.text.includes('Found')) {
          msg.meta.searchingContext = true;
        }
        await next();
      },
    },
  ],
};

export default codyAdapter;
