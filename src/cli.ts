#!/usr/bin/env node
/**
 * ptyx CLI
 *
 * Transparent PTY wrapper for any command.
 *
 * Usage:
 *   ptyx <command> [args...]
 *   ptyx --adapter ./my-adapter.js my-cli --flag
 *   ptyx --builtins claude --model opus
 *
 * Environment:
 *   PTYX_DEBUG=1       Enable debug output
 *   PTYX_LOG=file      Log all I/O to file
 *   PTYX_ADAPTERS=...  Comma-separated adapter plugins to load
 */

import { PtyAgent } from './agent.js';
import { loadAdapterPlugin, loadAdapterPlugins, findAdapter } from './adapters.js';
import { fileLogger, logger } from './middleware.js';
import { getTerminalSize } from './utils.js';
import { createLogger } from './logger.js';

// CLI logger
const log = createLogger('cli');

const args = process.argv.slice(2);

// Show help
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  log.print(`
ptyx - Transparent PTY wrapper with plugin adapters

Usage:
  ptyx [options] <command> [args...]

Options:
  --adapter <path>   Load adapter from file or npm package
  --adapters <list>  Load multiple adapters (comma-separated)
  --builtins         Load all builtin adapters (AI + REPL: claude, q, copilot, gemini, node, python, bash, etc.)
  -h, --help         Show this help
  -v, --version      Show version

Examples:
  # Basic usage (no adapter)
  ptyx node -i
  ptyx python3 script.py

  # With builtin adapters
  ptyx --builtins claude --model opus

  # With custom adapter
  ptyx --adapter ./my-adapter.js my-cli --interactive

  # With npm adapter package
  ptyx --adapter ptyx-adapter-claude claude

Environment:
  PTYX_DEBUG=1       Enable debug logging to stderr
  PTYX_LOG=<file>    Log all I/O to file
  PTYX_ADAPTERS=...  Comma-separated adapter plugins to load
`);
  process.exit(0);
}

if (args[0] === '--version' || args[0] === '-v') {
  log.print('1.0.0');
  process.exit(0);
}

// Parse options
let loadBuiltins = false;
const adapterPaths: string[] = [];
let commandStartIdx = 0;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--builtins') {
    loadBuiltins = true;
    commandStartIdx = i + 1;
  } else if (arg === '--adapter' && args[i + 1]) {
    adapterPaths.push(args[i + 1]);
    i++; // Skip next arg
    commandStartIdx = i + 1;
  } else if (arg === '--adapters' && args[i + 1]) {
    adapterPaths.push(...args[i + 1].split(',').map(s => s.trim()));
    i++; // Skip next arg
    commandStartIdx = i + 1;
  } else if (!arg.startsWith('--')) {
    // First non-option is the command
    commandStartIdx = i;
    break;
  }
}

// Add adapters from environment
if (process.env.PTYX_ADAPTERS) {
  adapterPaths.push(...process.env.PTYX_ADAPTERS.split(',').map(s => s.trim()));
}

// Get command and args
const command = args[commandStartIdx];
const cmdArgs = args.slice(commandStartIdx + 1);

if (!command) {
  log.error('No command specified');
  process.exit(1);
}

// Environment options - use centralized logger detection
const debug = log.isDebugEnabled();
const logFile = process.env.PTYX_LOG;

async function main() {
  // Load builtin adapters if requested
  if (loadBuiltins) {
    try {
      const { registerBuiltins } = await import('./adapters/index.js');
      registerBuiltins();
      log.debug('Loaded REPL adapters (node, python, bash)');
    } catch (err) {
      log.error(`Failed to load REPL adapters: ${err}`);
    }

    try {
      const { registerAiAdapters } = await import('./adapters/ai/index.js');
      registerAiAdapters();
      log.debug('Loaded AI adapters (claude, copilot, q, gemini, etc.)');
    } catch (err) {
      log.error(`Failed to load AI adapters: ${err}`);
    }
  }

  // Load adapter plugins
  if (adapterPaths.length > 0) {
    try {
      await loadAdapterPlugins(adapterPaths);
      log.debug(`Loaded adapters: ${adapterPaths.join(', ')}`);
    } catch (err) {
      log.error(`Failed to load adapters: ${err}`);
      process.exit(1);
    }
  }

  const { cols, rows } = getTerminalSize();

  // Find matching adapter
  const config: import('./types.js').AgentConfig = {
    command,
    args: cmdArgs,
    cols,
    rows,
    debug,
    env: process.env as Record<string, string>,
  };

  const adapter = findAdapter(config);

  // Apply adapter configuration
  let finalConfig: import('./types.js').AgentConfig = config;
  if (adapter.configure) {
    finalConfig = adapter.configure(config);
  }

  log.debug(`Using adapter: ${adapter.name}`);

  const agent = new PtyAgent(finalConfig);

  // Add adapter middleware
  if (adapter.middleware) {
    for (const mw of adapter.middleware()) {
      agent.use(mw);
    }
  }

  // Add debug logger
  if (debug) {
    agent.use(logger({
      input: true,
      output: true,
      logger: (dir, text) => log.debug(`${dir} ${text}`),
    }));
  }

  // Add file logger
  if (logFile) {
    agent.use(fileLogger({ path: logFile }));
  }

  // Transparent I/O passthrough
  agent.on('data', (data, direction) => {
    if (direction === 'out') {
      process.stdout.write(data);
    }
  });

  // Handle stdin
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data) => {
    agent.write(data.toString());
  });

  // Handle resize
  process.stdout.on('resize', () => {
    const { cols, rows } = getTerminalSize();
    agent.resize(cols, rows);
  });

  // Handle exit
  agent.on('exit', (code) => {
    process.exit(code);
  });

  // Handle errors gracefully
  agent.on('error', (err) => {
    log.error(`Agent error: ${err.message}`);
  });

  // Cleanup on signals
  const cleanup = async () => {
    await agent.dispose();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);

  // Start
  try {
    await agent.spawn();
  } catch (err) {
    log.error(`Failed to start: ${command}`);
    log.error(`Error: ${err}`);
    process.exit(1);
  }
}

main().catch((err) => {
  log.error(`Fatal: ${err}`);
  process.exit(1);
});
