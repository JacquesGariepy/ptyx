/**
 * AI CLI Adapters
 *
 * This module exports adapters for all major AI CLI tools.
 *
 * @example
 * // Import all AI adapters
 * import { aiAdapters, registerAiAdapters } from 'pty-agent/adapters/ai';
 * registerAiAdapters();
 *
 * // Or import individually
 * import claudeAdapter from 'pty-agent/adapters/ai/claude';
 * import ollamaAdapter from 'pty-agent/adapters/ai/ollama';
 */

import { registerAdapters } from '../../adapters.js';
import type { Adapter } from '../../types.js';

// Individual adapter imports
import { claudeAdapter } from './claude.js';
import { copilotAdapter } from './copilot.js';
import { amazonQAdapter } from './amazonq.js';
import { geminiAdapter } from './gemini.js';
import { ollamaAdapter } from './ollama.js';
import { aiderAdapter } from './aider.js';
import { openInterpreterAdapter } from './openinterpreter.js';
import { llmAdapter } from './llm.js';
import { codyAdapter } from './cody.js';
import { cursorAdapter } from './cursor.js';
import { chatgptAdapter } from './chatgpt.js';
import { codexAdapter } from './codex.js';
import { continueAdapter } from './continue.js';
import { gooseAdapter } from './goose.js';
import { vibeosAdapter } from './vibeos.js';
import { opencodeAdapter } from './opencode.js';
import { mistralAdapter } from './mistral.js';
import { perplexityAdapter } from './perplexity.js';
import { tabbyAdapter } from './tabby.js';
import { codeiumAdapter } from './codeium.js';

// Re-export individual adapters
export { claudeAdapter } from './claude.js';
export { copilotAdapter } from './copilot.js';
export { amazonQAdapter } from './amazonq.js';
export { geminiAdapter } from './gemini.js';
export { ollamaAdapter } from './ollama.js';
export { aiderAdapter } from './aider.js';
export { openInterpreterAdapter } from './openinterpreter.js';
export { llmAdapter } from './llm.js';
export { codyAdapter } from './cody.js';
export { cursorAdapter } from './cursor.js';
export { chatgptAdapter } from './chatgpt.js';
export { codexAdapter } from './codex.js';
export { continueAdapter } from './continue.js';
export { gooseAdapter } from './goose.js';
export { vibeosAdapter } from './vibeos.js';
export { opencodeAdapter } from './opencode.js';
export { mistralAdapter } from './mistral.js';
export { perplexityAdapter } from './perplexity.js';
export { tabbyAdapter } from './tabby.js';
export { codeiumAdapter } from './codeium.js';

/**
 * All AI CLI adapters in recommended detection order
 */
export const aiAdapters: Adapter[] = [
  // Anthropic
  claudeAdapter,
  // GitHub
  copilotAdapter,
  // AWS
  amazonQAdapter,
  // Google
  geminiAdapter,
  // Mistral
  mistralAdapter,
  // Perplexity
  perplexityAdapter,
  // Local/Self-hosted LLMs
  ollamaAdapter,
  tabbyAdapter,
  // Coding assistants
  aiderAdapter,
  codyAdapter,
  cursorAdapter,
  continueAdapter,
  gooseAdapter,
  vibeosAdapter,
  opencodeAdapter,
  codeiumAdapter,
  // OpenAI ecosystem
  openInterpreterAdapter,
  chatgptAdapter,
  codexAdapter,
  // Generic LLM CLI
  llmAdapter,
];

/**
 * Register all AI adapters at once
 *
 * @example
 * import { registerAiAdapters } from 'pty-agent/adapters/ai';
 * registerAiAdapters();
 *
 * // Now all AI CLIs are auto-detected
 * const agent = await createWithAdapter({ command: 'claude' });
 */
export function registerAiAdapters(): void {
  registerAdapters(aiAdapters);
}

export default aiAdapters;
