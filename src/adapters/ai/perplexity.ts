/**
 * Perplexity CLI Adapter
 * https://www.perplexity.ai/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/perplexity pplx
 */

import type { Adapter, AgentConfig, Message } from '../../types.js';

export const perplexityAdapter: Adapter = {
  name: 'perplexity',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'pplx' ||
           cmd === 'perplexity' ||
           cmd.includes('perplexity');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Perplexity') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text);
  },
};

export default perplexityAdapter;
