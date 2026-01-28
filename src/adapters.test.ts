/**
 * Adapter Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAdapter,
  registerAdapters,
  unregisterAdapter,
  getAdapters,
  clearAdapters,
  findAdapter,
  defineAdapter,
  genericAdapter,
} from './adapters';
import type { Adapter, AgentConfig, Message } from './types';

// Helper to create a mock message
function createMockMessage(text: string, raw?: string): Message {
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

// Helper to create a mock config
function createMockConfig(command: string, args: string[] = []): AgentConfig {
  return { command, args };
}

describe('Adapter Registry', () => {
  beforeEach(() => {
    clearAdapters();
  });

  describe('registerAdapter', () => {
    it('should register an adapter', () => {
      const adapter = defineAdapter({
        name: 'test',
        detect: () => true,
      });

      registerAdapter(adapter);
      const adapters = getAdapters();

      expect(adapters).toContainEqual(adapter);
    });

    it('should keep generic adapter last', () => {
      const adapter = defineAdapter({
        name: 'test',
        detect: () => true,
      });

      registerAdapter(adapter);
      const adapters = getAdapters();

      expect(adapters[adapters.length - 1]).toBe(genericAdapter);
    });

    it('should register multiple adapters', () => {
      const adapter1 = defineAdapter({ name: 'test1', detect: () => true });
      const adapter2 = defineAdapter({ name: 'test2', detect: () => true });

      registerAdapters([adapter1, adapter2]);
      const adapters = getAdapters();

      expect(adapters).toContainEqual(adapter1);
      expect(adapters).toContainEqual(adapter2);
    });
  });

  describe('unregisterAdapter', () => {
    it('should unregister an adapter by name', () => {
      const adapter = defineAdapter({ name: 'test', detect: () => true });
      registerAdapter(adapter);

      const removed = unregisterAdapter('test');
      expect(removed).toBe(true);

      const adapters = getAdapters();
      expect(adapters).not.toContainEqual(adapter);
    });

    it('should not unregister generic adapter', () => {
      const removed = unregisterAdapter('generic');
      expect(removed).toBe(false);
    });

    it('should return false for non-existent adapter', () => {
      const removed = unregisterAdapter('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('findAdapter', () => {
    it('should find matching adapter', () => {
      const adapter = defineAdapter({
        name: 'test',
        detect: (config) => config.command === 'test-cli',
      });
      registerAdapter(adapter);

      const found = findAdapter(createMockConfig('test-cli'));
      expect(found).toBe(adapter);
    });

    it('should return generic adapter when no match', () => {
      const found = findAdapter(createMockConfig('unknown'));
      expect(found).toBe(genericAdapter);
    });

    it('should return first matching adapter', () => {
      const adapter1 = defineAdapter({
        name: 'test1',
        detect: (config) => config.command.startsWith('test'),
      });
      const adapter2 = defineAdapter({
        name: 'test2',
        detect: (config) => config.command === 'test-cli',
      });
      registerAdapters([adapter1, adapter2]);

      const found = findAdapter(createMockConfig('test-cli'));
      expect(found).toBe(adapter1);
    });
  });

  describe('clearAdapters', () => {
    it('should clear all adapters except generic', () => {
      registerAdapter(defineAdapter({ name: 'test1', detect: () => true }));
      registerAdapter(defineAdapter({ name: 'test2', detect: () => true }));

      clearAdapters();
      const adapters = getAdapters();

      expect(adapters).toHaveLength(1);
      expect(adapters[0]).toBe(genericAdapter);
    });
  });

  describe('defineAdapter', () => {
    it('should create adapter with defaults', () => {
      const adapter = defineAdapter({
        name: 'test',
        detect: () => true,
      });

      expect(adapter.name).toBe('test');
      expect(adapter.detect({} as AgentConfig)).toBe(true);
      expect(adapter.isReady?.({} as Message)).toBe(true);
    });

    it('should use isPrompt for isReady if not provided', () => {
      const adapter = defineAdapter({
        name: 'test',
        detect: () => true,
        isPrompt: (msg) => msg.text.includes('>>>'),
      });

      expect(adapter.isReady?.(createMockMessage('>>>'))).toBe(true);
      expect(adapter.isReady?.(createMockMessage('hello'))).toBe(false);
    });

    it('should include all provided options', () => {
      const configure = (config: AgentConfig) => ({ ...config, env: { TEST: '1' } });
      const middleware = () => [];

      const adapter = defineAdapter({
        name: 'test',
        detect: () => true,
        configure,
        middleware,
        isReady: () => true,
        isPrompt: () => false,
      });

      expect(adapter.configure).toBe(configure);
      expect(adapter.middleware).toBe(middleware);
    });
  });
});

describe('Generic Adapter', () => {
  it('should always match', () => {
    expect(genericAdapter.detect(createMockConfig('anything'))).toBe(true);
  });

  it('should always be ready', () => {
    expect(genericAdapter.isReady?.(createMockMessage('anything'))).toBe(true);
  });

  it('should never be prompt', () => {
    expect(genericAdapter.isPrompt?.(createMockMessage('anything'))).toBe(false);
  });
});
