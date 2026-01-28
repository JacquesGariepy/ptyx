/**
 * Aider AI Pair Programming Adapter
 * https://aider.chat/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/aider aider
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const aiderAdapter: Adapter = {
  name: 'aider',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'aider' ||
           cmd.endsWith('/aider') ||
           cmd.endsWith('\\aider') ||
           cmd.includes('aider-chat');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      AIDER_PRETTY: '1',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Aider') ||
           msg.text.includes('Model:') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /^[❯>]\s*$/m.test(msg.text) ||
           msg.text.includes('aider>');
  },

  middleware: (): Middleware[] => [
    {
      name: 'aider-edit-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        // Detect file edits
        if (msg.text.includes('<<<<<<') || msg.text.includes('======')) {
          msg.meta.hasEdit = true;
        }
        // Detect git commits
        if (msg.text.includes('Commit:') || msg.text.includes('git commit')) {
          msg.meta.hasCommit = true;
        }
        await next();
      },
    },
  ],
};

export default aiderAdapter;
