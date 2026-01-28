/**
 * Open Interpreter Adapter
 * https://github.com/OpenInterpreter/open-interpreter
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/openinterpreter interpreter
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const openInterpreterAdapter: Adapter = {
  name: 'open-interpreter',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'interpreter' ||
           cmd === 'open-interpreter' ||
           cmd.endsWith('/interpreter') ||
           cmd.includes('open_interpreter');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Open Interpreter') ||
           msg.text.includes('>') ||
           msg.text.includes('Model:');
  },

  isPrompt: (msg: Message) => {
    return /^>\s*$/m.test(msg.text) ||
           msg.text.includes('○');
  },

  middleware: (): Middleware[] => [
    {
      name: 'interpreter-code-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        // Detect code execution
        if (msg.text.includes('```python') || msg.text.includes('```bash')) {
          msg.meta.hasCode = true;
        }
        // Detect confirmation prompts
        if (msg.text.includes('Run this code?') || msg.text.includes('[y/n]')) {
          msg.meta.needsConfirmation = true;
        }
        await next();
      },
    },
  ],
};

export default openInterpreterAdapter;
