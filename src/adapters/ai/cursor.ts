/**
 * Cursor CLI Adapter
 * https://cursor.sh/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/cursor cursor
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const cursorAdapter: Adapter = {
  name: 'cursor',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'cursor' ||
           cmd.endsWith('/cursor') ||
           cmd.endsWith('\\cursor');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      ELECTRON_RUN_AS_NODE: '1',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Cursor') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>]\s*$/.test(msg.text);
  },
};

export default cursorAdapter;
