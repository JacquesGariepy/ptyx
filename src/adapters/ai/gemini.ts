/**
 * Google Gemini CLI Adapter
 * https://github.com/google-gemini/gemini-cli
 *
 * @example
 * ptyx --adapter ptyx/adapters/ai/gemini gemini
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const geminiAdapter: Adapter = {
  name: 'gemini',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'gemini' ||
           cmd.includes('gemini-cli') ||
           cmd.endsWith('/gemini');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Gemini') ||
           msg.text.includes('Ready') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text) ||
           msg.text.includes('>>>');
  },

  parseToolCall: (msg: Message) => {
    // Gemini function call format
    const match = msg.raw.match(/function_call\s*{\s*name:\s*"([^"]+)"/);
    if (!match) return null;

    return {
      name: match[1],
      raw: match[0],
      args: {},
    };
  },

  middleware: (): Middleware[] => [
    {
      name: 'gemini-tool-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        const tool = geminiAdapter.parseToolCall?.(msg);
        if (tool) {
          msg.meta.toolCall = tool;
        }
        await next();
      },
    },
  ],
};

export default geminiAdapter;
