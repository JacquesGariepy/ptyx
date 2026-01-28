/**
 * Tabby CLI Adapter (self-hosted AI coding assistant)
 * https://tabby.tabbyml.com/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/tabby tabby
 */

import type { Adapter, AgentConfig, Message } from '../../types.js';

export const tabbyAdapter: Adapter = {
  name: 'tabby',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'tabby' ||
           cmd.endsWith('/tabby') ||
           cmd.includes('tabbyml');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Tabby') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text);
  },
};

export default tabbyAdapter;
