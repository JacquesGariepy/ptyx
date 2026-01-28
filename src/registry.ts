/**
 * Adapter Registry
 *
 * Extracted to avoid pulling in agent.ts dependencies when only
 * registering adapters.
 */

import type { Adapter, AgentConfig } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Generic Adapter (fallback - always matches)
// ═══════════════════════════════════════════════════════════════════════════════

export const genericAdapter: Adapter = {
  name: 'generic',
  detect: () => true,
  isReady: () => true,
  isPrompt: () => false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Registry
// ═══════════════════════════════════════════════════════════════════════════════

const adapters: Adapter[] = [
  genericAdapter, // Fallback - will be kept last
];

/**
 * Register a custom adapter
 * Adapters are checked in order, first match wins.
 * Generic adapter is always last as fallback.
 */
export function registerAdapter(adapter: Adapter): void {
  // Remove generic, add new adapter, re-add generic at end
  const genericIdx = adapters.findIndex(a => a.name === 'generic');
  if (genericIdx !== -1) {
    adapters.splice(genericIdx, 1);
  }
  adapters.push(adapter);
  adapters.push(genericAdapter);
}

/**
 * Register multiple adapters at once
 */
export function registerAdapters(adapterList: Adapter[]): void {
  for (const adapter of adapterList) {
    registerAdapter(adapter);
  }
}

/**
 * Unregister an adapter by name
 */
export function unregisterAdapter(name: string): boolean {
  if (name === 'generic') return false; // Can't remove fallback
  const idx = adapters.findIndex(a => a.name === name);
  if (idx !== -1) {
    adapters.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Get all registered adapters
 */
export function getAdapters(): readonly Adapter[] {
  return [...adapters];
}

/**
 * Clear all adapters except generic
 */
export function clearAdapters(): void {
  adapters.length = 0;
  adapters.push(genericAdapter);
}

/**
 * Find adapter for config
 */
export function findAdapter(config: AgentConfig): Adapter {
  return adapters.find(a => a.detect(config)) || genericAdapter;
}
