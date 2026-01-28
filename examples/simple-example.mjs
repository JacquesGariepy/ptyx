#!/usr/bin/env node
/**
 * Exemple simple - Comment utiliser pty-agent
 * 
 * Installation:
 *   npm install pty-agent
 * 
 * Lancement:
 *   node simple-example.mjs
 */

import { createAgent, claude, logger } from 'pty-agent';

// ════════════════════════════════════════════════════════════════════
// Option 1: Lancer Claude
// ════════════════════════════════════════════════════════════════════

async function runClaude() {
  console.log('🚀 Lancement de Claude...\n');
  
  // Créer l'agent Claude
  const ai = await claude();
  
  // Écouter les messages
  ai.on('message', (msg) => {
    if (msg.direction === 'out') {
      // msg.raw = avec couleurs ANSI
      // msg.text = texte propre
      process.stdout.write(msg.raw);
    }
  });
  
  // Envoyer une question
  ai.sendLine('Dis "Bonjour" en 5 langues différentes.');
  
  // Attendre la fin de la réponse (prompt)
  await ai.waitFor(/[❯>]\s*$/, 60000);
  
  console.log('\n\n✅ Réponse reçue!');
  
  // Fermer
  await ai.dispose();
}

// ════════════════════════════════════════════════════════════════════
// Option 2: Lancer n'importe quel CLI
// ════════════════════════════════════════════════════════════════════

async function runAnyCLI() {
  console.log('🚀 Lancement de bash...\n');
  
  const agent = await createAgent({
    command: 'bash',
    args: [],
  });
  
  // Logger les sorties
  agent.use(logger({ output: true }));
  
  // Écouter
  agent.on('message', (msg) => {
    if (msg.direction === 'out') {
      console.log('[BASH]', msg.text);
    }
  });
  
  // Envoyer des commandes
  agent.sendLine('echo "Hello World"');
  agent.sendLine('pwd');
  agent.sendLine('ls -la');
  
  await agent.wait(2000);
  
  agent.sendLine('exit');
  await agent.dispose();
}

// ════════════════════════════════════════════════════════════════════
// Option 3: Mode passthrough transparent (comme un vrai terminal)
// ════════════════════════════════════════════════════════════════════

async function transparentMode() {
  const command = process.argv[3] || 'bash';
  console.log(`🚀 Mode transparent: ${command}\n`);
  
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
  
  // Exit quand le process termine
  agent.on('exit', (code) => {
    console.log(`\n\nProcess terminé (code: ${code})`);
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
  node simple-example.mjs claude      # Lancer Claude
  node simple-example.mjs bash        # Lancer bash
  node simple-example.mjs transparent [cmd] [args...]  # Mode passthrough
`);
}
