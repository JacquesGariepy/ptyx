/**
 * LLM CLI Adapter (Simon Willison's llm)
 * https://github.com/simonw/llm
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/llm llm chat
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const llmAdapter: Adapter = {
  name: 'llm',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'llm' ||
           cmd.endsWith('/llm') ||
           cmd.endsWith('\\llm');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Chatting with') ||
           /^>\s*$/m.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /^>\s*$/m.test(msg.text);
  },

  middleware: (): Middleware[] => [
    {
      name: 'llm-model-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        const modelMatch = msg.text.match(/Chatting with\s+(\S+)/);
        if (modelMatch) {
          msg.meta.model = modelMatch[1];
        }
        await next();
      },
    },
  ],
};

export default llmAdapter;
