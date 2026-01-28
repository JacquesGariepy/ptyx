#!/usr/bin/env node
/**
 * TEST RAPIDE - Vérifie que ptyx fonctionne
 *
 * Lancer:
 *   cd ptyx
 *   npm install
 *   node examples/test-quick.mjs
 */

import { createAgent } from '../dist/index.mjs';

console.log('🧪 Test rapide de ptyx\n');

// Test 1: Lancer bash
console.log('Test 1: Lancer bash...');
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

  console.log('✅ Bash OK:', output.trim().slice(0, 50));
} catch (err) {
  console.log('❌ Bash erreur:', err.message);
}

// Test 2: Lancer Python (si disponible)
console.log('\nTest 2: Lancer Python...');
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

  console.log('✅ Python OK:', output.trim());
} catch (err) {
  console.log('⚠️  Python non disponible:', err.message);
}

// Test 3: Vérifier Claude (sans le lancer vraiment)
console.log('\nTest 3: Vérifier Claude CLI...');
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
    console.log('✅ Claude trouvé:', output.trim());
  } else {
    console.log('⚠️  Claude CLI non trouvé dans PATH');
  }
} catch (err) {
  console.log('⚠️  Claude CLI non trouvé');
}

console.log('\n✨ Tests terminés!\n');
console.log('Pour utiliser avec Claude:');
console.log('  import { createWithAdapter } from "ptyx";');
console.log('  import { registerAiAdapters } from "ptyx/adapters/ai";');
console.log('  registerAiAdapters();');
console.log('  const ai = await createWithAdapter({ command: "claude" });');
console.log('  ai.sendLine("Hello!");');
