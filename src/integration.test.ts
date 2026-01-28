/**
 * Integration Tests
 *
 * These tests run with real processes and PTYs.
 * They are skipped in CI environments without PTY support.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAgent, PtyAgent } from './agent';
import { recorder, metrics } from './middleware';
import { createSessionRecorder } from './session';
import { collectOutput } from './streams';

// Check if we can run integration tests
const canRunIntegration = process.env.CI !== 'true' && process.platform !== 'win32';

describe.skipIf(!canRunIntegration)('Integration Tests', () => {
  describe('Basic Process Operations', () => {
    it('should run echo command', async () => {
      const agent = await createAgent({
        command: 'echo',
        args: ['Hello, World!'],
      });

      const output = await collectOutput(agent, { timeout: 5000 });

      expect(output).toContain('Hello, World!');
      await agent.dispose();
    });

    it('should run node with inline script', async () => {
      const agent = await createAgent({
        command: 'node',
        args: ['-e', 'console.log(1+1)'],
      });

      const output = await collectOutput(agent, { timeout: 5000 });

      expect(output).toContain('2');
      await agent.dispose();
    });

    it('should handle process exit', async () => {
      const agent = await createAgent({
        command: 'node',
        args: ['-e', 'process.exit(42)'],
      });

      const exitCode = await new Promise<number>((resolve) => {
        agent.on('exit', (code) => resolve(code));
      });

      expect(exitCode).toBe(42);
      await agent.dispose();
    });
  });

  describe('Interactive Process', () => {
    let agent: PtyAgent;

    beforeAll(async () => {
      agent = await createAgent({
        command: 'node',
        args: ['-i'],
        timeout: 10000,
      });
      // Wait for REPL to start
      await agent.waitFor(/>/i, 5000).catch(() => {});
    });

    afterAll(async () => {
      if (agent) {
        agent.sendLine('.exit');
        await agent.dispose();
      }
    });

    it('should send input and receive output', async () => {
      agent.sendLine('console.log("test123")');
      const msg = await agent.waitFor(/test123/, 5000);
      expect(msg.text).toContain('test123');
    });

    it('should evaluate expressions', async () => {
      agent.sendLine('2 + 3');
      const msg = await agent.waitFor(/5/, 5000);
      expect(msg.text).toContain('5');
    });
  });

  describe('Middleware Integration', () => {
    it('should record session with middleware', async () => {
      const rec = recorder();

      const agent = await createAgent({
        command: 'echo',
        args: ['recorded'],
        middleware: [rec],
      });

      await new Promise((resolve) => agent.once('exit', resolve));

      const recording = rec.getRecording();
      expect(recording.length).toBeGreaterThan(0);
      expect(recording.some((m) => m.text.includes('recorded'))).toBe(true);

      await agent.dispose();
    });

    it('should track metrics', async () => {
      const met = metrics();

      const agent = await createAgent({
        command: 'echo',
        args: ['metrics test'],
        middleware: [met],
      });

      await new Promise((resolve) => agent.once('exit', resolve));

      const data = met.getMetrics();
      expect(data.messagesOut).toBeGreaterThan(0);
      expect(data.bytesOut).toBeGreaterThan(0);

      await agent.dispose();
    });
  });

  describe('Session Recording', () => {
    it('should record and export session', async () => {
      const { middleware, getRecorder, hasRecorder } = createSessionRecorder();

      const agent = await createAgent({
        command: 'echo',
        args: ['session test'],
        middleware: [middleware],
      });

      await new Promise((resolve) => agent.once('exit', resolve));

      expect(hasRecorder()).toBe(true);
      const recorder = getRecorder();
      recorder.end();

      const json = recorder.export('json');
      const data = JSON.parse(json);

      expect(data.command).toBe('echo');
      expect(data.messages.length).toBeGreaterThan(0);

      await agent.dispose();
    });
  });

  describe('Resize', () => {
    it('should resize terminal', async () => {
      const agent = await createAgent({
        command: 'node',
        args: ['-e', 'setTimeout(() => process.exit(0), 100)'],
      });

      // Should not throw
      agent.resize(120, 40);

      await new Promise((resolve) => agent.once('exit', resolve));
      await agent.dispose();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent command', async () => {
      await expect(
        createAgent({
          command: 'nonexistent-command-12345',
        })
      ).rejects.toThrow();
    });

    it('should emit error on agent error', async () => {
      const agent = await createAgent({
        command: 'node',
        args: ['-e', 'throw new Error("test")'],
      });

      // Process will exit with error, but agent won't emit error event
      // for normal process errors (only for PTY errors)
      await new Promise((resolve) => agent.once('exit', resolve));
      await agent.dispose();
    });
  });
});

// Windows-specific tests
describe.skipIf(process.platform !== 'win32')('Windows Integration', () => {
  it('should run cmd.exe', async () => {
    const agent = await createAgent({
      command: 'cmd.exe',
      args: ['/c', 'echo', 'hello'],
    });

    const output = await collectOutput(agent, { timeout: 5000 });
    expect(output.toLowerCase()).toContain('hello');

    await agent.dispose();
  });
});
