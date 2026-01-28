/**
 * Node.js REPL Adapter
 *
 * Optional adapter for Node.js interactive REPL.
 * Import from 'ptyx/adapters/node'
 *
 * @example
 * import { registerAdapter } from 'ptyx';
 * import nodeAdapter from 'ptyx/adapters/node';
 *
 * registerAdapter(nodeAdapter);
 */

import type { Adapter, Message, AgentConfig } from '../types.js';

export const nodeAdapter: Adapter = {
  name: 'node',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'node' || cmd === 'nodejs' || cmd.endsWith('/node') || cmd.endsWith('\\node');
  },

  isReady: (msg: Message) => {
    return msg.text.trim() === '>' || msg.text.includes('Welcome to Node.js');
  },

  isPrompt: (msg: Message) => {
    return /^>\s*$/m.test(msg.text);
  },
};

export default nodeAdapter;
