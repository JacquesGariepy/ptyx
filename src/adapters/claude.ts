/**
 * Claude CLI Adapter
 *
 * Optional adapter for Claude Code CLI.
 * Install separately or import from 'pty-agent/adapters/claude'
 *
 * @example
 * import { registerAdapter } from 'pty-agent';
 * import claudeAdapter from 'pty-agent/adapters/claude';
 *
 * registerAdapter(claudeAdapter);
 */

import type { Adapter, Message, Middleware, AgentConfig } from '../types.js';

export const claudeAdapter: Adapter = {
  name: 'claude',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'claude' || cmd.endsWith('/claude') || cmd.endsWith('\\claude');
  },

  configure: (config: AgentConfig) => ({
    ...config,
    env: {
      ...config.env,
      TERM: 'xterm-256color',
    },
  }),

  isReady: (msg: Message) => {
    return /^[❯>$]\s*$/m.test(msg.text) || /waiting for input/i.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /^[❯>$]\s*$/m.test(msg.text);
  },

  parseToolCall: (msg: Message) => {
    const match = msg.raw.match(/<(invoke|tool_call)\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/i);
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
      fn: async (msg, ctx, next) => {
        if (claudeAdapter.parseToolCall) {
          const tool = claudeAdapter.parseToolCall(msg);
          if (tool) {
            msg.meta.toolCall = tool;
          }
        }
        await next();
      },
      priority: 50,
    },
  ],
};

export default claudeAdapter;
