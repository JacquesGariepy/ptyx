/**
 * Integration example with ptyx
 *
 * This file shows how to control Claude CLI
 * (or any other CLI) via ptyx.
 */

import { createAgent, fileLogger } from 'ptyx';
import { EventEmitter } from 'node:events';

// ════════════════════════════════════════════════════════════════════
// Bridge: Class that bridges your app and ptyx
// ════════════════════════════════════════════════════════════════════

export class AgentBridge extends EventEmitter {
  private agent: Awaited<ReturnType<typeof createAgent>> | null = null;
  private responseBuffer = '';
  private isWaitingForResponse = false;

  constructor(private options: {
    command: string;
    args?: string[];
    logFile?: string;
    promptPattern?: RegExp;
  }) {
    super();
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    this.agent = await createAgent({
      command: this.options.command,
      args: this.options.args || [],
      autoRestart: true,
      maxRestarts: 5,
    });

    // Optional logging
    if (this.options.logFile) {
      this.agent.use(fileLogger({
        path: this.options.logFile,
        append: true,
      }));
    }

    // Listen for outgoing messages
    this.agent.on('message', (msg) => {
      if (msg.direction === 'out') {
        this.handleOutput(msg.text);
      }
    });

    this.agent.on('exit', (code) => {
      this.emit('exit', code);
    });

    this.agent.on('error', (err) => {
      this.emit('error', err);
    });

    // Wait for the agent to be ready
    await this.agent.wait(500);

    this.emit('ready');
  }

  /**
   * Send a message to the agent
   */
  async send(message: string): Promise<string> {
    if (!this.agent) throw new Error('Agent not started');

    return new Promise((resolve, reject) => {
      this.responseBuffer = '';
      this.isWaitingForResponse = true;

      // Timeout
      const timeout = setTimeout(() => {
        this.isWaitingForResponse = false;
        reject(new Error('Response timeout'));
      }, 60000);

      // Listen for prompt (end of response)
      const checkPrompt = () => {
        const pattern = this.options.promptPattern || /[❯>$#]\s*$/;
        if (pattern.test(this.responseBuffer)) {
          clearTimeout(timeout);
          this.isWaitingForResponse = false;

          // Clean the response (remove prompt)
          const response = this.responseBuffer
            .replace(pattern, '')
            .trim();

          resolve(response);
        }
      };

      this.on('output', checkPrompt);

      // Send the message
      this.agent!.sendLine(message);
    });
  }

  /**
   * Handle output
   */
  private handleOutput(text: string): void {
    if (this.isWaitingForResponse) {
      this.responseBuffer += text;
    }
    this.emit('output', text);
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (this.agent) {
      await this.agent.dispose();
      this.agent = null;
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Usage example
// ════════════════════════════════════════════════════════════════════

async function example() {
  console.log('Starting bridge...\n');

  // Create the bridge for Claude
  const bridge = new AgentBridge({
    command: 'claude',
    args: ['--model', 'claude-sonnet-4-20250514'],
    logFile: 'session.log',
    promptPattern: /[❯>]\s*$/,
  });

  bridge.on('ready', () => {
    console.log('Bridge ready!\n');
  });

  bridge.on('output', (text) => {
    process.stdout.write(text);
  });

  bridge.on('error', (err) => {
    console.error('Error:', err.message);
  });

  // Start
  await bridge.start();

  // Simulate messages
  const questions = [
    "What is ptyx?",
    "Give me a code example.",
  ];

  for (const q of questions) {
    console.log(`\n\n>>> Sending: "${q}"\n`);

    try {
      const response = await bridge.send(q);
      console.log('\n<<< Response received (', response.length, 'chars)');
    } catch (err) {
      console.error('Error:', err);
    }
  }

  // Stop
  await bridge.stop();
  console.log('\n\nBridge stopped');
}

// ════════════════════════════════════════════════════════════════════
// Factory functions
// ════════════════════════════════════════════════════════════════════

/**
 * Create a Claude agent
 */
export async function createClaudeAgent(options?: {
  model?: string;
  logFile?: string;
}) {
  return new AgentBridge({
    command: process.env.CLAUDE_PATH || 'claude',
    args: options?.model ? ['--model', options.model] : [],
    logFile: options?.logFile,
    promptPattern: /[❯>]\s*$/,
  });
}

/**
 * Create a Python agent
 */
export async function createPythonAgent(script?: string) {
  return new AgentBridge({
    command: 'python3',
    args: script ? [script] : ['-i'],
    promptPattern: /^>>>\s*$/m,
  });
}

/**
 * Create a Shell agent
 */
export async function createShellAgent() {
  return new AgentBridge({
    command: process.env.SHELL || '/bin/bash',
    args: [],
    promptPattern: /[$#]\s*$/,
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}
