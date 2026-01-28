/**
 * Bash/Shell Adapter
 *
 * Optional adapter for shell interpreters (bash, zsh, sh, fish).
 * Import from 'pty-agent/adapters/bash'
 *
 * @example
 * import { registerAdapter } from 'pty-agent';
 * import bashAdapter from 'pty-agent/adapters/bash';
 *
 * registerAdapter(bashAdapter);
 */

import type { Adapter, Message, AgentConfig } from '../types.js';

const SHELLS = ['bash', 'sh', 'zsh', 'fish', 'dash', 'ksh', 'tcsh', 'csh'];

export const bashAdapter: Adapter = {
  name: 'bash',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return SHELLS.some(s => cmd === s || cmd.endsWith(`/${s}`) || cmd.endsWith(`\\${s}`));
  },

  isReady: (msg: Message) => {
    return /[$#%>]\s*$/m.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[$#%>]\s*$/m.test(msg.text);
  },
};

export default bashAdapter;
