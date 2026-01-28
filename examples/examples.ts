/**
 * ptyx - Practical Examples (new architecture)
 *
 * Installation:
 *   npm install ptyx
 *
 * The new architecture uses adapter injection:
 *   - No hardcoded adapters in main package
 *   - Optional adapters in 'ptyx/adapters/*'
 *   - Support for npm plugins and local files
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 1: Basic usage - Without adapter (generic)
// ═══════════════════════════════════════════════════════════════════════════════

import { createAgent } from 'ptyx';

async function basicExample() {
  // Launch any CLI without specific adapter
  const agent = await createAgent({
    command: 'node',
    args: ['-e', 'console.log("Hello from ptyx!")'],
  });

  agent.on('message', (msg) => {
    if (msg.direction === 'out') {
      console.log('Output:', msg.text);
    }
  });

  await agent.wait(1000);
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 2: With builtin adapters
// ═══════════════════════════════════════════════════════════════════════════════

import { createWithAdapter, registerAdapter } from 'ptyx';
// Import AI adapters from 'ptyx/adapters/ai'
import { claudeAdapter } from 'ptyx/adapters/ai';

async function builtinsExample() {
  // Register Claude adapter
  // You can also use: import { registerAiAdapters } from 'ptyx/adapters/ai'; registerAiAdapters();
  registerAdapter(claudeAdapter);

  // Create agent - adapter is auto-detected
  const ai = await createWithAdapter({
    command: 'claude',
    args: ['--model', 'claude-sonnet-4-20250514'],
  });

  ai.on('message', (msg) => {
    if (msg.direction === 'out') {
      console.log('Claude:', msg.text);
    }
  });

  ai.sendLine('Hello! Just say "OK".');
  await ai.waitFor(/[❯>]\s*$/, 30000);
  await ai.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 3: Direct adapter injection
// ═══════════════════════════════════════════════════════════════════════════════

import { defineAdapter } from 'ptyx';

async function injectionExample() {
  // Define a custom inline adapter
  const myAdapter = defineAdapter({
    name: 'my-repl',
    detect: (config) => config.command.includes('python'),
    isPrompt: (msg) => msg.text.includes('>>>'),
    isReady: (msg) => msg.text.includes('Python'),
  });

  // Inject adapter directly
  const agent = await createWithAdapter({
    command: 'python3',
    args: ['-i'],
    adapter: myAdapter, // Direct injection
  });

  agent.on('ready', () => {
    console.log('Python REPL ready!');
    agent.sendLine('print("Hello!")');
  });

  await agent.wait(2000);
  agent.sendLine('exit()');
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 4: Plugin loading
// ═══════════════════════════════════════════════════════════════════════════════

import { loadAdapterPlugin } from 'ptyx';

async function pluginExample() {
  // Option A: Load and register manually
  await loadAdapterPlugin('./my-adapter.js');

  // Option B: Load via config
  const agent = await createWithAdapter({
    command: 'my-cli',
    adapterPlugin: './my-adapter.js', // Auto-loads
  });

  await agent.wait(1000);
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 5: Multi-agents with different adapters
// ═══════════════════════════════════════════════════════════════════════════════

import { registerAdapters } from 'ptyx';
import { builtinAdapters } from 'ptyx/adapters/builtins';

async function multiAgentsExample() {
  // Register all REPL builtins (node, python, bash)
  registerAdapters(builtinAdapters);

  // Create multiple agents
  const [nodeAgent, pythonAgent] = await Promise.all([
    createWithAdapter({ command: 'node', args: ['-i'], name: 'node' }),
    createWithAdapter({ command: 'python3', args: ['-i'], name: 'python' }),
  ]);

  // Listen to all agents
  for (const agent of [nodeAgent, pythonAgent]) {
    agent.on('message', (msg) => {
      if (msg.direction === 'out') {
        console.log(`[${agent.name}] ${msg.text.slice(0, 50)}`);
      }
    });
  }

  nodeAgent.sendLine('console.log("Node ready")');
  pythonAgent.sendLine('print("Python ready")');

  await Promise.all([nodeAgent.wait(1000), pythonAgent.wait(1000)]);
  await Promise.all([nodeAgent.dispose(), pythonAgent.dispose()]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 6: Adapter with custom middleware
// ═══════════════════════════════════════════════════════════════════════════════

import type { Middleware } from 'ptyx';

async function middlewareExample() {
  const adapterWithMiddleware = defineAdapter({
    name: 'logging-cli',
    detect: () => true,
    isReady: () => true,
    middleware: (): Middleware[] => [
      {
        name: 'timestamp-logger',
        direction: 'both',
        priority: 10,
        fn: async (msg, ctx, next) => {
          const time = new Date().toISOString();
          console.log(`[${time}] [${msg.direction}] ${msg.text.slice(0, 30)}...`);
          await next();
        },
      },
    ],
  });

  const agent = await createWithAdapter({
    command: 'node',
    args: ['-e', 'console.log("test")'],
    adapter: adapterWithMiddleware,
  });

  await agent.wait(1000);
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 7: Observer pattern - Typed events
// ═══════════════════════════════════════════════════════════════════════════════

async function eventsExample() {
  const agent = await createAgent({
    command: 'node',
    args: ['-i'],
    debug: true,
  });

  // All available events
  agent.on('spawn', (pid) => console.log(`Spawned: PID ${pid}`));
  agent.on('ready', () => console.log('Ready for input'));
  agent.on('message', (msg) => console.log(`Message: ${msg.direction}`));
  agent.on('data', (data, dir) => console.log(`Data: ${dir} ${data.length} bytes`));
  agent.on('resize', (cols, rows) => console.log(`Resize: ${cols}x${rows}`));
  agent.on('error', (err) => console.error(`Error: ${err.message}`));
  agent.on('exit', (code, signal) => console.log(`Exit: ${code}, signal: ${signal}`));

  agent.sendLine('process.exit(0)');
  await agent.wait(1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 8: Using middleware utilities
// ═══════════════════════════════════════════════════════════════════════════════

import { logger, fileLogger, interceptor, recorder } from 'ptyx';

async function middlewareUtilitiesExample() {
  const agent = await createAgent({
    command: 'node',
    args: ['-i'],
  });

  // Log to console
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

  // Transform/filter messages
  agent.use(interceptor({
    transformIn: (msg) => {
      msg.meta.timestamp = Date.now();
      return msg;
    },
    block: [/password/i], // Block sensitive patterns
  }));

  // Record session for replay
  const rec = recorder({ maxSize: 1000 });
  agent.use(rec);

  agent.sendLine('console.log("Hello")');
  await agent.wait(1000);

  console.log('Recording:', rec.getRecording().length, 'messages');
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 9: AI CLI with all adapters
// ═══════════════════════════════════════════════════════════════════════════════

import { registerAiAdapters, aiAdapters } from 'ptyx/adapters/ai';

async function aiAdaptersExample() {
  // Register all AI CLI adapters at once
  // Includes: claude, copilot, gemini, mistral, ollama, lmstudio,
  //           aider, cursor, vibeos, opencode, codex
  registerAiAdapters();

  console.log('Available AI adapters:', aiAdapters.map(a => a.name).join(', '));

  // Now any AI CLI is auto-detected
  const agent = await createWithAdapter({
    command: 'claude',
  });

  agent.on('ready', () => {
    console.log('AI CLI ready!');
  });

  await agent.wait(2000);
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run an example
// ═══════════════════════════════════════════════════════════════════════════════

const example = process.argv[2] || 'basic';

const examples: Record<string, () => Promise<void>> = {
  basic: basicExample,
  builtins: builtinsExample,
  injection: injectionExample,
  plugin: pluginExample,
  multi: multiAgentsExample,
  middleware: middlewareExample,
  events: eventsExample,
  utils: middlewareUtilitiesExample,
  ai: aiAdaptersExample,
};

if (examples[example]) {
  console.log(`\nRunning example: ${example}\n`);
  examples[example]().catch(console.error);
} else {
  console.log(`
Available examples:
  npx ts-node examples.ts basic      - Basic usage without adapter
  npx ts-node examples.ts builtins   - With builtin adapters
  npx ts-node examples.ts injection  - Direct adapter injection
  npx ts-node examples.ts plugin     - Plugin loading
  npx ts-node examples.ts multi      - Multi-agents
  npx ts-node examples.ts middleware - Adapter with middleware
  npx ts-node examples.ts events     - Observer pattern
  npx ts-node examples.ts utils      - Middleware utilities
  npx ts-node examples.ts ai         - AI CLI adapters
`);
}
