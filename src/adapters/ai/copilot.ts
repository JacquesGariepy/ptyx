/**
 * GitHub Copilot CLI Adapter
 * https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/copilot gh copilot suggest
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const copilotAdapter: Adapter = {
  name: 'copilot',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    const args = (config.args || []).join(' ').toLowerCase();
    return (cmd === 'gh' && args.includes('copilot')) ||
           cmd.includes('copilot');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      GH_FORCE_TTY: '1',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('?') ||
           msg.text.includes('Suggestion:') ||
           />\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[?›>]\s*$/.test(msg.text) ||
           msg.text.includes('Enter a command');
  },

  middleware: (): Middleware[] => [
    {
      name: 'copilot-suggestion-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        if (msg.text.includes('Suggestion:') || msg.text.includes('```')) {
          msg.meta.hasSuggestion = true;
        }
        await next();
      },
    },
  ],
};

export default copilotAdapter;
