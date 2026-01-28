/**
 * Python REPL Adapter
 *
 * Optional adapter for Python interactive interpreter.
 * Import from 'ptyx/adapters/python'
 *
 * @example
 * import { registerAdapter } from 'ptyx';
 * import pythonAdapter from 'ptyx/adapters/python';
 *
 * registerAdapter(pythonAdapter);
 */

import type { Adapter, Message, AgentConfig } from '../types.js';

export const pythonAdapter: Adapter = {
  name: 'python',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'python' || cmd === 'python3' || cmd.endsWith('/python') || cmd.endsWith('/python3');
  },

  isReady: (msg: Message) => {
    return msg.text.includes('>>>') || msg.text.includes('Python');
  },

  isPrompt: (msg: Message) => {
    return /^>>>\s*$/m.test(msg.text) || /^\.\.\.\s*$/m.test(msg.text);
  },
};

export default pythonAdapter;
