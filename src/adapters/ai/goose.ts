/**
 * Goose AI Agent Adapter
 * https://github.com/block/goose
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/goose goose session
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const gooseAdapter: Adapter = {
  name: 'goose',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'goose' ||
           cmd.endsWith('/goose') ||
           cmd.endsWith('\\goose');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Goose') ||
           msg.text.includes('(') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text) ||
           msg.text.includes('( O)>');
  },

  middleware: (): Middleware[] => [
    {
      name: 'goose-tool-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        // Detect tool usage
        if (msg.text.includes('Using tool:') || msg.text.includes('─ Tool:')) {
          msg.meta.hasToolUse = true;
        }
        // Detect file operations
        if (msg.text.includes('Reading') || msg.text.includes('Writing')) {
          msg.meta.hasFileOp = true;
        }
        await next();
      },
    },
  ],
};

export default gooseAdapter;
