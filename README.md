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
npm install ptyx
```

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

// Includes: claude, copilot, amazon-q, gemini, mistral, perplexity,
// ollama, tabby, aider, cody, cursor, continue, goose, vibeos,
// opencode, codeium, open-interpreter, chatgpt, codex, llm
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
| `PTYX_DEBUG` | Set to `1` for debug output |
| `PTYX_LOG` | Path to log file |
| `PTYX_ADAPTERS` | Comma-separated adapter plugins to load |

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
