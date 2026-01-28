/**
 * AI CLI Adapters
 *
 * This module exports adapters for all major AI CLI tools.
 *
 * @example
 * // Import all AI adapters
 * import { aiAdapters, registerAiAdapters } from 'ptyx/adapters/ai';
 * registerAiAdapters();
 *
 * // Or import individually
 * import claudeAdapter from 'ptyx/adapters/ai/claude';
 * import ollamaAdapter from 'ptyx/adapters/ai/ollama';
 */

import { registerAdapters } from '../../adapters.js';
import type { Adapter } from '../../types.js';

// Individual adapter imports
import { claudeAdapter } from './claude.js';
import { copilotAdapter } from './copilot.js';
import { geminiAdapter } from './gemini.js';
import { ollamaAdapter } from './ollama.js';
import { aiderAdapter } from './aider.js';
import { cursorAdapter } from './cursor.js';
import { codexAdapter } from './codex.js';
import { vibeosAdapter } from './vibeos.js';
import { opencodeAdapter } from './opencode.js';
import { mistralAdapter } from './mistral.js';
import { lmstudioAdapter } from './lmstudio.js';

// Re-export individual adapters
export { claudeAdapter } from './claude.js';
export { copilotAdapter } from './copilot.js';
export { geminiAdapter } from './gemini.js';
export { ollamaAdapter } from './ollama.js';
export { aiderAdapter } from './aider.js';
export { cursorAdapter } from './cursor.js';
export { codexAdapter } from './codex.js';
export { vibeosAdapter } from './vibeos.js';
export { opencodeAdapter } from './opencode.js';
export { mistralAdapter } from './mistral.js';
export { lmstudioAdapter } from './lmstudio.js';

/**
 * All AI CLI adapters in recommended detection order
 */
export const aiAdapters: Adapter[] = [
  // Anthropic
  claudeAdapter,
  // GitHub
  copilotAdapter,
  // Google
  geminiAdapter,
  // Mistral
  mistralAdapter,
  // Local/Self-hosted LLMs
  ollamaAdapter,
  lmstudioAdapter,
  // Coding assistants
  aiderAdapter,
  cursorAdapter,
  vibeosAdapter,
  opencodeAdapter,
  // OpenAI ecosystem
  codexAdapter,
];

/**
 * Register all AI adapters at once
 *
 * @example
 * import { registerAiAdapters } from 'ptyx/adapters/ai';
 * registerAiAdapters();
 *
 * // Now all AI CLIs are auto-detected
 * const agent = await createWithAdapter({ command: 'claude' });
 */
export function registerAiAdapters(): void {
  registerAdapters(aiAdapters);
}

export default aiAdapters;
