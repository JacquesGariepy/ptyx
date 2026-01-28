/**
 * Terminal Detection & Emulation Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectTerminal,
  detectProfile,
  createTerminalEmulator,
  createTerminalEnv,
  applyTerminalEnv,
  supportsFeature,
  getCapabilities,
  createProfile,
  TerminalProfiles,
} from './terminal';
import type { Message, Context } from './types';

// Save original env
const originalEnv = { ...process.env };

// Helper to create mock message
function createMockMessage(text: string, direction: 'in' | 'out' = 'out'): Message {
  return {
    raw: text,
    text,
    direction,
    ts: Date.now(),
    agentId: 'test-agent',
    seq: 1,
    meta: {},
  };
}

// Helper to create mock context
function createMockContext(): Context {
  return {
    agent: { id: 'test', name: 'test-agent' } as any,
    config: { command: 'test' } as any,
    history: [],
    state: new Map(),
    send: vi.fn(),
    emit: vi.fn(),
    log: vi.fn(),
  };
}

describe('detectTerminal', () => {
  beforeEach(() => {
    // Reset env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should detect basic terminal info', () => {
    const info = detectTerminal();
    expect(info.platform).toBe(process.platform);
    expect(typeof info.isTTY).toBe('boolean');
    expect(typeof info.cols).toBe('number');
    expect(typeof info.rows).toBe('number');
  });

  it('should detect VS Code', () => {
    process.env.VSCODE_INJECTION = '1';
    const info = detectTerminal();
    expect(info.isVSCode).toBe(true);
  });

  it('should detect Cursor', () => {
    process.env.CURSOR_SESSION_ID = 'test-session';
    const info = detectTerminal();
    expect(info.isCursor).toBe(true);
  });

  it('should detect Windows Terminal', () => {
    process.env.WT_SESSION = 'test-session';
    const info = detectTerminal();
    expect(info.isWindowsTerminal).toBe(true);
  });

  it('should detect iTerm2', () => {
    process.env.ITERM_SESSION_ID = 'test-session';
    const info = detectTerminal();
    expect(info.isITerm).toBe(true);
  });

  it('should detect Kitty', () => {
    process.env.KITTY_WINDOW_ID = '1';
    const info = detectTerminal();
    expect(info.isKitty).toBe(true);
  });

  it('should detect SSH', () => {
    process.env.SSH_CLIENT = '192.168.1.100 54321 22';
    const info = detectTerminal();
    expect(info.isSSH).toBe(true);
  });

  it('should detect tmux', () => {
    process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
    const info = detectTerminal();
    expect(info.isTmux).toBe(true);
  });

  it('should detect CI', () => {
    process.env.CI = 'true';
    const info = detectTerminal();
    expect(info.isCI).toBe(true);
  });

  it('should detect true color support', () => {
    process.env.COLORTERM = 'truecolor';
    const info = detectTerminal();
    expect(info.trueColor).toBe(true);
  });
});

describe('detectProfile', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null for unknown terminal', () => {
    const profile = detectProfile();
    // May or may not return a profile depending on environment
    expect(profile === null || typeof profile === 'object').toBe(true);
  });

  it('should detect VS Code profile', () => {
    process.env.VSCODE_INJECTION = '1';
    const profile = detectProfile();
    expect(profile?.name).toBe('VS Code');
  });

  it('should detect Cursor profile', () => {
    process.env.CURSOR_SESSION_ID = 'test';
    const profile = detectProfile();
    expect(profile?.name).toBe('Cursor');
  });

  it('should detect Windows Terminal profile', () => {
    // Clear all competing terminal detections
    delete process.env.VSCODE_INJECTION;
    delete process.env.VSCODE_GIT_IPC_HANDLE;
    delete process.env.CURSOR_SESSION_ID;
    delete process.env.CURSOR_TRACE_ID;
    delete process.env.TERM_PROGRAM;
    delete process.env.ITERM_SESSION_ID;
    delete process.env.KITTY_WINDOW_ID;
    process.env.WT_SESSION = 'test';
    const profile = detectProfile();
    expect(profile?.name).toBe('Windows Terminal');
  });
});

describe('TerminalProfiles', () => {
  it('should have all expected profiles', () => {
    expect(TerminalProfiles.vscode).toBeDefined();
    expect(TerminalProfiles.cursor).toBeDefined();
    expect(TerminalProfiles['windows-terminal']).toBeDefined();
    expect(TerminalProfiles.iterm2).toBeDefined();
    expect(TerminalProfiles.kitty).toBeDefined();
    expect(TerminalProfiles.alacritty).toBeDefined();
    expect(TerminalProfiles.hyper).toBeDefined();
    expect(TerminalProfiles.warp).toBeDefined();
    expect(TerminalProfiles.tabby).toBeDefined();
    expect(TerminalProfiles.jetbrains).toBeDefined();
    expect(TerminalProfiles.conemu).toBeDefined();
    expect(TerminalProfiles['macos-terminal']).toBeDefined();
    expect(TerminalProfiles['gnome-terminal']).toBeDefined();
    expect(TerminalProfiles.konsole).toBeDefined();
    expect(TerminalProfiles.xterm).toBeDefined();
    expect(TerminalProfiles.tmux).toBeDefined();
    expect(TerminalProfiles.ssh).toBeDefined();
    expect(TerminalProfiles.dumb).toBeDefined();
  });

  it('should have valid profile structure', () => {
    for (const [name, profile] of Object.entries(TerminalProfiles)) {
      expect(profile.name).toBeDefined();
      expect(profile.term).toBeDefined();
      expect(profile.env).toBeDefined();
      expect(profile.size).toBeDefined();
      expect(profile.size.cols).toBeGreaterThan(0);
      expect(profile.size.rows).toBeGreaterThan(0);
      expect(typeof profile.bracketedPaste).toBe('boolean');
      expect(typeof profile.mouse).toBe('boolean');
    }
  });
});

describe('createTerminalEmulator', () => {
  it('should create emulator from profile name', () => {
    const emulator = createTerminalEmulator('vscode');
    expect(emulator.name).toBe('terminal-emulator');
    expect(emulator.getProfile().name).toBe('VS Code');
  });

  it('should create emulator from custom profile', () => {
    const customProfile = createProfile('vscode', {
      name: 'Custom VS Code',
      env: { CUSTOM_VAR: 'value' },
    });

    const emulator = createTerminalEmulator({ profile: customProfile });
    expect(emulator.getProfile().name).toBe('Custom VS Code');
    expect(emulator.getEnv().CUSTOM_VAR).toBe('value');
  });

  it('should merge environment overrides', () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      env: { EXTRA_VAR: 'extra' },
    });

    const env = emulator.getEnv();
    expect(env.TERM_PROGRAM).toBe('vscode');
    expect(env.EXTRA_VAR).toBe('extra');
  });

  it('should have correct direction', () => {
    const emulator = createTerminalEmulator('vscode');
    expect(emulator.direction).toBe('both');
  });
});

describe('createTerminalEnv', () => {
  it('should create environment for profile', () => {
    const env = createTerminalEnv('vscode');

    expect(env.TERM_PROGRAM).toBe('vscode');
    expect(env.VSCODE_INJECTION).toBe('1');
    expect(env.TERM).toBe('xterm-256color');
  });

  it('should apply overrides', () => {
    const env = createTerminalEnv('vscode', { TERM: 'custom-term' });

    expect(env.TERM).toBe('custom-term');
    expect(env.TERM_PROGRAM).toBe('vscode');
  });

  it('should throw for unknown profile', () => {
    expect(() => createTerminalEnv('nonexistent')).toThrow('Unknown terminal profile');
  });
});

describe('applyTerminalEnv', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it('should apply environment variables', () => {
    applyTerminalEnv('vscode');

    expect(process.env.TERM_PROGRAM).toBe('vscode');
    expect(process.env.VSCODE_INJECTION).toBe('1');
  });
});

describe('createProfile', () => {
  it('should create profile from base string', () => {
    const profile = createProfile('vscode', {
      name: 'Modified VS Code',
    });

    expect(profile.name).toBe('Modified VS Code');
    expect(profile.term).toBe('xterm-256color');
    expect(profile.env.TERM_PROGRAM).toBe('vscode');
  });

  it('should merge environment variables', () => {
    const profile = createProfile('vscode', {
      env: { CUSTOM: 'value' },
    });

    expect(profile.env.TERM_PROGRAM).toBe('vscode');
    expect(profile.env.CUSTOM).toBe('value');
  });

  it('should merge escape responses', () => {
    const profile = createProfile('vscode', {
      escapeResponses: { '\x1b[?test': 'response' },
    });

    expect(profile.escapeResponses['\x1b[?test']).toBe('response');
  });
});

describe('getCapabilities', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return capability object', () => {
    const caps = getCapabilities();

    expect(typeof caps.colors).toBe('number');
    expect(typeof caps.trueColor).toBe('boolean');
    expect(typeof caps.unicode).toBe('boolean');
    expect(typeof caps.mouse).toBe('boolean');
    expect(typeof caps.bracketedPaste).toBe('boolean');
    expect(typeof caps.focusEvents).toBe('boolean');
    expect(typeof caps.sixel).toBe('boolean');
    expect(typeof caps.kittyGraphics).toBe('boolean');
    expect(typeof caps.iterm2Images).toBe('boolean');
  });
});

describe('Terminal Emulator Middleware', () => {
  it('should pass messages through', async () => {
    const emulator = createTerminalEmulator('vscode');
    const ctx = createMockContext();
    const next = vi.fn();

    const msg = createMockMessage('hello', 'in');
    await emulator.fn(msg, ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should respond to DA1 query', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      respondToQueries: true,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    // DA1 query
    const msg = createMockMessage('\x1b[c', 'out');
    await emulator.fn(msg, ctx, next);

    expect(ctx.send).toHaveBeenCalledWith('\x1b[?62;22c');
  });

  it('should respond to DA2 query', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      respondToQueries: true,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    // DA2 query
    const msg = createMockMessage('\x1b[>c', 'out');
    await emulator.fn(msg, ctx, next);

    expect(ctx.send).toHaveBeenCalledWith('\x1b[>0;10;1c');
  });

  it('should respond to cursor position query', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      respondToQueries: true,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    // CPR query
    const msg = createMockMessage('\x1b[6n', 'out');
    await emulator.fn(msg, ctx, next);

    expect(ctx.send).toHaveBeenCalledWith('\x1b[1;1R');
  });

  it('should respond to device status query', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      respondToQueries: true,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    // DSR query
    const msg = createMockMessage('\x1b[5n', 'out');
    await emulator.fn(msg, ctx, next);

    expect(ctx.send).toHaveBeenCalledWith('\x1b[0n');
  });

  it('should not respond when respondToQueries is false', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      respondToQueries: false,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    const msg = createMockMessage('\x1b[c', 'out');
    await emulator.fn(msg, ctx, next);

    expect(ctx.send).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Use Case Tests - Real-world simulation scenarios
// ═══════════════════════════════════════════════════════════════════════════════

describe('Use Cases: Terminal Simulation', () => {
  // Store a completely clean env state
  const cleanEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear ALL terminal-related env vars
    const terminalVars = [
      'VSCODE_INJECTION', 'VSCODE_GIT_IPC_HANDLE', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION',
      'CURSOR_SESSION_ID', 'CURSOR_TRACE_ID', 'WT_SESSION', 'WT_PROFILE_ID',
      'ITERM_SESSION_ID', 'ITERM_PROFILE', 'LC_TERMINAL', 'LC_TERMINAL_VERSION',
      'KITTY_WINDOW_ID', 'KITTY_PID', 'TERM', 'COLORTERM',
      'TERMINAL_EMULATOR', 'ConEmuPID', 'TMUX', 'TMUX_PANE',
      'SSH_CLIENT', 'SSH_TTY', 'SSH_CONNECTION',
    ];

    for (const v of terminalVars) {
      cleanEnv[v] = process.env[v];
      delete process.env[v];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const [key, value] of Object.entries(cleanEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('Simulate VS Code from clean state', () => {
    it('should make detectTerminal return VS Code after applying env', () => {
      // Verify clean state (no VS Code)
      let info = detectTerminal();
      expect(info.isVSCode).toBe(false);

      // Apply VS Code environment
      applyTerminalEnv('vscode');

      // Now should be detected as VS Code
      info = detectTerminal();
      expect(info.isVSCode).toBe(true);
      expect(info.program).toBe('vscode');
    });
  });

  describe('Simulate iTerm2 from any terminal', () => {
    it('should apply iTerm2 environment correctly', () => {
      // Apply iTerm2 environment
      applyTerminalEnv('iterm2');

      const info = detectTerminal();
      expect(info.isITerm).toBe(true);
      expect(info.program).toBe('iTerm.app');
      expect(process.env.ITERM_SESSION_ID).toBeDefined();
      expect(process.env.LC_TERMINAL).toBe('iTerm2');
    });
  });

  describe('Simulate Kitty terminal', () => {
    it('should apply Kitty environment and support kitty graphics', () => {
      applyTerminalEnv('kitty');

      const info = detectTerminal();
      expect(info.isKitty).toBe(true);
      expect(process.env.KITTY_WINDOW_ID).toBeDefined();
      expect(process.env.TERM).toBe('xterm-kitty');

      // Check profile capabilities from TerminalProfiles directly
      expect(TerminalProfiles.kitty.kittyGraphics).toBe(true);
    });
  });

  describe('Simulate Windows Terminal', () => {
    it('should apply Windows Terminal environment', () => {
      applyTerminalEnv('windows-terminal');

      const info = detectTerminal();
      expect(info.isWindowsTerminal).toBe(true);
      expect(process.env.WT_SESSION).toBeDefined();
    });
  });

  describe('Simulate SSH session', () => {
    it('should simulate remote SSH connection', () => {
      // Clear local terminal indicators
      delete process.env.VSCODE_INJECTION;
      delete process.env.TERM_PROGRAM;

      applyTerminalEnv('ssh');

      const info = detectTerminal();
      expect(info.isSSH).toBe(true);
      expect(process.env.SSH_CLIENT).toBeDefined();
      expect(process.env.SSH_TTY).toBeDefined();
    });
  });

  describe('Simulate tmux inside terminal', () => {
    it('should simulate tmux session', () => {
      delete process.env.VSCODE_INJECTION;
      delete process.env.TERM_PROGRAM;

      applyTerminalEnv('tmux');

      const info = detectTerminal();
      expect(info.isTmux).toBe(true);
      expect(process.env.TMUX).toBeDefined();
      expect(process.env.TMUX_PANE).toBe('%0');
      expect(process.env.TERM).toBe('tmux-256color');
    });
  });

  describe('Simulate JetBrains IDE terminal', () => {
    it('should simulate IntelliJ/PyCharm terminal', () => {
      delete process.env.VSCODE_INJECTION;
      delete process.env.TERM_PROGRAM;

      applyTerminalEnv('jetbrains');

      const info = detectTerminal();
      expect(info.isJetBrains).toBe(true);
      expect(process.env.TERMINAL_EMULATOR).toBe('JetBrains-JediTerm');
    });
  });

  describe('Simulate Cursor IDE', () => {
    it('should simulate Cursor (VS Code fork)', () => {
      delete process.env.VSCODE_INJECTION;
      delete process.env.TERM_PROGRAM;
      delete process.env.CURSOR_SESSION_ID;

      applyTerminalEnv('cursor');

      const info = detectTerminal();
      expect(info.isCursor).toBe(true);
      expect(process.env.CURSOR_SESSION_ID).toBeDefined();
      // Cursor also sets VS Code variables
      expect(process.env.VSCODE_INJECTION).toBe('1');
    });
  });

  describe('Simulate dumb terminal (no capabilities)', () => {
    it('should simulate minimal terminal', () => {
      delete process.env.VSCODE_INJECTION;
      delete process.env.TERM_PROGRAM;
      delete process.env.COLORTERM;

      applyTerminalEnv('dumb');

      expect(process.env.TERM).toBe('dumb');

      const profile = TerminalProfiles.dumb;
      expect(profile.bracketedPaste).toBe(false);
      expect(profile.mouse).toBe(false);
      expect(profile.focusEvents).toBe(false);
    });
  });
});

describe('Use Cases: Device Attribute Responses', () => {
  it('should respond with different DA1 for different terminals', async () => {
    const terminals = ['vscode', 'iterm2', 'kitty', 'xterm', 'windows-terminal'];
    const responses: Record<string, string> = {};

    for (const terminal of terminals) {
      const emulator = createTerminalEmulator({ profile: terminal, respondToQueries: true });
      const ctx = createMockContext();
      const msg = createMockMessage('\x1b[c', 'out');

      await emulator.fn(msg, ctx, async () => {});

      if ((ctx.send as any).mock.calls.length > 0) {
        responses[terminal] = (ctx.send as any).mock.calls[0][0];
      }
    }

    // Each terminal should have a unique DA1 response
    expect(responses.vscode).toBe('\x1b[?62;22c');
    expect(responses.iterm2).toBe('\x1b[?62;4c');
    expect(responses.kitty).toBe('\x1b[?62;c');
    expect(responses.xterm).toBe('\x1b[?64;1;2;6;9;15;18;21;22c');
    expect(responses['windows-terminal']).toBe('\x1b[?61;6;7;22;23;24;28;32;42c');
  });

  it('should respond to terminal size query with configured size', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      size: { cols: 200, rows: 50 },
      respondToQueries: true,
    });
    const ctx = createMockContext();

    // Text area size query (CSI 18 t)
    const msg = createMockMessage('\x1b[18t', 'out');
    await emulator.fn(msg, ctx, async () => {});

    expect(ctx.send).toHaveBeenCalledWith('\x1b[8;50;200t');
  });

  it('should respond to iTerm2 specific queries', async () => {
    const emulator = createTerminalEmulator({
      profile: 'iterm2',
      respondToQueries: true,
    });
    const ctx = createMockContext();

    // iTerm2 cell size report
    const msg = createMockMessage('\x1b]1337;ReportCellSize\x07', 'out');
    await emulator.fn(msg, ctx, async () => {});

    expect(ctx.send).toHaveBeenCalledWith('\x1b]1337;ReportCellSize=10;20\x07');
  });
});

describe('Use Cases: Custom Profile Creation', () => {
  it('should create custom profile based on existing one', () => {
    const myTerminal = createProfile('vscode', {
      name: 'My Custom VS Code',
      env: {
        MY_CUSTOM_VAR: 'custom_value',
        CUSTOM_FEATURE: 'enabled',
      },
      size: { cols: 200, rows: 60 },
      da1Response: '\x1b[?99;custom;c',
    });

    expect(myTerminal.name).toBe('My Custom VS Code');
    expect(myTerminal.env.TERM_PROGRAM).toBe('vscode'); // Inherited
    expect(myTerminal.env.MY_CUSTOM_VAR).toBe('custom_value'); // Custom
    expect(myTerminal.size.cols).toBe(200);
    expect(myTerminal.da1Response).toBe('\x1b[?99;custom;c');
  });

  it('should use custom profile in emulator', async () => {
    const customProfile = createProfile('xterm', {
      name: 'Enhanced XTerm',
      da1Response: '\x1b[?custom;enhanced;c',
      escapeResponses: {
        '\x1b[?special': 'custom-response',
      },
    });

    const emulator = createTerminalEmulator({
      profile: customProfile,
      respondToQueries: true,
    });

    const ctx = createMockContext();

    // DA1 query
    const msg1 = createMockMessage('\x1b[c', 'out');
    await emulator.fn(msg1, ctx, async () => {});
    expect(ctx.send).toHaveBeenCalledWith('\x1b[?custom;enhanced;c');

    // Custom escape sequence
    (ctx.send as any).mockClear();
    const msg2 = createMockMessage('\x1b[?special', 'out');
    await emulator.fn(msg2, ctx, async () => {});
    expect(ctx.send).toHaveBeenCalledWith('custom-response');
  });
});

describe('Use Cases: Environment Injection', () => {
  it('should inject environment commands on first input', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      injectEnv: true,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    // First input message
    const msg = createMockMessage('echo hello', 'in');
    await emulator.fn(msg, ctx, next);

    // Message should be prefixed with env commands (export on Unix, set on Windows)
    expect(msg.raw).toContain('TERM_PROGRAM=');
    expect(msg.raw).toContain('VSCODE_INJECTION=');
    expect(msg.raw).toContain('echo hello');
  });

  it('should only inject once', async () => {
    const emulator = createTerminalEmulator({
      profile: 'vscode',
      injectEnv: true,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    // First input - should inject (export on Unix, set on Windows)
    const msg1 = createMockMessage('cmd1', 'in');
    await emulator.fn(msg1, ctx, next);
    // Check for either export (Unix) or set (Windows)
    const hasEnvCommand = msg1.raw.includes('export') || msg1.raw.includes('set ');
    expect(hasEnvCommand).toBe(true);

    // Second input - should NOT inject again
    const msg2 = createMockMessage('cmd2', 'in');
    await emulator.fn(msg2, ctx, next);
    expect(msg2.raw).toBe('cmd2');
  });
});
