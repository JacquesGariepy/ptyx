#!/usr/bin/env node
/**
 * pty-agent CLI
 *
 * Transparent PTY wrapper for any command.
 *
 * Usage:
 *   pty-agent <command> [args...]
 *   pty-agent --adapter ./my-adapter.js my-cli --flag
 *   pty-agent --builtins claude --model opus
 *
 * Environment:
 *   PTY_AGENT_DEBUG=1       Enable debug output
 *   PTY_AGENT_LOG=file      Log all I/O to file
 *   PTY_AGENT_ADAPTERS=...  Comma-separated adapter plugins to load
 */

import { PtyAgent } from './agent.js';
import { loadAdapterPlugin, loadAdapterPlugins, findAdapter } from './adapters.js';
import { fileLogger, logger } from './middleware.js';
import { getTerminalSize } from './utils.js';

const args = process.argv.slice(2);

// Show help
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
pty-agent - Transparent PTY wrapper with plugin adapters

Usage:
  pty-agent [options] <command> [args...]

Options:
  --adapter <path>   Load adapter from file or npm package
  --adapters <list>  Load multiple adapters (comma-separated)
  --builtins         Load all builtin adapters (claude, node, python, bash)
  -h, --help         Show this help
  -v, --version      Show version

Examples:
  # Basic usage (no adapter)
  pty-agent node -i
  pty-agent python3 script.py

  # With builtin adapters
  pty-agent --builtins claude --model opus

  # With custom adapter
  pty-agent --adapter ./my-adapter.js my-cli --interactive

  # With npm adapter package
  pty-agent --adapter pty-agent-adapter-claude claude

Environment:
  PTY_AGENT_DEBUG=1       Enable debug logging to stderr
  PTY_AGENT_LOG=<file>    Log all I/O to file
  PTY_AGENT_ADAPTERS=...  Comma-separated adapter plugins to load
`);
  process.exit(0);
}

if (args[0] === '--version' || args[0] === '-v') {
  console.log('1.0.0');
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
if (process.env.PTY_AGENT_ADAPTERS) {
  adapterPaths.push(...process.env.PTY_AGENT_ADAPTERS.split(',').map(s => s.trim()));
}

// Get command and args
const command = args[commandStartIdx];
const cmdArgs = args.slice(commandStartIdx + 1);

if (!command) {
  console.error('Error: No command specified');
  process.exit(1);
}

// Environment options
const debug = process.env.PTY_AGENT_DEBUG === '1';
const logFile = process.env.PTY_AGENT_LOG;

async function main() {
  // Load builtin adapters if requested
  if (loadBuiltins) {
    try {
      const { registerBuiltins } = await import('./adapters/index.js');
      registerBuiltins();
      if (debug) {
        console.error('[pty-agent] Loaded builtin adapters');
      }
    } catch (err) {
      console.error(`[pty-agent] Failed to load builtin adapters: ${err}`);
    }
  }

  // Load adapter plugins
  if (adapterPaths.length > 0) {
    try {
      await loadAdapterPlugins(adapterPaths);
      if (debug) {
        console.error(`[pty-agent] Loaded adapters: ${adapterPaths.join(', ')}`);
      }
    } catch (err) {
      console.error(`[pty-agent] Failed to load adapters: ${err}`);
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

  if (debug) {
    console.error(`[pty-agent] Using adapter: ${adapter.name}`);
  }

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
      logger: (dir, text) => {
        process.stderr.write(`[pty-agent] ${dir} ${text}\n`);
      },
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
    if (debug) {
      process.stderr.write(`[pty-agent error] ${err.message}\n`);
    }
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
    process.stderr.write(`Failed to start: ${command}\n`);
    process.stderr.write(`Error: ${err}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
