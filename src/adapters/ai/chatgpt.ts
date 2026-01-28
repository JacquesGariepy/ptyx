/**
 * ChatGPT CLI Adapter (various implementations)
 * Supports: chatgpt-cli, gpt-cli, openai-cli
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/chatgpt chatgpt
 * pty-agent --adapter pty-agent/adapters/ai/chatgpt gpt
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const chatgptAdapter: Adapter = {
  name: 'chatgpt',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'chatgpt' ||
           cmd === 'gpt' ||
           cmd === 'openai' ||
           cmd.includes('chatgpt') ||
           cmd.includes('gpt-cli') ||
           cmd.includes('openai-cli');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('ChatGPT') ||
           msg.text.includes('GPT') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text) ||
           msg.text.includes('You:');
  },

  parseToolCall: (msg: Message) => {
    // OpenAI function call format
    const match = msg.raw.match(/{"name":\s*"([^"]+)",\s*"arguments":\s*({[^}]+})/);
    if (!match) return null;

    try {
      return {
        name: match[1],
        raw: match[0],
        args: JSON.parse(match[2]),
      };
    } catch {
      return {
        name: match[1],
        raw: match[0],
        args: {},
      };
    }
  },

  middleware: (): Middleware[] => [
    {
      name: 'chatgpt-tool-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        const tool = chatgptAdapter.parseToolCall?.(msg);
        if (tool) {
          msg.meta.toolCall = tool;
        }
        await next();
      },
    },
  ],
};

export default chatgptAdapter;
