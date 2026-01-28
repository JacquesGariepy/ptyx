/**
 * Terminal Detection & Emulation
 *
 * Provides comprehensive terminal environment detection and simulation capabilities.
 *
 * @example
 * ```typescript
 * import { detectTerminal, createTerminalEmulator, TerminalProfiles } from 'ptyx';
 *
 * // Detect current environment
 * const info = detectTerminal();
 * console.log(info.program); // 'vscode', 'windows-terminal', etc.
 *
 * // Emulate a specific terminal
 * const agent = await createAgent({
 *   command: 'node',
 *   middleware: [createTerminalEmulator('vscode')],
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { Middleware, Message, Context } from './types.js';
import { middleware } from './middleware.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Terminal information detected from environment
 */
export interface TerminalInfo {
  /** Terminal type (TERM env var) */
  type: string | undefined;
  /** Terminal program name */
  program: string | undefined;
  /** Terminal program version */
  version: string | undefined;
  /** Platform */
  platform: NodeJS.Platform;
  /** Is running in VS Code */
  isVSCode: boolean;
  /** Is running in Cursor IDE */
  isCursor: boolean;
  /** Is running in Windows Terminal */
  isWindowsTerminal: boolean;
  /** Is running in iTerm2 */
  isITerm: boolean;
  /** Is running in Hyper */
  isHyper: boolean;
  /** Is running in Alacritty */
  isAlacritty: boolean;
  /** Is running in Kitty */
  isKitty: boolean;
  /** Is running in Warp */
  isWarp: boolean;
  /** Is running in Tabby */
  isTabby: boolean;
  /** Is running in JetBrains IDE */
  isJetBrains: boolean;
  /** Is running in ConEmu/Cmder */
  isConEmu: boolean;
  /** Is running via SSH */
  isSSH: boolean;
  /** Is running in tmux */
  isTmux: boolean;
  /** Is running in screen */
  isScreen: boolean;
  /** Is running in CI environment */
  isCI: boolean;
  /** Is running in Docker */
  isDocker: boolean;
  /** Is running in WSL */
  isWSL: boolean;
  /** Is a TTY */
  isTTY: boolean;
  /** Terminal columns */
  cols: number;
  /** Terminal rows */
  rows: number;
  /** Color depth (1, 4, 8, or 24) */
  colorDepth: number;
  /** Supports true color (24-bit) */
  trueColor: boolean;
  /** Supports Unicode */
  unicode: boolean;
  /** Shell type */
  shell: string | undefined;
  /** All detected environment variables */
  env: Record<string, string | undefined>;
}

/**
 * Terminal profile for emulation
 */
export interface TerminalProfile {
  /** Profile name */
  name: string;
  /** Environment variables to set */
  env: Record<string, string>;
  /** TERM value */
  term: string;
  /** Device Attributes response (DA1) */
  da1Response: string;
  /** Device Attributes response (DA2) */
  da2Response: string;
  /** Device Attributes response (DA3) */
  da3Response: string;
  /** Terminal size */
  size: { cols: number; rows: number };
  /** Color capabilities */
  colors: 256 | 16777216;
  /** Supports bracketed paste */
  bracketedPaste: boolean;
  /** Supports focus events */
  focusEvents: boolean;
  /** Supports mouse */
  mouse: boolean;
  /** Supports sixel graphics */
  sixel: boolean;
  /** Supports kitty graphics */
  kittyGraphics: boolean;
  /** Supports iTerm2 inline images */
  iterm2Images: boolean;
  /** Custom escape sequence responses */
  escapeResponses: Record<string, string>;
}

/**
 * Terminal emulator options
 */
export interface TerminalEmulatorOptions {
  /** Profile to emulate (name or custom profile) */
  profile: string | TerminalProfile;
  /** Override environment variables */
  env?: Record<string, string>;
  /** Override terminal size */
  size?: { cols: number; rows: number };
  /** Respond to device attribute queries */
  respondToQueries?: boolean;
  /** Inject environment on first message */
  injectEnv?: boolean;
  /** Log emulation actions */
  debug?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Terminal Profiles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pre-defined terminal profiles for emulation
 */
export const TerminalProfiles: Record<string, TerminalProfile> = {
  // VS Code Integrated Terminal
  vscode: {
    name: 'VS Code',
    env: {
      TERM_PROGRAM: 'vscode',
      TERM_PROGRAM_VERSION: '1.85.0',
      VSCODE_INJECTION: '1',
      VSCODE_GIT_IPC_HANDLE: '/tmp/vscode-git-ipc.sock',
      COLORTERM: 'truecolor',
      VSCODE_TERMINAL_ID: 'terminal-1',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;22c',
    da2Response: '\x1b[>0;10;1c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 120, rows: 30 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {
      // Operating System Command responses
      '\x1b]10;?\x07': '\x1b]10;rgb:f8f8/f8f8/f8f8\x1b\\', // Foreground color
      '\x1b]11;?\x07': '\x1b]11;rgb:1e1e/1e1e/1e1e\x1b\\', // Background color
    },
  },

  // Cursor IDE (VS Code fork)
  cursor: {
    name: 'Cursor',
    env: {
      TERM_PROGRAM: 'vscode',
      TERM_PROGRAM_VERSION: '1.85.0',
      VSCODE_INJECTION: '1',
      CURSOR_SESSION_ID: 'cursor-session-12345',
      CURSOR_TRACE_ID: 'trace-12345',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;22c',
    da2Response: '\x1b[>0;10;1c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 120, rows: 30 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // Windows Terminal
  'windows-terminal': {
    name: 'Windows Terminal',
    env: {
      TERM_PROGRAM: 'Windows Terminal',
      WT_SESSION: 'wt-session-12345',
      WT_PROFILE_ID: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?61;6;7;22;23;24;28;32;42c',
    da2Response: '\x1b[>0;10;1c',
    da3Response: '\x1bP!|7E7E7E7E\x1b\\',
    size: { cols: 120, rows: 30 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // iTerm2
  iterm2: {
    name: 'iTerm2',
    env: {
      TERM_PROGRAM: 'iTerm.app',
      TERM_PROGRAM_VERSION: '3.4.23',
      ITERM_SESSION_ID: 'w0t0p0:12345678-1234-1234-1234-123456789012',
      ITERM_PROFILE: 'Default',
      COLORTERM: 'truecolor',
      LC_TERMINAL: 'iTerm2',
      LC_TERMINAL_VERSION: '3.4.23',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;4c',
    da2Response: '\x1b[>0;95;0c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 120, rows: 35 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: true,
    kittyGraphics: false,
    iterm2Images: true,
    escapeResponses: {
      '\x1b]1337;ReportCellSize\x07': '\x1b]1337;ReportCellSize=10;20\x07',
    },
  },

  // Kitty
  kitty: {
    name: 'Kitty',
    env: {
      TERM: 'xterm-kitty',
      TERM_PROGRAM: 'kitty',
      KITTY_WINDOW_ID: '1',
      KITTY_PID: '12345',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-kitty',
    da1Response: '\x1b[?62;c',
    da2Response: '\x1b[>1;4000;29c',
    da3Response: '\x1bP!|4B495454\x1b\\', // "KITT" in hex
    size: { cols: 120, rows: 35 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: true,
    iterm2Images: false,
    escapeResponses: {
      '\x1b_Gi=1,q=1;\x1b\\': '\x1b_Gi=1;OK\x1b\\', // Kitty graphics query
    },
  },

  // Alacritty
  alacritty: {
    name: 'Alacritty',
    env: {
      TERM: 'alacritty',
      TERM_PROGRAM: 'Alacritty',
      COLORTERM: 'truecolor',
    },
    term: 'alacritty',
    da1Response: '\x1b[?62;4c',
    da2Response: '\x1b[>0;1;0c',
    da3Response: '\x1bP!|414C4143\x1b\\', // "ALAC" in hex
    size: { cols: 120, rows: 35 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // Hyper
  hyper: {
    name: 'Hyper',
    env: {
      TERM_PROGRAM: 'Hyper',
      TERM_PROGRAM_VERSION: '3.4.1',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?1;2c',
    da2Response: '\x1b[>0;276;0c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 120, rows: 30 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // Warp
  warp: {
    name: 'Warp',
    env: {
      TERM_PROGRAM: 'WarpTerminal',
      TERM_PROGRAM_VERSION: '2024.01.01',
      WARP_IS_LOCAL_SHELL_SESSION: '1',
      WARP_USE_SSH_WRAPPER: '1',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;22c',
    da2Response: '\x1b[>0;10;1c',
    da3Response: '\x1bP!|57415250\x1b\\', // "WARP" in hex
    size: { cols: 120, rows: 35 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // Tabby (formerly Terminus)
  tabby: {
    name: 'Tabby',
    env: {
      TERM_PROGRAM: 'Tabby',
      TERM_PROGRAM_VERSION: '1.0.205',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;22c',
    da2Response: '\x1b[>0;10;1c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 120, rows: 30 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // JetBrains IDEs (IntelliJ, PyCharm, WebStorm, etc.)
  jetbrains: {
    name: 'JetBrains',
    env: {
      TERM_PROGRAM: 'JetBrains-JediTerm',
      TERMINAL_EMULATOR: 'JetBrains-JediTerm',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;22c',
    da2Response: '\x1b[>0;10;1c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 120, rows: 25 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // ConEmu / Cmder (Windows)
  conemu: {
    name: 'ConEmu',
    env: {
      ConEmuPID: '12345',
      ConEmuANSI: 'ON',
      ConEmuTask: '{cmd}',
      TERM: 'cygwin',
      COLORTERM: 'truecolor',
    },
    term: 'cygwin',
    da1Response: '\x1b[?1;2c',
    da2Response: '\x1b[>0;136;0c',
    da3Response: '\x1bP!|434F4E45\x1b\\', // "CONE" in hex
    size: { cols: 120, rows: 30 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: false,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // macOS Terminal.app
  'macos-terminal': {
    name: 'Apple Terminal',
    env: {
      TERM_PROGRAM: 'Apple_Terminal',
      TERM_PROGRAM_VERSION: '453',
      TERM_SESSION_ID: '12345678-1234-1234-1234-123456789012',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?1;2c',
    da2Response: '\x1b[>1;95;0c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 80, rows: 24 },
    colors: 256,
    bracketedPaste: true,
    focusEvents: false,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // GNOME Terminal
  'gnome-terminal': {
    name: 'GNOME Terminal',
    env: {
      TERM_PROGRAM: 'gnome-terminal',
      COLORTERM: 'truecolor',
      VTE_VERSION: '7200',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?65;1;9c',
    da2Response: '\x1b[>65;5700;1c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 80, rows: 24 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // Konsole (KDE)
  konsole: {
    name: 'Konsole',
    env: {
      TERM_PROGRAM: 'konsole',
      KONSOLE_DBUS_SERVICE: 'org.kde.konsole-12345',
      KONSOLE_DBUS_SESSION: '/Sessions/1',
      COLORTERM: 'truecolor',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;c',
    da2Response: '\x1b[>0;115;0c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 80, rows: 24 },
    colors: 16777216,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // xterm
  xterm: {
    name: 'XTerm',
    env: {
      XTERM_VERSION: 'XTerm(388)',
      XTERM_LOCALE: 'en_US.UTF-8',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?64;1;2;6;9;15;18;21;22c',
    da2Response: '\x1b[>41;388;0c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 80, rows: 24 },
    colors: 256,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: true,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // tmux
  tmux: {
    name: 'tmux',
    env: {
      TMUX: '/tmp/tmux-1000/default,12345,0',
      TMUX_PANE: '%0',
      TERM: 'tmux-256color',
    },
    term: 'tmux-256color',
    da1Response: '\x1b[?62;c',
    da2Response: '\x1b[>84;0;0c',
    da3Response: '\x1bP!|746D7578\x1b\\', // "tmux" in hex
    size: { cols: 80, rows: 24 },
    colors: 256,
    bracketedPaste: true,
    focusEvents: true,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // SSH (generic)
  ssh: {
    name: 'SSH Session',
    env: {
      SSH_CLIENT: '192.168.1.100 54321 22',
      SSH_CONNECTION: '192.168.1.100 54321 192.168.1.1 22',
      SSH_TTY: '/dev/pts/0',
    },
    term: 'xterm-256color',
    da1Response: '\x1b[?62;c',
    da2Response: '\x1b[>0;10;1c',
    da3Response: '\x1bP!|00000000\x1b\\',
    size: { cols: 80, rows: 24 },
    colors: 256,
    bracketedPaste: true,
    focusEvents: false,
    mouse: true,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },

  // Minimal/dumb terminal
  dumb: {
    name: 'Dumb Terminal',
    env: {},
    term: 'dumb',
    da1Response: '',
    da2Response: '',
    da3Response: '',
    size: { cols: 80, rows: 24 },
    colors: 256,
    bracketedPaste: false,
    focusEvents: false,
    mouse: false,
    sixel: false,
    kittyGraphics: false,
    iterm2Images: false,
    escapeResponses: {},
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect current terminal environment
 */
export function detectTerminal(): TerminalInfo {
  const env = process.env;

  // Detect terminal program
  let program = env.TERM_PROGRAM;
  let version = env.TERM_PROGRAM_VERSION;

  // Specific detections
  const isVSCode = !!(env.VSCODE_INJECTION || env.VSCODE_GIT_IPC_HANDLE || program === 'vscode');
  const isCursor = !!(env.CURSOR_SESSION_ID || env.CURSOR_TRACE_ID);
  const isWindowsTerminal = !!env.WT_SESSION;
  const isITerm = !!(program === 'iTerm.app' || env.ITERM_SESSION_ID);
  const isHyper = program === 'Hyper';
  const isAlacritty = env.TERM === 'alacritty' || program === 'Alacritty';
  const isKitty = !!(env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty');
  const isWarp = !!(program === 'WarpTerminal' || env.WARP_IS_LOCAL_SHELL_SESSION);
  const isTabby = program === 'Tabby';
  const isJetBrains = !!(program === 'JetBrains-JediTerm' || env.TERMINAL_EMULATOR === 'JetBrains-JediTerm');
  const isConEmu = !!env.ConEmuPID;
  const isSSH = !!(env.SSH_CLIENT || env.SSH_TTY || env.SSH_CONNECTION);
  const isTmux = !!env.TMUX;
  const isScreen = !!env.STY;
  const isCI = !!(env.CI || env.GITHUB_ACTIONS || env.GITLAB_CI || env.JENKINS_URL || env.TRAVIS);
  const isDocker = !!(env.container === 'docker' || require('fs').existsSync('/.dockerenv'));
  const isWSL = !!(env.WSL_DISTRO_NAME || env.WSLENV);

  // TTY and size
  const isTTY = process.stdout.isTTY ?? false;
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;

  // Color depth
  let colorDepth = 1;
  if (typeof process.stdout.getColorDepth === 'function') {
    colorDepth = process.stdout.getColorDepth();
  } else if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') {
    colorDepth = 24;
  } else if (env.TERM?.includes('256color')) {
    colorDepth = 8;
  } else if (isTTY) {
    colorDepth = 4;
  }

  const trueColor = colorDepth === 24 || env.COLORTERM === 'truecolor';

  // Unicode support (heuristic)
  const unicode = !!(
    env.LANG?.includes('UTF-8') ||
    env.LC_ALL?.includes('UTF-8') ||
    env.LC_CTYPE?.includes('UTF-8')
  );

  // Shell detection
  let shell = env.SHELL;
  if (process.platform === 'win32') {
    if (env.PSModulePath) shell = 'powershell';
    else shell = env.COMSPEC || 'cmd.exe';
  }

  return {
    type: env.TERM,
    program,
    version,
    platform: process.platform,
    isVSCode,
    isCursor,
    isWindowsTerminal,
    isITerm,
    isHyper,
    isAlacritty,
    isKitty,
    isWarp,
    isTabby,
    isJetBrains,
    isConEmu,
    isSSH,
    isTmux,
    isScreen,
    isCI,
    isDocker,
    isWSL,
    isTTY,
    cols,
    rows,
    colorDepth,
    trueColor,
    unicode,
    shell,
    env: {
      TERM: env.TERM,
      TERM_PROGRAM: env.TERM_PROGRAM,
      TERM_PROGRAM_VERSION: env.TERM_PROGRAM_VERSION,
      COLORTERM: env.COLORTERM,
      LANG: env.LANG,
      SHELL: env.SHELL,
    },
  };
}

/**
 * Get the best matching profile for current terminal
 */
export function detectProfile(): TerminalProfile | null {
  const info = detectTerminal();

  if (info.isCursor) return TerminalProfiles.cursor;
  if (info.isVSCode) return TerminalProfiles.vscode;
  if (info.isWindowsTerminal) return TerminalProfiles['windows-terminal'];
  if (info.isITerm) return TerminalProfiles.iterm2;
  if (info.isKitty) return TerminalProfiles.kitty;
  if (info.isAlacritty) return TerminalProfiles.alacritty;
  if (info.isHyper) return TerminalProfiles.hyper;
  if (info.isWarp) return TerminalProfiles.warp;
  if (info.isTabby) return TerminalProfiles.tabby;
  if (info.isJetBrains) return TerminalProfiles.jetbrains;
  if (info.isConEmu) return TerminalProfiles.conemu;
  if (info.isTmux) return TerminalProfiles.tmux;

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Emulation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Device Attribute query patterns
 */
const DA_QUERIES = {
  // Primary Device Attributes (DA1)
  da1: /\x1b\[c|\x1b\[0c/,
  // Secondary Device Attributes (DA2)
  da2: /\x1b\[>c|\x1b\[>0c/,
  // Tertiary Device Attributes (DA3)
  da3: /\x1b\[=c|\x1b\[=0c/,
  // Request Terminal Parameters
  decreqtparm: /\x1b\[x/,
  // Device Status Report
  dsr: /\x1b\[5n/,
  // Cursor Position Report
  cpr: /\x1b\[6n/,
  // Extended Cursor Position Report
  extcpr: /\x1b\[?6n/,
  // Window title query
  windowTitle: /\x1b\[21t/,
  // Text area size in pixels
  textAreaPixels: /\x1b\[14t/,
  // Text area size in characters
  textAreaChars: /\x1b\[18t/,
  // Screen size in characters
  screenChars: /\x1b\[19t/,
  // XTVERSION query
  xtversion: /\x1b\[>0q/,
  // XTGETTCAP
  xtgettcap: /\x1bP\+q/,
};

/**
 * Create a terminal emulator middleware
 */
export function createTerminalEmulator(
  options: TerminalEmulatorOptions | string
): Middleware & {
  getProfile: () => TerminalProfile;
  getEnv: () => Record<string, string>;
} {
  // Resolve options
  const opts: TerminalEmulatorOptions = typeof options === 'string'
    ? { profile: options }
    : options;

  // Resolve profile
  const profile: TerminalProfile = typeof opts.profile === 'string'
    ? TerminalProfiles[opts.profile] ?? TerminalProfiles.xterm
    : opts.profile;

  // Merge environment
  const env: Record<string, string> = {
    ...profile.env,
    ...opts.env,
    TERM: profile.term,
  };

  // Effective size
  const size = opts.size ?? profile.size;

  // Track state
  let envInjected = false;

  const mw = middleware(
    'terminal-emulator',
    'both',
    async (msg, ctx, next) => {
      // Handle input (queries from the wrapped process)
      if (msg.direction === 'out' && opts.respondToQueries !== false) {
        const response = handleQuery(msg.raw, profile, size);
        if (response) {
          // Send response back to the process
          ctx.send(response);
          if (opts.debug) {
            ctx.log(`[emulator] Query detected, responding: ${JSON.stringify(response)}`);
          }
        }
      }

      // Inject environment on first input
      if (msg.direction === 'in' && opts.injectEnv && !envInjected) {
        // Prepend environment setup commands
        const envSetup = Object.entries(env)
          .map(([k, v]) => {
            if (process.platform === 'win32') {
              return `set ${k}=${v}`;
            }
            return `export ${k}="${v}"`;
          })
          .join(' && ') + ' && ';

        msg.raw = envSetup + msg.raw;
        envInjected = true;

        if (opts.debug) {
          ctx.log(`[emulator] Injected environment variables`);
        }
      }

      await next();
    },
    5 // High priority
  );

  return {
    ...mw,
    getProfile: () => profile,
    getEnv: () => env,
  };
}

/**
 * Handle terminal query and return appropriate response
 */
function handleQuery(
  data: string,
  profile: TerminalProfile,
  size: { cols: number; rows: number }
): string | null {
  // Check standard queries
  if (DA_QUERIES.da1.test(data)) {
    return profile.da1Response;
  }
  if (DA_QUERIES.da2.test(data)) {
    return profile.da2Response;
  }
  if (DA_QUERIES.da3.test(data)) {
    return profile.da3Response;
  }
  if (DA_QUERIES.dsr.test(data)) {
    return '\x1b[0n'; // Terminal OK
  }
  if (DA_QUERIES.cpr.test(data)) {
    return `\x1b[1;1R`; // Cursor at row 1, col 1
  }
  if (DA_QUERIES.textAreaChars.test(data)) {
    return `\x1b[8;${size.rows};${size.cols}t`;
  }
  if (DA_QUERIES.screenChars.test(data)) {
    return `\x1b[9;${size.rows};${size.cols}t`;
  }

  // Check custom escape responses
  for (const [query, response] of Object.entries(profile.escapeResponses)) {
    if (data.includes(query)) {
      return response;
    }
  }

  return null;
}

/**
 * Create environment variables for a terminal profile
 */
export function createTerminalEnv(
  profileName: string,
  overrides?: Record<string, string>
): Record<string, string> {
  const profile = TerminalProfiles[profileName];
  if (!profile) {
    throw new Error(`Unknown terminal profile: ${profileName}`);
  }

  return {
    ...profile.env,
    TERM: profile.term,
    ...overrides,
  };
}

/**
 * Apply terminal environment to current process
 */
export function applyTerminalEnv(
  profileName: string,
  overrides?: Record<string, string>
): void {
  const env = createTerminalEnv(profileName, overrides);
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if current terminal supports a feature
 */
export function supportsFeature(feature: keyof TerminalProfile): boolean {
  const profile = detectProfile();
  if (!profile) return false;
  return !!profile[feature];
}

/**
 * Get terminal capabilities
 */
export function getCapabilities(): {
  colors: number;
  trueColor: boolean;
  unicode: boolean;
  mouse: boolean;
  bracketedPaste: boolean;
  focusEvents: boolean;
  sixel: boolean;
  kittyGraphics: boolean;
  iterm2Images: boolean;
} {
  const profile = detectProfile();
  const info = detectTerminal();

  return {
    colors: profile?.colors ?? (info.trueColor ? 16777216 : 256),
    trueColor: info.trueColor,
    unicode: info.unicode,
    mouse: profile?.mouse ?? true,
    bracketedPaste: profile?.bracketedPaste ?? true,
    focusEvents: profile?.focusEvents ?? false,
    sixel: profile?.sixel ?? false,
    kittyGraphics: profile?.kittyGraphics ?? false,
    iterm2Images: profile?.iterm2Images ?? false,
  };
}

/**
 * Create a custom terminal profile
 */
export function createProfile(
  base: string | TerminalProfile,
  overrides: Partial<TerminalProfile>
): TerminalProfile {
  const baseProfile = typeof base === 'string'
    ? TerminalProfiles[base] ?? TerminalProfiles.xterm
    : base;

  return {
    ...baseProfile,
    ...overrides,
    env: {
      ...baseProfile.env,
      ...overrides.env,
    },
    escapeResponses: {
      ...baseProfile.escapeResponses,
      ...overrides.escapeResponses,
    },
  };
}
