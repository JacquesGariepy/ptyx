/**
 * AI Adapters Tests
 */

import { describe, it, expect } from 'vitest';
import type { AgentConfig, Message } from '../../types';

// Import all adapters
import { claudeAdapter } from './claude';
import { copilotAdapter } from './copilot';
import { geminiAdapter } from './gemini';
import { ollamaAdapter } from './ollama';
import { aiderAdapter } from './aider';
import { cursorAdapter } from './cursor';
import { codexAdapter } from './codex';
import { vibeosAdapter } from './vibeos';
import { opencodeAdapter } from './opencode';
import { mistralAdapter } from './mistral';
import { lmstudioAdapter } from './lmstudio';
import { aiAdapters, registerAiAdapters } from './index';

// Helper functions
function createConfig(command: string, args: string[] = []): AgentConfig {
  return { command, args };
}

function createMessage(text: string, raw?: string): Message {
  return {
    text,
    raw: raw || text,
    direction: 'out',
    ts: Date.now(),
    agentId: 'test',
    seq: 1,
    meta: {},
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Claude Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Claude Adapter', () => {
  it('should detect claude command', () => {
    expect(claudeAdapter.detect(createConfig('claude'))).toBe(true);
    expect(claudeAdapter.detect(createConfig('/usr/bin/claude'))).toBe(true);
    expect(claudeAdapter.detect(createConfig('C:\\Users\\bin\\claude'))).toBe(true);
  });

  it('should not detect other commands', () => {
    expect(claudeAdapter.detect(createConfig('node'))).toBe(false);
    expect(claudeAdapter.detect(createConfig('python'))).toBe(false);
  });

  it('should detect prompt', () => {
    expect(claudeAdapter.isPrompt?.(createMessage('❯ '))).toBe(true);
    expect(claudeAdapter.isPrompt?.(createMessage('> '))).toBe(true);
    expect(claudeAdapter.isPrompt?.(createMessage('$ '))).toBe(true);
  });

  it('should detect ready state', () => {
    expect(claudeAdapter.isReady?.(createMessage('❯ '))).toBe(true);
    expect(claudeAdapter.isReady?.(createMessage('waiting for input'))).toBe(true);
  });

  it('should parse tool calls', () => {
    const msg = createMessage('', '<invoke name="bash"><param>ls</param></invoke>');
    const tool = claudeAdapter.parseToolCall?.(msg);
    expect(tool?.name).toBe('bash');
  });

  it('should configure env', () => {
    const config = claudeAdapter.configure?.(createConfig('claude'));
    expect(config?.env?.TERM).toBe('xterm-256color');
  });

  it('should provide middleware', () => {
    const mw = claudeAdapter.middleware?.();
    expect(mw).toHaveLength(1);
    expect(mw?.[0].name).toBe('claude-tool-detector');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GitHub Copilot Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Copilot Adapter', () => {
  it('should detect gh copilot command', () => {
    expect(copilotAdapter.detect(createConfig('gh', ['copilot']))).toBe(true);
    expect(copilotAdapter.detect(createConfig('gh', ['copilot', 'suggest']))).toBe(true);
  });

  it('should not detect plain gh', () => {
    expect(copilotAdapter.detect(createConfig('gh', ['pr', 'list']))).toBe(false);
  });

  it('should detect prompt', () => {
    expect(copilotAdapter.isPrompt?.(createMessage('Enter a command'))).toBe(true);
    expect(copilotAdapter.isPrompt?.(createMessage('? '))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gemini Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gemini Adapter', () => {
  it('should detect gemini command', () => {
    expect(geminiAdapter.detect(createConfig('gemini'))).toBe(true);
    expect(geminiAdapter.detect(createConfig('/bin/gemini'))).toBe(true);
  });

  it('should parse function calls', () => {
    const msg = createMessage('', 'function_call { name: "search"');
    const tool = geminiAdapter.parseToolCall?.(msg);
    expect(tool?.name).toBe('search');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Ollama Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Ollama Adapter', () => {
  it('should detect ollama command', () => {
    expect(ollamaAdapter.detect(createConfig('ollama'))).toBe(true);
  });

  it('should detect prompt', () => {
    expect(ollamaAdapter.isPrompt?.(createMessage('>>>'))).toBe(true);
    expect(ollamaAdapter.isPrompt?.(createMessage('text >>>'))).toBe(true);
  });

  it('should detect model loading in middleware', async () => {
    const mw = ollamaAdapter.middleware?.();
    const msg = createMessage('pulling llama3');
    const ctx = { agent: {}, config: {}, history: [], state: new Map(), send: () => {}, emit: () => {}, log: () => {} };

    await mw?.[0].fn(msg, ctx as any, async () => {});
    expect(msg.meta.modelLoading).toBe('llama3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Aider Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Aider Adapter', () => {
  it('should detect aider command', () => {
    expect(aiderAdapter.detect(createConfig('aider'))).toBe(true);
  });

  it('should detect edit markers', async () => {
    const mw = aiderAdapter.middleware?.();
    const msg = createMessage('<<<<<<');
    const ctx = { agent: {}, config: {}, history: [], state: new Map(), send: () => {}, emit: () => {}, log: () => {} };

    await mw?.[0].fn(msg, ctx as any, async () => {});
    expect(msg.meta.hasEdit).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cursor Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cursor Adapter', () => {
  it('should detect cursor command', () => {
    expect(cursorAdapter.detect(createConfig('cursor'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Codex Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Codex Adapter', () => {
  it('should detect codex command', () => {
    expect(codexAdapter.detect(createConfig('codex'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VibeOS Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('VibeOS Adapter', () => {
  it('should detect vibeos command', () => {
    expect(vibeosAdapter.detect(createConfig('vibeos'))).toBe(true);
  });

  it('should detect session ID', async () => {
    const mw = vibeosAdapter.middleware?.();
    const msg = createMessage('Session: abc123-def456');
    const ctx = { agent: {}, config: {}, history: [], state: new Map(), send: () => {}, emit: () => {}, log: () => {} };

    await mw?.[0].fn(msg, ctx as any, async () => {});
    expect(msg.meta.sessionId).toBe('abc123-def456');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OpenCode Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('OpenCode Adapter', () => {
  it('should detect opencode command', () => {
    expect(opencodeAdapter.detect(createConfig('opencode'))).toBe(true);
    expect(opencodeAdapter.detect(createConfig('open-code'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mistral Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Mistral Adapter', () => {
  it('should detect mistral/vibe commands', () => {
    expect(mistralAdapter.detect(createConfig('mistral'))).toBe(true);
    expect(mistralAdapter.detect(createConfig('vibe'))).toBe(true);
    expect(mistralAdapter.detect(createConfig('mistral-vibe'))).toBe(true);
  });

  it('should parse tool calls', () => {
    const msg = createMessage('', '{"name": "search", "arguments":');
    const tool = mistralAdapter.parseToolCall?.(msg);
    expect(tool?.name).toBe('search');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LM Studio Adapter Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM Studio Adapter', () => {
  it('should detect lms command', () => {
    expect(lmstudioAdapter.detect(createConfig('lms'))).toBe(true);
    expect(lmstudioAdapter.detect(createConfig('lmstudio'))).toBe(true);
  });

  it('should detect model loading in middleware', async () => {
    const mw = lmstudioAdapter.middleware?.();
    const msg = createMessage('loading llama-3.2');
    const ctx = { agent: {}, config: {}, history: [], state: new Map(), send: () => {}, emit: () => {}, log: () => {} };

    await mw?.[0].fn(msg, ctx as any, async () => {});
    expect(msg.meta.modelLoading).toBe('llama-3.2');
  });

  it('should detect server commands', async () => {
    const mw = lmstudioAdapter.middleware?.();
    const msg = createMessage('server start');
    const ctx = { agent: {}, config: {}, history: [], state: new Map(), send: () => {}, emit: () => {}, log: () => {} };

    await mw?.[0].fn(msg, ctx as any, async () => {});
    expect(msg.meta.serverStarting).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI Adapters Index Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI Adapters Index', () => {
  it('should export all adapters', () => {
    expect(aiAdapters.length).toBe(11);
  });

  it('should have unique names', () => {
    const names = aiAdapters.map(a => a.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should all have detect function', () => {
    for (const adapter of aiAdapters) {
      expect(typeof adapter.detect).toBe('function');
    }
  });

  it('registerAiAdapters should be a function', () => {
    expect(typeof registerAiAdapters).toBe('function');
  });
});
