/**
 * Claude Code CLI Adapter
 * https://github.com/anthropics/claude-code
 *
 * @example
 * ptyx --adapter ptyx/adapters/ai/claude claude --model opus
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const claudeAdapter: Adapter = {
  name: 'claude',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'claude' ||
           cmd.endsWith('/claude') ||
           cmd.endsWith('\\claude') ||
           cmd.includes('claude-code');
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
    return /^[❯>$]\s*$/m.test(msg.text) ||
           /waiting for input/i.test(msg.text) ||
           msg.text.includes('Claude Code');
  },

  isPrompt: (msg: Message) => {
    return /^[❯>$]\s*$/m.test(msg.text);
  },

  parseToolCall: (msg: Message) => {
    // Claude Code tool call format
    const match = msg.raw.match(/<(invoke|tool_call|antml:invoke)\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/i);
    if (!match) return null;

    return {
      name: match[2],
      raw: match[0],
      args: {},
    };
  },

  middleware: (): Middleware[] => [
    {
      name: 'claude-tool-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        const tool = claudeAdapter.parseToolCall?.(msg);
        if (tool) {
          msg.meta.toolCall = tool;
          msg.meta.isToolCall = true;
        }
        await next();
      },
    },
  ],
};

export default claudeAdapter;
