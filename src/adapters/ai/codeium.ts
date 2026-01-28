/**
 * Codeium CLI Adapter
 * https://codeium.com/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/codeium codeium
 */

import type { Adapter, AgentConfig, Message } from '../../types.js';

export const codeiumAdapter: Adapter = {
  name: 'codeium',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'codeium' ||
           cmd.endsWith('/codeium') ||
           cmd.includes('codeium');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Codeium') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text);
  },
};

export default codeiumAdapter;
