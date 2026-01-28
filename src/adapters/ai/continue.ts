/**
 * Continue CLI Adapter
 * https://continue.dev/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/continue continue
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const continueAdapter: Adapter = {
  name: 'continue',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'continue' ||
           cmd.endsWith('/continue') ||
           cmd.endsWith('\\continue') ||
           cmd.includes('continue-dev');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Continue') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>]\s*$/.test(msg.text);
  },
};

export default continueAdapter;
