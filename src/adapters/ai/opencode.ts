/**
 * OpenCode CLI Adapter
 * https://github.com/opencode/opencode
 *
 * @example
 * ptyx --adapter ptyx/adapters/ai/opencode opencode
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const opencodeAdapter: Adapter = {
  name: 'opencode',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'opencode' ||
           cmd === 'open-code' ||
           cmd.endsWith('/opencode') ||
           cmd.endsWith('\\opencode');
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
    return msg.text.includes('OpenCode') ||
           msg.text.includes('>') ||
           /Ready/i.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text);
  },

  middleware: (): Middleware[] => [
    {
      name: 'opencode-tool-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        if (msg.text.includes('```') || msg.text.includes('Executing')) {
          msg.meta.hasCode = true;
        }
        await next();
      },
    },
  ],
};

