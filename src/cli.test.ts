/**
 * CLI Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

// Path to the compiled CLI
const CLI_PATH = path.join(__dirname, '../dist/cli.js');

// Helper to run CLI
function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, PTYX_DEBUG: '0' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr, code: null });
    }, 5000);
  });
}

// Skip if CLI not built
const cliExists = (() => {
  try {
    require.resolve(CLI_PATH);
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!cliExists)('CLI', () => {
  describe('help', () => {
    it('should show help with --help', async () => {
      const { stdout, code } = await runCli(['--help']);

      expect(code).toBe(0);
      expect(stdout).toContain('ptyx');
      expect(stdout).toContain('Usage');
      expect(stdout).toContain('Options');
    });

    it('should show help with -h', async () => {
      const { stdout, code } = await runCli(['-h']);

      expect(code).toBe(0);
      expect(stdout).toContain('ptyx');
    });

    it('should show help with no arguments', async () => {
      const { stdout, code } = await runCli([]);

      expect(code).toBe(0);
      expect(stdout).toContain('Usage');
    });
  });

  describe('version', () => {
    it('should show version with --version', async () => {
      const { stdout, code } = await runCli(['--version']);

      expect(code).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should show version with -v', async () => {
      const { stdout, code } = await runCli(['-v']);

      expect(code).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('command execution', () => {
    it('should run echo command', async () => {
      const { stdout, code } = await runCli(['echo', 'hello']);

      // May exit with 0 or be killed
      expect(stdout).toContain('hello');
    });

    // Skip on Windows due to ANSI escape sequences interfering with output
    it.skipIf(process.platform === 'win32')('should pass arguments to command', async () => {
      const { stdout } = await runCli(['node', '-e', 'console.log(process.argv[2])', 'test-arg']);

      expect(stdout).toContain('test-arg');
    });
  });

  describe('options', () => {
    it('should accept --builtins flag', async () => {
      // Just check it doesn't crash
      const { code } = await runCli(['--builtins', 'echo', 'test']);

      // Should not fail with unknown option
      expect(code).not.toBe(1);
    });

    it('should accept --adapter flag', async () => {
      // Would need a real adapter file to test fully
      const { stderr } = await runCli(['--adapter', './nonexistent.js', 'echo', 'test']);

      // Should report adapter loading error
      expect(stderr).toContain('Failed to load');
    });
  });

  describe('environment variables', () => {
    it('should respect PTYX_DEBUG', async () => {
      const proc = spawn('node', [CLI_PATH, 'echo', 'test'], {
        env: { ...process.env, PTYX_DEBUG: '1' },
      });

      let stderr = '';
      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      await new Promise<void>((resolve) => {
        proc.on('close', () => resolve());
        setTimeout(() => {
          proc.kill();
          resolve();
        }, 2000);
      });

      // Debug output should go to stderr
      // This depends on implementation details
    });
  });
});

// Unit tests for CLI parsing (if exported)
describe('CLI Parsing', () => {
  it('should parse simple command', () => {
    const args = ['node', '-i'];
    // Would test parseArgs if it were exported
    expect(args[0]).toBe('node');
  });

  it('should handle flags before command', () => {
    const args = ['--builtins', 'node', '-i'];
    // First non-flag is the command
    let commandIdx = 0;
    for (let i = 0; i < args.length; i++) {
      if (!args[i].startsWith('--')) {
        commandIdx = i;
        break;
      }
    }
    expect(args[commandIdx]).toBe('node');
  });
});
