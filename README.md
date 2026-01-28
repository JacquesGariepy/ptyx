# pty-agent

> Universal transparent PTY wrapper — Launch and control any CLI invisibly.

[![npm version](https://img.shields.io/npm/v/pty-agent.svg?style=flat-square)](https://www.npmjs.com/package/pty-agent)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

## What is this?

`pty-agent` is a universal wrapper that can launch **any** command-line application through a pseudo-terminal (PTY), while remaining completely invisible to the wrapped process. It's like a one-way mirror for CLI applications.

**Use cases:**
- Wrap Claude CLI, ChatGPT CLI, or any AI assistant
- Automate interactive CLI tools
- Log and analyze terminal sessions
- Build agents that control other programs
- Test CLI applications programmatically
- Create transparent proxies

## Installation

```bash
npm install pty-agent
```

## Quick Start

### CLI Usage (Drop-in Wrapper)

```bash
# Wrap any command transparently
npx pty-agent claude --model opus

# With logging
PTY_AGENT_LOG=session.log npx pty-agent python3 -i

# Debug mode
PTY_AGENT_DEBUG=1 npx pty-agent node
```

### Programmatic Usage

```typescript
import { createAgent, claude, python, shell } from 'pty-agent';

// Generic: wrap any command
const agent = await createAgent({
  command: 'claude',
  args: ['--model', 'claude-opus-4-5'],
});

// Presets for common CLIs
const ai = await claude(['--model', 'opus']);
const py = await python('script.py');
const sh = await shell();

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

## API

### Creating Agents

```typescript
import { createAgent, wrap, exec } from 'pty-agent';

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

### Presets

```typescript
import { claude, node, python, bash, shell } from 'pty-agent';

// Claude CLI
const ai = await claude(['--model', 'opus']);

// Node.js
const n = await node('script.js', ['--arg']);

// Python
const py = await python('script.py');

// Bash command
const b = await bash('echo hello');

// Interactive shell
const sh = await shell();
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
} from 'pty-agent';
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
import { middleware } from 'pty-agent';

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

## Adapters

Adapters provide CLI-specific behavior (prompt detection, tool parsing, etc.)

### Built-in Adapters

```typescript
import {
  claudeAdapter,    // Claude CLI
  nodeAdapter,      // Node.js
  pythonAdapter,    // Python
  bashAdapter,      // Bash/shell
  genericAdapter,   // Fallback
} from 'pty-agent';
```

### Custom Adapter

```typescript
import { registerAdapter } from 'pty-agent';

registerAdapter({
  name: 'my-cli',
  
  // Detect if this adapter should handle the command
  detect: (config) => config.command === 'my-cli',
  
  // Modify config before spawn
  configure: (config) => ({
    ...config,
    env: { ...config.env, MY_VAR: 'value' },
  }),
  
  // Detect ready state
  isReady: (msg) => msg.text.includes('Ready>'),
  
  // Detect prompt
  isPrompt: (msg) => /^>\s*$/m.test(msg.text),
  
  // Default middleware
  middleware: () => [
    logger({ output: true }),
  ],
});
```

## Integration Examples

### With moltbot

```typescript
import { claude } from 'pty-agent';
import { Gateway } from 'moltbot';

const gateway = new Gateway();
const ai = await claude();

gateway.on('message', (msg) => {
  ai.sendLine(msg.content);
});

ai.on('message', (msg) => {
  if (msg.direction === 'out') {
    gateway.reply(msg.text);
  }
});
```

### Express API

```typescript
import express from 'express';
import { createAgent } from 'pty-agent';

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
import { createAgent } from 'pty-agent';
import { test, expect } from 'vitest';

test('CLI responds correctly', async () => {
  const agent = await createAgent({ command: 'my-cli' });
  
  agent.sendLine('help');
  const msg = await agent.waitFor(/Usage:/i);
  
  expect(msg.text).toContain('Usage:');
  await agent.dispose();
});
```

## Publishing to npm

First time setup:

```bash
# 1. Create npm account at https://www.npmjs.com/signup

# 2. Login
npm login

# 3. Build
npm run build

# 4. Publish
npm publish
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PTY_AGENT_DEBUG` | Set to `1` for debug output |
| `PTY_AGENT_LOG` | Path to log file |
| `CLAUDE_PATH` | Custom path to Claude CLI |

## License

MIT © Jacques Gariepy
