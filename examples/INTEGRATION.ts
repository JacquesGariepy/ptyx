/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTEGRATION GUIDE: ptyx in your app
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file shows EXACTLY how to integrate ptyx.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: Add the dependency to your package.json
// ═══════════════════════════════════════════════════════════════════════════════
/*
{
  "dependencies": {
    "ptyx": "^1.0.0"
  }
}

Or if using the local package:
{
  "dependencies": {
    "ptyx": "file:../ptyx"
  }
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: Import in your code
// ═══════════════════════════════════════════════════════════════════════════════

import { createAgent, createWithAdapter, fileLogger } from 'ptyx';
import { registerAiAdapters } from 'ptyx/adapters/ai';

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION A: Simple service
// ═══════════════════════════════════════════════════════════════════════════════

export class ClaudeService {
  private agent: Awaited<ReturnType<typeof createWithAdapter>> | null = null;
  private responseCallbacks: Map<string, (response: string) => void> = new Map();
  private currentBuffer = '';

  async start() {
    // Register adapters
    registerAiAdapters();

    // Start Claude
    this.agent = await createWithAdapter({
      command: 'claude',
      args: ['--model', 'claude-sonnet-4-20250514'],
    });

    // Invisible logger
    this.agent.use(fileLogger({ path: 'claude.log' }));

    // Collect responses
    this.agent.on('message', (msg) => {
      if (msg.direction === 'out') {
        this.currentBuffer += msg.text;

        // Detect end of response (prompt)
        if (/[❯>]\s*$/.test(this.currentBuffer)) {
          this.flushResponse();
        }
      }
    });

    console.log('ClaudeService started');
  }

  async ask(question: string): Promise<string> {
    if (!this.agent) throw new Error('Service not started');

    return new Promise((resolve) => {
      const id = Date.now().toString();
      this.responseCallbacks.set(id, resolve);
      this.currentBuffer = '';

      // Send the question
      this.agent!.sendLine(question);

      // Safety timeout
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

    // Resolve the first waiting callback
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
// OPTION B: Direct integration in gateway
// ═══════════════════════════════════════════════════════════════════════════════

/*
In your gateway (e.g., packages/gateway/src/index.ts):
*/

import { WebSocketServer } from 'ws';

export async function setupGateway() {
  const wss = new WebSocketServer({ port: 18789 });
  const claudeService = new ClaudeService();

  await claudeService.start();

  wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'chat') {
        // Send to Claude via ptyx
        const response = await claudeService.ask(msg.content);

        // Send response back
        ws.send(JSON.stringify({
          type: 'response',
          content: response,
          timestamp: Date.now(),
        }));
      }
    });
  });

  console.log('Gateway running on ws://localhost:18789');
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION C: Streaming mode (real-time responses)
// ═══════════════════════════════════════════════════════════════════════════════

export class ClaudeStreamService {
  private agent: Awaited<ReturnType<typeof createWithAdapter>> | null = null;

  async start() {
    registerAiAdapters();
    this.agent = await createWithAdapter({ command: 'claude' });
  }

  /**
   * Send a question and receive the response as a stream
   */
  async *stream(question: string): AsyncGenerator<string> {
    if (!this.agent) throw new Error('Not started');

    // Create a queue for chunks
    const chunks: string[] = [];
    let done = false;
    let resolver: (() => void) | null = null;

    const handler = (msg: any) => {
      if (msg.direction === 'out') {
        chunks.push(msg.text);
        resolver?.();

        // Detect end
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

for await (const chunk of service.stream('Tell me a story')) {
  process.stdout.write(chunk);  // Display in real-time
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// OPTION D: Multi-CLI (not just Claude)
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
// COMPLETE EXAMPLE: Express App with Claude
// ═══════════════════════════════════════════════════════════════════════════════

import express from 'express';

export async function createApp() {
  const app = express();
  app.use(express.json());

  const claude = new ClaudeService();
  await claude.start();

  // Simple endpoint
  app.post('/chat', async (req, res) => {
    try {
      const { message } = req.body;
      const response = await claude.ask(message);
      res.json({ response });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Streaming endpoint (SSE)
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

// Start:
/*
const app = await createApp();
app.listen(3000, () => console.log('API on http://localhost:3000'));

// Test:
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Claude!"}'
*/

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY: What you need to do
// ═══════════════════════════════════════════════════════════════════════════════

/*
1. ADD THE DEPENDENCY:
   npm install ptyx
   or copy the ptyx folder into your project

2. IMPORT:
   import { createAgent, createWithAdapter } from 'ptyx';
   import { registerAiAdapters } from 'ptyx/adapters/ai';

3. CREATE A SERVICE:
   registerAiAdapters();
   const service = new ClaudeService();
   await service.start();

4. USE:
   const response = await service.ask('Question');

5. CLOSE:
   await service.stop();

That's it! The rest (PTY, middleware, etc.) is handled automatically.
*/

export { createAgent, createWithAdapter, fileLogger };
