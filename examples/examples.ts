/**
 * ptyx - Exemples pratiques (nouvelle architecture)
 *
 * Installation:
 *   npm install ptyx
 *
 * La nouvelle architecture utilise l'injection d'adapters:
 *   - Aucun adapter hardcodé dans le package principal
 *   - Adapters optionnels dans 'ptyx/adapters/*'
 *   - Support plugins npm et fichiers locaux
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXEMPLE 1: Usage basique - Sans adapter (generic)
// ═══════════════════════════════════════════════════════════════════════════════

import { createAgent } from 'ptyx';

async function exempleBasique() {
  // Lancer n'importe quel CLI sans adapter spécifique
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
// EXEMPLE 2: Avec builtin adapters
// ═══════════════════════════════════════════════════════════════════════════════

import { createWithAdapter, registerAdapter } from 'ptyx';
// Import optionnel des adapters builtin
import claudeAdapter from 'ptyx/adapters/claude';
import { registerBuiltins } from 'ptyx/adapters/builtins';

async function exempleAvecBuiltins() {
  // Option A: Enregistrer un seul adapter
  registerAdapter(claudeAdapter);

  // Option B: Enregistrer tous les builtins
  // registerBuiltins();

  // Créer agent - l'adapter est auto-détecté
  const ai = await createWithAdapter({
    command: 'claude',
    args: ['--model', 'claude-sonnet-4-20250514'],
  });

  ai.on('message', (msg) => {
    if (msg.direction === 'out') {
      console.log('Claude:', msg.text);
    }
  });

  ai.sendLine('Bonjour! Dis juste "OK".');
  await ai.waitFor(/[❯>]\s*$/, 30000);
  await ai.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXEMPLE 3: Injection directe d'adapter
// ═══════════════════════════════════════════════════════════════════════════════

import { createWithAdapter, defineAdapter } from 'ptyx';

async function exempleInjection() {
  // Définir un adapter custom inline
  const myAdapter = defineAdapter({
    name: 'my-repl',
    detect: (config) => config.command.includes('python'),
    isPrompt: (msg) => msg.text.includes('>>>'),
    isReady: (msg) => msg.text.includes('Python'),
  });

  // Injecter directement l'adapter
  const agent = await createWithAdapter({
    command: 'python3',
    args: ['-i'],
    adapter: myAdapter, // Injection directe
  });

  agent.on('ready', () => {
    console.log('Python REPL prêt!');
    agent.sendLine('print("Hello!")');
  });

  await agent.wait(2000);
  agent.sendLine('exit()');
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXEMPLE 4: Chargement de plugin
// ═══════════════════════════════════════════════════════════════════════════════

import { createWithAdapter, loadAdapterPlugin } from 'ptyx';

async function exemplePlugin() {
  // Option A: Charger et enregistrer manuellement
  await loadAdapterPlugin('./my-adapter.js');

  // Option B: Charger via config
  const agent = await createWithAdapter({
    command: 'my-cli',
    adapterPlugin: './my-adapter.js', // Charge automatiquement
  });

  await agent.wait(1000);
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXEMPLE 5: Multi-agents avec adapters différents
// ═══════════════════════════════════════════════════════════════════════════════

import { createWithAdapter, registerAdapters } from 'ptyx';
import { builtinAdapters } from 'ptyx/adapters/builtins';

async function exempleMultiAgents() {
  // Enregistrer tous les builtins
  registerAdapters(builtinAdapters);

  // Créer plusieurs agents
  const [nodeAgent, pythonAgent] = await Promise.all([
    createWithAdapter({ command: 'node', args: ['-i'], name: 'node' }),
    createWithAdapter({ command: 'python3', args: ['-i'], name: 'python' }),
  ]);

  // Écouter tous les agents
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
// EXEMPLE 6: Adapter avec middleware custom
// ═══════════════════════════════════════════════════════════════════════════════

import { createWithAdapter, defineAdapter, type Middleware } from 'ptyx';

async function exempleMiddleware() {
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
// EXEMPLE 7: Pattern Observer - Events typés
// ═══════════════════════════════════════════════════════════════════════════════

import { createAgent } from 'ptyx';

async function exempleEvents() {
  const agent = await createAgent({
    command: 'node',
    args: ['-i'],
    debug: true,
  });

  // Tous les events disponibles
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
// Lancer un exemple
// ═══════════════════════════════════════════════════════════════════════════════

const exemple = process.argv[2] || 'basique';

const exemples: Record<string, () => Promise<void>> = {
  basique: exempleBasique,
  builtins: exempleAvecBuiltins,
  injection: exempleInjection,
  plugin: exemplePlugin,
  multi: exempleMultiAgents,
  middleware: exempleMiddleware,
  events: exempleEvents,
};

if (exemples[exemple]) {
  console.log(`\nLancement exemple: ${exemple}\n`);
  exemples[exemple]().catch(console.error);
} else {
  console.log(`
Exemples disponibles:
  npx ts-node examples.ts basique    - Usage basique sans adapter
  npx ts-node examples.ts builtins   - Avec builtin adapters
  npx ts-node examples.ts injection  - Injection directe d'adapter
  npx ts-node examples.ts plugin     - Chargement de plugin
  npx ts-node examples.ts multi      - Multi-agents
  npx ts-node examples.ts middleware - Adapter avec middleware
  npx ts-node examples.ts events     - Pattern observer
`);
}
