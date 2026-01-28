# ptyx

> Universal transparent PTY wrapper — Launch and control any CLI invisibly.

[![npm version](https://img.shields.io/npm/v/ptyx.svg?style=flat-square)](https://www.npmjs.com/package/ptyx)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

## What is this?

`ptyx` is a universal wrapper that can launch **any** command-line application through a pseudo-terminal (PTY), while remaining completely invisible to the wrapped process. It's like a one-way mirror for CLI applications.

**Use cases:**
- Wrap Claude CLI, ChatGPT CLI, or any AI assistant
- Automate interactive CLI tools
- Log and analyze terminal sessions
- Build agents that control other programs
- Test CLI applications programmatically
- Create transparent proxies

## Installation

```bash
# npm
npm install ptyx

# pnpm
pnpm add ptyx

# yarn
yarn add ptyx
```

### Platform Support

ptyx works out of the box on all platforms:

| Platform | Architecture | Status |
|----------|--------------|--------|
| Windows | x64, arm64 | ✅ |
| macOS | Intel (x64) | ✅ |
| macOS | Apple Silicon (M1/M2/M3) | ✅ |
| Linux | x64, arm64 | ✅ |

Native bindings are automatically downloaded for your platform during installation.

## Quick Start

### CLI Usage (Drop-in Wrapper)

```bash
# Wrap any command transparently
npx ptyx claude --model opus

# With logging
PTYX_LOG=session.log npx ptyx python3 -i

# Debug mode
PTYX_DEBUG=1 npx ptyx node

# Load AI adapters
npx ptyx --builtins claude --model opus
```

### Programmatic Usage

```typescript
import { createAgent, createWithAdapter } from 'ptyx';
import { registerAiAdapters } from 'ptyx/adapters/ai';

// Register AI adapters (claude, copilot, gemini, etc.)
registerAiAdapters();

// Generic: wrap any command
const agent = await createAgent({
  command: 'claude',
  args: ['--model', 'claude-opus-4-5'],
});

// With adapter auto-detection
const ai = await createWithAdapter({ command: 'claude' });

// Intercept all I/O
agent.on('message', (msg) => {
  console.log(`[${msg.direction}] ${msg.text}`);
});

// Send input
agent.sendLine('Hello!');

// Wait for specific output
const response = await agent.waitFor(/completed/i, 5000);

// Cleanup
await agent.dispose();
```

## Adapters

Adapters provide CLI-specific behavior (prompt detection, tool parsing, etc.)

### Built-in AI Adapters

```typescript
import { registerAiAdapters } from 'ptyx/adapters/ai';

// Register all AI CLI adapters at once
registerAiAdapters();

// Includes: claude, copilot, gemini, mistral (vibe), ollama, lmstudio,
// aider, cursor, vibeos, opencode, codex
```

### Built-in REPL Adapters

```typescript
import { registerBuiltins } from 'ptyx/adapters/builtins';

// Register shell/REPL adapters
registerBuiltins();

// Includes: node, python, bash
```

### Custom Adapter

```typescript
import { defineAdapter, registerAdapter, createWithAdapter } from 'ptyx';

const myAdapter = defineAdapter({
  name: 'my-cli',
  detect: (config) => config.command === 'my-cli',
  isReady: (msg) => msg.text.includes('Ready>'),
  isPrompt: (msg) => /^>\s*$/m.test(msg.text),
  configure: (config) => ({
    ...config,
    env: { ...config.env, MY_VAR: 'value' },
  }),
});

// Option 1: Register globally
registerAdapter(myAdapter);
const agent = await createWithAdapter({ command: 'my-cli' });

// Option 2: Inject directly
const agent = await createWithAdapter({
  command: 'my-cli',
  adapter: myAdapter,
});

// Option 3: Load from plugin file
const agent = await createWithAdapter({
  command: 'my-cli',
  adapterPlugin: './my-adapter.js',
});
```

## API

### Creating Agents

```typescript
import { createAgent, wrap, exec } from 'ptyx';

// Full configuration
const agent = await createAgent({
  command: 'claude',           // Command to run
  args: ['--verbose'],         // Arguments
  cwd: '/path/to/dir',         // Working directory
  env: { API_KEY: '...' },     // Environment variables
  cols: 120,                   // Terminal width
  rows: 30,                    // Terminal height
  debug: false,                // Debug logging
  autoRestart: false,          // Restart on crash
  maxRestarts: 3,              // Max restart attempts
  timeout: 30000,              // Operation timeout
});

// Quick wrap
const agent = await wrap('node', ['script.js']);

// From command string
const agent = await exec('python3 -i');
```

### Agent Methods

```typescript
// Lifecycle
await agent.spawn();           // Start process
agent.kill('SIGTERM');         // Kill process
await agent.dispose();         // Full cleanup

// I/O
agent.write('raw data');       // Write raw bytes
agent.send('with middleware'); // Process through middleware
agent.sendLine('with newline');// Send + newline
agent.resize(120, 30);         // Resize terminal

// Utilities
agent.clear();                 // Clear history
await agent.wait(1000);        // Wait ms
await agent.waitFor(/pattern/, 5000); // Wait for output
```

### Events

```typescript
agent.on('spawn', (pid) => {});          // Process started
agent.on('exit', (code, signal) => {});  // Process exited
agent.on('data', (data, direction) => {});// Raw I/O
agent.on('message', (msg) => {});        // Processed message
agent.on('ready', () => {});             // Ready for input
agent.on('error', (err) => {});          // Error occurred
agent.on('resize', (cols, rows) => {});  // Terminal resized
agent.on('restart', (attempt) => {});    // Auto-restarted
```

### Message Structure

```typescript
interface Message {
  raw: string;        // Raw data with ANSI codes
  text: string;       // Clean text
  direction: 'in' | 'out';
  ts: number;         // Timestamp
  agentId: string;    // Agent ID
  seq: number;        // Sequence number
  meta: {};           // Custom metadata
}
```

## Advanced Features

### Enhanced API

```typescript
// expect() - pexpect-like API with match details
const result = await agent.expect(/pattern/, { timeout: 5000 });
console.log(result.match, result.before, result.after);

// waitForAll() - wait for multiple patterns
const msgs = await agent.waitForAll([/ready/, /loaded/], 10000);

// waitForAny() - wait for first matching pattern
const { pattern, message, index } = await agent.waitForAny([/yes/, /no/]);

// waitForIdle() - wait for no output
await agent.waitForIdle(1000);

// sendKeys() - send special keys
agent.sendKeys(['ctrl+c', 'enter', 'escape']);

// sendSecret() - send without logging
agent.sendSecret('password123');

// healthcheck() - get agent status
const health = await agent.healthcheck();
```

### Session Recording & Playback

```typescript
import { createSessionRecorder, SessionPlayer } from 'ptyx';

// Record session
const { middleware, getRecorder } = createSessionRecorder();
const agent = await createAgent({ command: 'bash', middleware: [middleware] });

// ... use agent ...

// Export recording
const recorder = getRecorder();
recorder.end();
const json = recorder.export('json');      // JSON format
const cast = recorder.export('asciinema'); // asciinema format

// Replay session
const player = SessionPlayer.fromJSON(json);
await player.play((data) => process.stdout.write(data));
```

### Streams API

```typescript
import { createReadStream, createWriteStream, collectOutput } from 'ptyx';

// Pipe agent output
const readable = createReadStream(agent);
readable.pipe(process.stdout);

// Write via stream
const writable = createWriteStream(agent, { addNewline: true });
writable.write('echo hello');

// Collect all output
const output = await collectOutput(agent, { timeout: 5000 });
```

### Agent Pool

```typescript
import { createAgentPool } from 'ptyx';

const pool = createAgentPool({
  maxAgents: 10,
  minIdle: 2,
  agentConfig: { command: 'node', args: ['-i'] },
  acquireTimeout: 5000,
  validate: (agent) => agent.running,
});

await pool.warmup(3);
const agent = await pool.acquire();
// ... use agent ...
pool.release(agent);
await pool.destroy();
```

### WebSocket Server

```typescript
import { createServer } from 'ptyx';

const server = createServer({
  port: 8080,
  agentConfig: { command: 'bash' },
  authenticate: (req) => req.headers['auth'] === 'secret',
});

server.on('connection', (id) => console.log(`Connected: ${id}`));
await server.start();
```

### Terminal Detection & Emulation

```typescript
import { detectTerminal, createTerminalEmulator, TerminalProfiles } from 'ptyx';

// Detect current terminal environment
const info = detectTerminal();

// Available detection flags:
console.log(info.isVSCode);          // VS Code integrated terminal
console.log(info.isCursor);          // Cursor IDE
console.log(info.isWindowsTerminal); // Windows Terminal
console.log(info.isITerm);           // iTerm2 (macOS)
console.log(info.isKitty);           // Kitty terminal
console.log(info.isAlacritty);       // Alacritty
console.log(info.isHyper);           // Hyper terminal
console.log(info.isWarp);            // Warp terminal
console.log(info.isTabby);           // Tabby (formerly Terminus)
console.log(info.isJetBrains);       // JetBrains IDEs
console.log(info.isConEmu);          // ConEmu/Cmder (Windows)
console.log(info.isSSH);             // SSH session
console.log(info.isTmux);            // Inside tmux
console.log(info.isScreen);          // Inside GNU screen
console.log(info.isCI);              // CI environment (GitHub Actions, GitLab CI, etc.)
console.log(info.isDocker);          // Docker container
console.log(info.isWSL);             // Windows Subsystem for Linux
console.log(info.isTTY);             // Interactive TTY

// Terminal capabilities
console.log(info.cols, info.rows);   // Terminal size
console.log(info.colorDepth);        // Color depth (1, 4, 8, or 24)
console.log(info.trueColor);         // True color (24-bit) support
console.log(info.unicode);           // Unicode support
console.log(info.shell);             // Shell type (bash, zsh, powershell, etc.)
console.log(info.program);           // Terminal program name
console.log(info.version);           // Terminal program version

// Emulate a different terminal for CLI tools that check environment
const emulator = createTerminalEmulator({
  profile: 'vscode',  // or 'iterm2', 'kitty', 'windows-terminal', etc.
  respondToQueries: true,
});

const agent = await createAgent({
  command: 'some-cli',
  middleware: [emulator],
});

// Available profiles: vscode, cursor, windows-terminal, iterm2, kitty,
// alacritty, hyper, warp, tabby, jetbrains, conemu, macos-terminal,
// gnome-terminal, konsole, xterm, tmux, ssh, dumb
```

### Logging

ptyx includes a centralized logging system that all components use.

```typescript
import { createLogger, setLogLevel, LogLevel } from 'ptyx';

// Create a logger for your component
const log = createLogger('MyComponent');

// Logging methods (all go to stderr except print/printError)
log.debug('Detailed debug info');     // Only shown when debug enabled
log.info('General information');      // Default level
log.warn('Warning message');          // Warnings
log.error('Error occurred');          // Errors

// Event and timing (only shown in debug mode)
log.event('connection', { host: 'localhost', port: 8080 });
log.timing('Request completed', startTime);  // Logs duration in ms

// Check if debug mode is enabled
if (log.isDebugEnabled()) {
  // expensive debug operation
}

// User-facing output (goes to stdout/stderr, not logging)
log.print('Version: 1.0.0');          // stdout
log.printError('Command failed');     // stderr

// Create child loggers for sub-components
const childLog = log.child('SubModule');  // Creates 'MyComponent:SubModule'

// Control log level programmatically
setLogLevel(LogLevel.DEBUG);   // Show all logs
setLogLevel(LogLevel.WARN);    // Only warnings and errors
setLogLevel(LogLevel.SILENT);  // No logs
```

## Middleware

Middleware lets you intercept, transform, log, or block messages.

### Built-in Middleware

```typescript
import {
  logger,        // Console logging
  fileLogger,    // File logging
  interceptor,   // Transform/block
  inject,        // Inject content
  rateLimit,     // Rate limiting
  buffer,        // Buffer output
  recorder,      // Record session
  filter,        // Filter output
  stealth,       // Remove proxy traces
  metrics,       // Performance metrics
  audit,         // Audit logging
} from 'ptyx';
```

### Examples

```typescript
// Log everything
agent.use(logger({
  input: true,
  output: true,
  timestamps: true,
}));

// Log to file
agent.use(fileLogger({
  path: 'session.log',
  append: true,
}));

// Transform messages
agent.use(interceptor({
  transformIn: (msg) => {
    msg.raw = msg.raw.toUpperCase();
    return msg;
  },
  block: [/password/i],
}));

// Inject context
agent.use(inject({
  prefix: '[CONTEXT] User is admin\n',
  once: true,
}));

// Rate limit
agent.use(rateLimit({
  max: 10,
  window: 60000,
  onLimit: () => console.log('Rate limited!'),
}));

// Record session
const rec = recorder({ maxSize: 1000 });
agent.use(rec);
// Later: rec.getRecording()
```

### Custom Middleware

```typescript
import { middleware } from 'ptyx';

const myMiddleware = middleware(
  'my-middleware',  // Name
  'both',           // Direction: 'in' | 'out' | 'both'
  async (msg, ctx, next) => {
    // Access context
    console.log('Agent:', ctx.agent.name);
    console.log('History:', ctx.history.length);

    // Modify message
    msg.meta.processed = true;

    // Continue chain
    await next();

    // Post-processing
  },
  100  // Priority (lower = earlier)
);

agent.use(myMiddleware);
```

## Integration Examples

### Express API

```typescript
import express from 'express';
import { createAgent } from 'ptyx';

const app = express();

app.post('/execute', async (req, res) => {
  const { command, input } = req.body;

  const agent = await createAgent({ command });
  let output = '';

  agent.on('message', (msg) => {
    if (msg.direction === 'out') output += msg.text;
  });

  agent.sendLine(input);
  await agent.waitFor(/\$\s*$/, 5000);

  await agent.dispose();
  res.json({ output });
});
```

### Automated Testing

```typescript
import { createAgent } from 'ptyx';
import { test, expect } from 'vitest';

test('CLI responds correctly', async () => {
  const agent = await createAgent({ command: 'my-cli' });

  agent.sendLine('help');
  const msg = await agent.waitFor(/Usage:/i);

  expect(msg.text).toContain('Usage:');
  await agent.dispose();
});
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PTYX_DEBUG` | Set to `1` or `true` for debug output (shows DEBUG level logs) |
| `PTYX_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error`, or `silent` |
| `PTYX_LOG` | Path to log file for the CLI |
| `PTYX_ADAPTERS` | Comma-separated adapter plugins to load |
| `PTYX_SIMULATE` | Simulate terminal environment: `vscode`, `ci`, `tty`, or `notty` |
| `NO_COLOR` | Set to `1` to disable colored output |

### Log Level Hierarchy

Logs are filtered based on the current level:

```
debug → info → warn → error → silent
```

Setting `PTYX_LOG_LEVEL=warn` shows only `warn` and `error` messages. Setting `PTYX_DEBUG=1` is equivalent to `PTYX_LOG_LEVEL=debug`.

Example:
```bash
# Show all debug info
PTYX_DEBUG=1 npx ptyx claude

# Show only warnings and errors
PTYX_LOG_LEVEL=warn npx ptyx claude

# Silent mode (no logs)
PTYX_LOG_LEVEL=silent npx ptyx claude
```

## Publishing to npm

```bash
# 1. Login to npm
npm login

# 2. Build
npm run build

# 3. Publish
npm publish
```

## License

MIT © Jacques Gariepy
