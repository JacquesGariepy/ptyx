/**
 * Amazon Q CLI Adapter
 * https://aws.amazon.com/q/developer/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/amazonq q chat
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const amazonQAdapter: Adapter = {
  name: 'amazonq',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'q' ||
           cmd === 'amazon-q' ||
           cmd.includes('amazonq') ||
           cmd.endsWith('/q');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      AWS_EXECUTION_ENV: 'pty-agent',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Amazon Q') ||
           msg.text.includes('Ready') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text) ||
           msg.text.includes('Enter your question');
  },

  middleware: (): Middleware[] => [
    {
      name: 'amazonq-response-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        if (msg.text.includes('```') || msg.text.includes('Here')) {
          msg.meta.hasCodeBlock = true;
        }
        await next();
      },
    },
  ],
};

export default amazonQAdapter;
