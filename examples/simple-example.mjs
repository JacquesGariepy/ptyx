#!/usr/bin/env node
/**
 * Simple example - How to use ptyx
 *
 * Installation:
 *   npm install ptyx
 *
 * Run:
 *   node simple-example.mjs
 */

import { createAgent, createWithAdapter, logger } from 'ptyx';
import { registerAiAdapters } from 'ptyx/adapters/ai';

// ════════════════════════════════════════════════════════════════════
// Option 1: Run Claude
// ════════════════════════════════════════════════════════════════════

async function runClaude() {
  console.log('Starting Claude...\n');

  // Register AI adapters
  registerAiAdapters();

  // Create Claude agent
  const ai = await createWithAdapter({ command: 'claude' });

  // Listen for messages
  ai.on('message', (msg) => {
    if (msg.direction === 'out') {
      // msg.raw = with ANSI colors
      // msg.text = clean text
      process.stdout.write(msg.raw);
    }
  });

  // Send a question
  ai.sendLine('Say "Hello" in 5 different languages.');

  // Wait for end of response (prompt)
  await ai.waitFor(/[❯>]\s*$/, 60000);

  console.log('\n\nResponse received!');

  // Close
  await ai.dispose();
}

// ════════════════════════════════════════════════════════════════════
// Option 2: Run any CLI
// ════════════════════════════════════════════════════════════════════

async function runAnyCLI() {
  console.log('Starting bash...\n');

  const agent = await createAgent({
    command: 'bash',
    args: [],
  });

  // Log outputs
  agent.use(logger({ output: true }));

  // Listen
  agent.on('message', (msg) => {
    if (msg.direction === 'out') {
      console.log('[BASH]', msg.text);
    }
  });

  // Send commands
  agent.sendLine('echo "Hello World"');
  agent.sendLine('pwd');
  agent.sendLine('ls -la');

  await agent.wait(2000);

  agent.sendLine('exit');
  await agent.dispose();
}

// ════════════════════════════════════════════════════════════════════
// Option 3: Transparent passthrough mode (like a real terminal)
// ════════════════════════════════════════════════════════════════════

async function transparentMode() {
  const command = process.argv[3] || 'bash';
  console.log(`Transparent mode: ${command}\n`);

  const agent = await createAgent({
    command,
    args: process.argv.slice(4),
  });

  // Passthrough stdout
  agent.on('data', (data, dir) => {
    if (dir === 'out') process.stdout.write(data);
  });

  // Passthrough stdin
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data) => {
    agent.write(data.toString());
  });

  // Resize
  process.stdout.on('resize', () => {
    agent.resize(process.stdout.columns, process.stdout.rows);
  });

  // Exit when process terminates
  agent.on('exit', (code) => {
    console.log(`\n\nProcess exited (code: ${code})`);
    process.exit(code);
  });
}

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

const mode = process.argv[2] || 'claude';

switch (mode) {
  case 'claude':
    runClaude().catch(console.error);
    break;
  case 'bash':
    runAnyCLI().catch(console.error);
    break;
  case 'transparent':
    transparentMode().catch(console.error);
    break;
  default:
    console.log(`
Usage:
  node simple-example.mjs claude      # Run Claude
  node simple-example.mjs bash        # Run bash
  node simple-example.mjs transparent [cmd] [args...]  # Passthrough mode
`);
}
