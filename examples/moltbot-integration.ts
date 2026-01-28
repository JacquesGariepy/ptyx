/**
 * Intégration moltbot avec pty-agent
 * 
 * Ce fichier montre comment moltbot peut contrôler Claude CLI
 * (ou n'importe quel autre CLI) via pty-agent.
 */

import { createAgent, claude, middleware, fileLogger } from 'pty-agent';
import { EventEmitter } from 'node:events';

// ════════════════════════════════════════════════════════════════════
// Bridge: Classe qui fait le pont entre moltbot et pty-agent
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
   * Démarrer l'agent
   */
  async start(): Promise<void> {
    this.agent = await createAgent({
      command: this.options.command,
      args: this.options.args || [],
      autoRestart: true,
      maxRestarts: 5,
    });
    
    // Logging optionnel
    if (this.options.logFile) {
      this.agent.use(fileLogger({
        path: this.options.logFile,
        append: true,
      }));
    }
    
    // Écouter les messages sortants
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
    
    // Attendre que l'agent soit prêt
    await this.agent.wait(500);
    
    this.emit('ready');
  }
  
  /**
   * Envoyer un message à l'agent
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
      
      // Écouter pour le prompt (fin de réponse)
      const checkPrompt = () => {
        const pattern = this.options.promptPattern || /[❯>$#]\s*$/;
        if (pattern.test(this.responseBuffer)) {
          clearTimeout(timeout);
          this.isWaitingForResponse = false;
          
          // Nettoyer la réponse (retirer le prompt)
          const response = this.responseBuffer
            .replace(pattern, '')
            .trim();
          
          resolve(response);
        }
      };
      
      this.on('output', checkPrompt);
      
      // Envoyer le message
      this.agent!.sendLine(message);
    });
  }
  
  /**
   * Gérer la sortie
   */
  private handleOutput(text: string): void {
    if (this.isWaitingForResponse) {
      this.responseBuffer += text;
    }
    this.emit('output', text);
  }
  
  /**
   * Arrêter l'agent
   */
  async stop(): Promise<void> {
    if (this.agent) {
      await this.agent.dispose();
      this.agent = null;
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Exemple d'utilisation dans moltbot
// ════════════════════════════════════════════════════════════════════

async function moltbotExample() {
  console.log('🤖 Démarrage du bridge moltbot <-> Claude...\n');
  
  // Créer le bridge pour Claude
  const bridge = new AgentBridge({
    command: 'claude',
    args: ['--model', 'claude-sonnet-4-20250514'],
    logFile: 'moltbot-session.log',
    promptPattern: /[❯>]\s*$/,
  });
  
  bridge.on('ready', () => {
    console.log('✅ Bridge prêt!\n');
  });
  
  bridge.on('output', (text) => {
    process.stdout.write(text);
  });
  
  bridge.on('error', (err) => {
    console.error('❌ Erreur:', err.message);
  });
  
  // Démarrer
  await bridge.start();
  
  // Simuler des messages de moltbot
  const questions = [
    "Qu'est-ce que pty-agent?",
    "Donne-moi un exemple de code.",
  ];
  
  for (const q of questions) {
    console.log(`\n\n>>> moltbot envoie: "${q}"\n`);
    
    try {
      const response = await bridge.send(q);
      console.log('\n<<< Réponse reçue (', response.length, 'chars)');
    } catch (err) {
      console.error('Erreur:', err);
    }
  }
  
  // Arrêter
  await bridge.stop();
  console.log('\n\n🛑 Bridge arrêté');
}

// ════════════════════════════════════════════════════════════════════
// Factory functions pour moltbot
// ════════════════════════════════════════════════════════════════════

/**
 * Créer un agent Claude pour moltbot
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
 * Créer un agent Python pour moltbot
 */
export async function createPythonAgent(script?: string) {
  return new AgentBridge({
    command: 'python3',
    args: script ? [script] : ['-i'],
    promptPattern: /^>>>\s*$/m,
  });
}

/**
 * Créer un agent Shell pour moltbot
 */
export async function createShellAgent() {
  return new AgentBridge({
    command: process.env.SHELL || '/bin/bash',
    args: [],
    promptPattern: /[$#]\s*$/,
  });
}

// Run si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  moltbotExample().catch(console.error);
}
