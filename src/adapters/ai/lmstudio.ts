/**
 * LM Studio CLI Adapter
 * https://lmstudio.ai/docs/cli
 *
 * LM Studio's command-line utility for model management, chat, and server control.
 * The `lms` command ships bundled with LM Studio.
 *
 * @example
 * ptyx --builtins lms chat
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const lmstudioAdapter: Adapter = {
  name: 'lmstudio',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    const base = cmd.split(/[/\\]/).pop() || cmd;
    return base === 'lms' ||
           base === 'lmstudio' ||
           base === 'lm-studio';
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('>') ||
           msg.text.includes('LM Studio') ||
           /ready/i.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>]\s*$/.test(msg.text) ||
           /^\s*>\s*$/m.test(msg.text);
  },

  middleware: (): Middleware[] => [
    {
      name: 'lmstudio-model-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        // Detect model loading
        const loadMatch = msg.text.match(/loading\s+(\S+)/i);
        if (loadMatch) {
          msg.meta.modelLoading = loadMatch[1];
        }

        // Detect server status
        if (msg.text.includes('server start')) {
          msg.meta.serverStarting = true;
        }
        if (msg.text.includes('server stop')) {
          msg.meta.serverStopping = true;
        }

        // Detect model list
        if (msg.text.includes('lms ls') || msg.text.includes('lms ps')) {
          msg.meta.listingModels = true;
        }

        await next();
      },
    },
  ],
};

