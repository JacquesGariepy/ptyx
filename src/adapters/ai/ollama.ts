/**
 * Ollama CLI Adapter
 * https://ollama.ai/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/ollama ollama run llama3
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const ollamaAdapter: Adapter = {
  name: 'ollama',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'ollama' ||
           cmd.endsWith('/ollama') ||
           cmd.endsWith('\\ollama');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('>>>') ||
           msg.text.includes('pulling') ||
           /success/i.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /^>>>\s*$/m.test(msg.text) ||
           msg.text.trim().endsWith('>>>');
  },

  middleware: (): Middleware[] => [
    {
      name: 'ollama-model-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        // Detect model loading
        const modelMatch = msg.text.match(/pulling\s+(\S+)/i);
        if (modelMatch) {
          msg.meta.modelLoading = modelMatch[1];
        }
        // Detect streaming completion
        if (msg.text.includes('>>>')) {
          msg.meta.streamComplete = true;
        }
        await next();
      },
    },
  ],
};

export default ollamaAdapter;
