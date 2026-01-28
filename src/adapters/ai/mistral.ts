/**
 * Mistral AI CLI Adapter
 * https://mistral.ai/
 *
 * @example
 * pty-agent --adapter pty-agent/adapters/ai/mistral mistral
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const mistralAdapter: Adapter = {
  name: 'mistral',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'mistral' ||
           cmd === 'mistral-cli' ||
           cmd.endsWith('/mistral') ||
           cmd.endsWith('\\mistral') ||
           cmd.includes('mistral');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return msg.text.includes('Mistral') ||
           msg.text.includes('>') ||
           /Ready/i.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text);
  },

  parseToolCall: (msg: Message) => {
    // Mistral tool call format
    const match = msg.raw.match(/\{"name":\s*"([^"]+)",\s*"arguments":/);
    if (!match) return null;

    return {
      name: match[1],
      raw: match[0],
      args: {},
    };
  },

  middleware: (): Middleware[] => [
    {
      name: 'mistral-tool-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        const tool = mistralAdapter.parseToolCall?.(msg);
        if (tool) {
          msg.meta.toolCall = tool;
        }
        await next();
      },
    },
  ],
};

export default mistralAdapter;
