/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GUIDE D'INTÉGRATION: pty-agent dans ton app / moltbot
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Ce fichier montre EXACTEMENT comment intégrer pty-agent.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAPE 1: Dans ton package.json, ajoute la dépendance
// ═══════════════════════════════════════════════════════════════════════════════
/*
{
  "dependencies": {
    "pty-agent": "^1.0.0"
  }
}

Ou si tu utilises le package local:
{
  "dependencies": {
    "pty-agent": "file:../pty-agent"
  }
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// ÉTAPE 2: Import dans ton code
// ═══════════════════════════════════════════════════════════════════════════════

import { createAgent, claude, createWithAdapter } from 'pty-agent';
import { logger, fileLogger, interceptor } from 'pty-agent/middleware';

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION A: Service simple pour moltbot
// ═══════════════════════════════════════════════════════════════════════════════

export class ClaudeService {
  private agent: Awaited<ReturnType<typeof claude>> | null = null;
  private responseCallbacks: Map<string, (response: string) => void> = new Map();
  private currentBuffer = '';
  
  async start() {
    // Lancer Claude
    this.agent = await claude(['--model', 'claude-sonnet-4-20250514']);
    
    // Logger invisible
    this.agent.use(fileLogger({ path: 'claude.log' }));
    
    // Collecter les réponses
    this.agent.on('message', (msg) => {
      if (msg.direction === 'out') {
        this.currentBuffer += msg.text;
        
        // Détecter fin de réponse (prompt)
        if (/[❯>]\s*$/.test(this.currentBuffer)) {
          this.flushResponse();
        }
      }
    });
    
    console.log('✅ ClaudeService démarré');
  }
  
  async ask(question: string): Promise<string> {
    if (!this.agent) throw new Error('Service not started');
    
    return new Promise((resolve) => {
      const id = Date.now().toString();
      this.responseCallbacks.set(id, resolve);
      this.currentBuffer = '';
      
      // Envoyer la question
      this.agent!.sendLine(question);
      
      // Timeout de sécurité
      setTimeout(() => {
        if (this.responseCallbacks.has(id)) {
          this.responseCallbacks.delete(id);
          resolve(this.currentBuffer || '[timeout]');
        }
      }, 60000);
    });
  }
  
  private flushResponse() {
    const response = this.currentBuffer.replace(/[❯>]\s*$/, '').trim();
    this.currentBuffer = '';
    
    // Résoudre le premier callback en attente
    const [id, callback] = this.responseCallbacks.entries().next().value || [];
    if (callback) {
      this.responseCallbacks.delete(id);
      callback(response);
    }
  }
  
  async stop() {
    await this.agent?.dispose();
    this.agent = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION B: Intégration directe dans moltbot gateway
// ═══════════════════════════════════════════════════════════════════════════════

/*
Dans ton gateway moltbot (packages/gateway/src/index.ts ou similaire):
*/

import { WebSocketServer } from 'ws';

export async function setupMoltbotGateway() {
  const wss = new WebSocketServer({ port: 18789 });
  const claudeService = new ClaudeService();
  
  await claudeService.start();
  
  wss.on('connection', (ws) => {
    console.log('Client connecté');
    
    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'chat') {
        // Envoyer à Claude via pty-agent
        const response = await claudeService.ask(msg.content);
        
        // Renvoyer la réponse
        ws.send(JSON.stringify({
          type: 'response',
          content: response,
          timestamp: Date.now(),
        }));
      }
    });
  });
  
  console.log('🚀 Gateway moltbot sur ws://localhost:18789');
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION C: Mode streaming (réponses en temps réel)
// ═══════════════════════════════════════════════════════════════════════════════

export class ClaudeStreamService {
  private agent: Awaited<ReturnType<typeof claude>> | null = null;
  
  async start() {
    this.agent = await claude();
  }
  
  /**
   * Envoyer une question et recevoir la réponse en streaming
   */
  async *stream(question: string): AsyncGenerator<string> {
    if (!this.agent) throw new Error('Not started');
    
    // Créer une queue pour les chunks
    const chunks: string[] = [];
    let done = false;
    let resolver: (() => void) | null = null;
    
    const handler = (msg: any) => {
      if (msg.direction === 'out') {
        chunks.push(msg.text);
        resolver?.();
        
        // Détecter fin
        if (/[❯>]\s*$/.test(msg.text)) {
          done = true;
          resolver?.();
        }
      }
    };
    
    this.agent.on('message', handler);
    this.agent.sendLine(question);
    
    try {
      while (!done) {
        if (chunks.length === 0) {
          await new Promise<void>(r => { resolver = r; });
        }
        
        while (chunks.length > 0) {
          yield chunks.shift()!;
        }
      }
    } finally {
      this.agent.off('message', handler);
    }
  }
  
  async stop() {
    await this.agent?.dispose();
  }
}

// Usage streaming:
/*
const service = new ClaudeStreamService();
await service.start();

for await (const chunk of service.stream('Raconte une histoire')) {
  process.stdout.write(chunk);  // Affiche en temps réel
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION D: Multi-CLI (pas juste Claude)
// ═══════════════════════════════════════════════════════════════════════════════

export class MultiAgentService {
  private agents: Map<string, Awaited<ReturnType<typeof createAgent>>> = new Map();
  
  async spawn(name: string, command: string, args: string[] = []) {
    const agent = await createAgent({ command, args, name });
    this.agents.set(name, agent);
    return agent;
  }
  
  async send(name: string, input: string): Promise<void> {
    const agent = this.agents.get(name);
    if (!agent) throw new Error(`Agent ${name} not found`);
    agent.sendLine(input);
  }
  
  on(name: string, event: string, callback: (...args: any[]) => void) {
    const agent = this.agents.get(name);
    agent?.on(event as any, callback);
  }
  
  async stopAll() {
    await Promise.all([...this.agents.values()].map(a => a.dispose()));
    this.agents.clear();
  }
}

// Usage:
/*
const service = new MultiAgentService();

await service.spawn('claude', 'claude', ['--model', 'opus']);
await service.spawn('python', 'python3', ['-i']);
await service.spawn('shell', 'bash');

service.on('claude', 'message', (msg) => console.log('[Claude]', msg.text));
service.on('python', 'message', (msg) => console.log('[Python]', msg.text));

await service.send('claude', 'Hello!');
await service.send('python', 'print("Hi!")');
*/

// ═══════════════════════════════════════════════════════════════════════════════
// EXEMPLE COMPLET: App Express avec Claude
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';

export async function createApp() {
  const app = express();
  app.use(express.json());
  
  const claude = new ClaudeService();
  await claude.start();
  
  // Endpoint simple
  app.post('/chat', async (req, res) => {
    try {
      const { message } = req.body;
      const response = await claude.ask(message);
      res.json({ response });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Endpoint streaming (SSE)
  app.get('/stream', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).send('Missing q parameter');
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const streamService = new ClaudeStreamService();
    await streamService.start();
    
    for await (const chunk of streamService.stream(q as string)) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
    
    await streamService.stop();
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await claude.stop();
    process.exit(0);
  });
  
  return app;
}

// Lancer:
/*
const app = await createApp();
app.listen(3000, () => console.log('API sur http://localhost:3000'));

// Test:
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Claude!"}'
*/

// ═══════════════════════════════════════════════════════════════════════════════
// RÉSUMÉ: Ce que tu dois faire
// ═══════════════════════════════════════════════════════════════════════════════

/*
1. AJOUTER LA DÉPENDANCE:
   npm install pty-agent
   ou copier le dossier pty-agent dans ton projet

2. IMPORTER:
   import { claude, createAgent } from 'pty-agent';

3. CRÉER UN SERVICE:
   const service = new ClaudeService();
   await service.start();

4. UTILISER:
   const response = await service.ask('Question');

5. FERMER:
   await service.stop();

C'est tout! Le reste (PTY, middleware, etc.) est géré automatiquement.
*/

export { claude, createAgent, logger, fileLogger, interceptor };
