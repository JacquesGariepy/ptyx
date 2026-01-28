#!/usr/bin/env node
/**
 * QUICK TEST - Verify ptyx works
 *
 * Run:
 *   cd ptyx
 *   npm install
 *   node examples/test-quick.mjs
 */

import { createAgent } from '../dist/index.mjs';

console.log('Quick test of ptyx\n');

// Test 1: Run bash
console.log('Test 1: Running bash...');
try {
  const bash = await createAgent({
    command: 'bash',
    args: ['-c', 'echo "Hello from bash!" && pwd'],
  });

  let output = '';
  bash.on('message', (msg) => {
    if (msg.direction === 'out') output += msg.text;
  });

  await bash.wait(1000);
  await bash.dispose();

  console.log('Bash OK:', output.trim().slice(0, 50));
} catch (err) {
  console.log('Bash error:', err.message);
}

// Test 2: Run Python (if available)
console.log('\nTest 2: Running Python...');
try {
  const py = await createAgent({
    command: 'python3',
    args: ['-c', 'print("Hello from Python!")'],
  });

  let output = '';
  py.on('message', (msg) => {
    if (msg.direction === 'out') output += msg.text;
  });

  await py.wait(1000);
  await py.dispose();

  console.log('Python OK:', output.trim());
} catch (err) {
  console.log('Python not available:', err.message);
}

// Test 3: Check Claude (without actually launching it)
console.log('\nTest 3: Checking Claude CLI...');
try {
  const which = await createAgent({
    command: 'which',
    args: ['claude'],
  });

  let output = '';
  which.on('message', (msg) => {
    if (msg.direction === 'out') output += msg.text;
  });

  await which.wait(500);
  await which.dispose();

  if (output.trim()) {
    console.log('Claude found:', output.trim());
  } else {
    console.log('Claude CLI not found in PATH');
  }
} catch (err) {
  console.log('Claude CLI not found');
}

console.log('\nTests completed!\n');
console.log('To use with Claude:');
console.log('  import { createWithAdapter } from "ptyx";');
console.log('  import { registerAiAdapters } from "ptyx/adapters/ai";');
console.log('  registerAiAdapters();');
console.log('  const ai = await createWithAdapter({ command: "claude" });');
console.log('  ai.sendLine("Hello!");');
