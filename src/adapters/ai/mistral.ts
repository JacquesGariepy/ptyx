/**
 * Mistral Vibe CLI Adapter
 * https://docs.mistral.ai/mistral-vibe/introduction/install
 *
 * Install:
 *   pip install mistral-vibe
 *   # or
 *   uv tool install mistral-vibe
 *   # or
 *   curl -LsSf https://mistral.ai/vibe/install.sh | bash
 *
 * @example
 * ptyx --builtins mistral-vibe
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const mistralAdapter: Adapter = {
  name: 'mistral-vibe',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    const base = cmd.split(/[/\\]/).pop() || cmd;
    return base === 'vibe' ||
           base === 'mistral' ||
           base === 'mistral-vibe' ||
           base === 'vibe-acp' ||
           base.startsWith('mistral');
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
