/**
 * OpenAI Codex CLI Adapter
 * https://github.com/openai/codex
 *
 * @example
 * ptyx --adapter ptyx/adapters/ai/codex codex
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const codexAdapter: Adapter = {
  name: 'codex',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'codex' ||
           cmd.endsWith('/codex') ||
           cmd.endsWith('\\codex') ||
           cmd.includes('openai-codex');
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
    return msg.text.includes('Codex') ||
           msg.text.includes('>') ||
           /Ready/i.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text);
  },

  middleware: (): Middleware[] => [
    {
      name: 'codex-code-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        if (msg.text.includes('```') || msg.text.includes('def ') || msg.text.includes('function ')) {
          msg.meta.hasCode = true;
        }
        await next();
      },
    },
  ],
};

