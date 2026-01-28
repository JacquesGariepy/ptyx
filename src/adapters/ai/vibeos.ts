/**
 * VibeOS CLI Adapter
 * AI Coding Agent with TUI
 *
 * @example
 * ptyx --adapter ptyx/adapters/ai/vibeos vibeos
 * ptyx --adapter ptyx/adapters/ai/vibeos vibeos chat "hello"
 */

import type { Adapter, AgentConfig, Message, Middleware } from '../../types.js';

export const vibeosAdapter: Adapter = {
  name: 'vibeos',

  detect: (config: AgentConfig) => {
    const cmd = config.command.toLowerCase();
    return cmd === 'vibeos' ||
           cmd === 'vibe' ||
           cmd.endsWith('/vibeos') ||
           cmd.endsWith('\\vibeos') ||
           cmd.includes('vibe-os');
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
    return msg.text.includes('VibeOS') ||
           msg.text.includes('Session:') ||
           /[❯>]\s*$/.test(msg.text);
  },

  isPrompt: (msg: Message) => {
    return /[❯>$]\s*$/.test(msg.text) ||
           msg.text.includes('vibeos>');
  },

  middleware: (): Middleware[] => [
    {
      name: 'vibeos-session-detector',
      direction: 'out',
      priority: 50,
      fn: async (msg, ctx, next) => {
        // Detect session ID
        const sessionMatch = msg.text.match(/Session:\s*([a-f0-9-]+)/i);
        if (sessionMatch) {
          msg.meta.sessionId = sessionMatch[1];
        }
        // Detect tool usage
        if (msg.text.includes('Tool:') || msg.text.includes('Running')) {
          msg.meta.hasToolUse = true;
        }
        await next();
      },
    },
  ],
};

export default vibeosAdapter;
