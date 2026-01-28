/**
 * ptyx - Advanced Features Examples
 *
 * New features:
 * - Session recording/playback
 * - Streams API
 * - Agent Pool
 * - WebSocket Server
 * - Metrics & Audit
 * - Terminal detection/emulation
 * - Enhanced API (expect, waitForAll, sendKeys)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 1: Session Recording & Playback
// ═══════════════════════════════════════════════════════════════════════════════

import {
  createAgent,
  SessionRecorder,
  SessionPlayer,
  createSessionRecorder,
} from 'ptyx';

async function sessionRecordingExample() {
  console.log('=== Session Recording ===\n');

  // Create recorder middleware
  const { middleware, getRecorder, hasRecorder } = createSessionRecorder();

  const agent = await createAgent({
    command: 'node',
    args: ['-e', 'console.log("Hello"); console.log("World");'],
    middleware: [middleware],
  });

  // Wait for process to complete
  await new Promise(resolve => agent.once('exit', resolve));

  // Get the recorder and export
  if (hasRecorder()) {
    const recorder = getRecorder();
    recorder.end();

    // Export as JSON
    const json = recorder.export('json');
    console.log('Session JSON:', json.slice(0, 200) + '...');

    // Export as asciinema format
    const asciinema = recorder.export('asciinema');
    console.log('\nAsciinema format:', asciinema.slice(0, 200) + '...');

    // Replay the session
    console.log('\n=== Replaying Session ===\n');
    const player = SessionPlayer.fromData(recorder.getData());
    await player.play((data) => {
      process.stdout.write(`[replay] ${data}`);
    }, { skipDelays: true });
  }

  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 2: Streams API
// ═══════════════════════════════════════════════════════════════════════════════

import {
  createReadStream,
  createWriteStream,
  createDuplexStream,
  collectOutput,
} from 'ptyx';

async function streamsExample() {
  console.log('=== Streams API ===\n');

  const agent = await createAgent({
    command: 'node',
    args: ['-i'],
  });

  // Create streams
  const readable = createReadStream(agent, { raw: false });
  const writable = createWriteStream(agent, { addNewline: true });

  // Pipe output to console
  readable.on('data', (chunk) => {
    console.log('[stream]', chunk.toString().trim());
  });

  // Write through stream
  writable.write('console.log("Via stream!")');

  await agent.wait(500);

  // Collect all output
  const output = await collectOutput(agent, { timeout: 1000 });
  console.log('\nCollected output:', output.slice(0, 100));

  agent.sendLine('.exit');
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 3: Agent Pool
// ═══════════════════════════════════════════════════════════════════════════════

import { AgentPool, createAgentPool } from 'ptyx';

async function poolExample() {
  console.log('=== Agent Pool ===\n');

  // Create a pool of Node REPL agents
  const pool = createAgentPool({
    maxAgents: 3,
    minIdle: 1,
    agentConfig: {
      command: 'node',
      args: ['-e', 'setTimeout(() => {}, 60000)'],
    },
    acquireTimeout: 5000,
    idleTimeout: 30000,
    validate: async (agent) => agent.running,
  });

  // Warmup pool
  await pool.warmup(2);
  console.log(`Pool warmed up: ${pool.size} agents, ${pool.available} available`);

  // Acquire agents
  const agent1 = await pool.acquire();
  console.log(`Acquired agent: ${agent1.id}`);

  const agent2 = await pool.acquire();
  console.log(`Acquired agent: ${agent2.id}`);

  console.log(`Pool status: ${pool.inUse} in use, ${pool.available} available`);

  // Release agents back to pool
  pool.release(agent1);
  pool.release(agent2);
  console.log(`Released. Available: ${pool.available}`);

  // Get stats
  const stats = pool.stats;
  console.log('Pool stats:', stats);

  // Destroy pool
  await pool.destroy();
  console.log('Pool destroyed');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 4: WebSocket Server
// ═══════════════════════════════════════════════════════════════════════════════

import { PtyServer, createServer } from 'ptyx';

async function serverExample() {
  console.log('=== WebSocket Server ===\n');

  const server = createServer({
    port: 8080,
    host: 'localhost',
    agentConfig: {
      command: process.platform === 'win32' ? 'cmd.exe' : 'bash',
    },
    authenticate: (req) => {
      // Simple auth check
      return req.headers['authorization'] === 'Bearer secret';
    },
    maxConnections: 10,
    maxConnectionsPerIP: 2,
  });

  server.on('listening', (port) => {
    console.log(`Terminal server listening on ws://localhost:${port}`);
  });

  server.on('connection', (id) => {
    console.log(`Client connected: ${id}`);
  });

  server.on('disconnect', (id) => {
    console.log(`Client disconnected: ${id}`);
  });

  await server.start();

  console.log(`\nConnect with:
  wscat -c ws://localhost:8080 -H "Authorization: Bearer secret"

  Send JSON: {"type":"input","data":"echo hello\\n"}
  Resize: {"type":"resize","cols":120,"rows":40}
  `);

  // Keep server running for 30 seconds
  await new Promise(resolve => setTimeout(resolve, 30000));
  await server.stop();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 5: Metrics & Audit
// ═══════════════════════════════════════════════════════════════════════════════

import { metrics, audit } from 'ptyx';

async function metricsExample() {
  console.log('=== Metrics & Audit ===\n');

  // Create metrics middleware
  const met = metrics({
    trackLatency: true,
    maxLatencySamples: 100,
    onUpdate: (data) => {
      // Called on every message
    },
  });

  // Create audit middleware
  const auditLog: any[] = [];
  const aud = audit({
    writer: (entry) => {
      auditLog.push(entry);
    },
    includeMeta: true,
  });

  const agent = await createAgent({
    command: 'node',
    args: ['-e', 'console.log("test1"); console.log("test2"); console.log("test3");'],
    middleware: [met, aud],
  });

  await new Promise(resolve => agent.once('exit', resolve));

  // Get metrics
  const data = met.getMetrics();
  console.log('Metrics:');
  console.log('  Messages In:', data.messagesIn);
  console.log('  Messages Out:', data.messagesOut);
  console.log('  Bytes In:', data.bytesIn);
  console.log('  Bytes Out:', data.bytesOut);
  console.log('  Avg Latency:', data.latencies.length > 0
    ? (data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length).toFixed(2) + 'ms'
    : 'N/A');

  console.log('\nAudit Log:');
  auditLog.forEach(entry => {
    console.log(`  [${entry.timestamp}] ${entry.direction} ${entry.dataLength} bytes (hash: ${entry.dataHash})`);
  });

  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 6: Terminal Detection & Emulation
// ═══════════════════════════════════════════════════════════════════════════════

import {
  detectTerminal,
  detectProfile,
  createTerminalEmulator,
  applyTerminalEnv,
  TerminalProfiles,
  getCapabilities,
} from 'ptyx';

async function terminalExample() {
  console.log('=== Terminal Detection ===\n');

  // Detect current terminal
  const info = detectTerminal();
  console.log('Current terminal:');
  console.log('  Platform:', info.platform);
  console.log('  Program:', info.program);
  console.log('  VS Code:', info.isVSCode);
  console.log('  Windows Terminal:', info.isWindowsTerminal);
  console.log('  iTerm2:', info.isITerm);
  console.log('  SSH:', info.isSSH);
  console.log('  TTY:', info.isTTY);
  console.log('  True Color:', info.trueColor);

  // Get matched profile
  const profile = detectProfile();
  console.log('\nMatched profile:', profile?.name || 'None');

  // Get capabilities
  const caps = getCapabilities();
  console.log('\nCapabilities:');
  console.log('  Colors:', caps.colors);
  console.log('  Mouse:', caps.mouse);
  console.log('  Sixel:', caps.sixel);

  console.log('\n=== Terminal Emulation ===\n');

  // Create emulator to simulate VS Code
  const emulator = createTerminalEmulator({
    profile: 'vscode',
    respondToQueries: true,
    size: { cols: 120, rows: 30 },
  });

  console.log('Emulating:', emulator.getProfile().name);
  console.log('Environment vars:', Object.keys(emulator.getEnv()).join(', '));

  // Use emulator as middleware
  const agent = await createAgent({
    command: 'node',
    args: ['-e', 'console.log(process.env.TERM_PROGRAM)'],
    middleware: [emulator],
  });

  await new Promise(resolve => agent.once('exit', resolve));
  await agent.dispose();

  console.log('\nAvailable profiles:');
  Object.keys(TerminalProfiles).forEach(name => {
    console.log(`  - ${name}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMPLE 7: Enhanced API (expect, waitForAll, sendKeys, healthcheck)
// ═══════════════════════════════════════════════════════════════════════════════

async function enhancedApiExample() {
  console.log('=== Enhanced API ===\n');

  const agent = await createAgent({
    command: 'node',
    args: ['-i'],
  });

  // Wait for REPL to be ready
  await agent.wait(500);

  // healthcheck
  const health = await agent.healthcheck();
  console.log('Health check:');
  console.log('  Healthy:', health.healthy);
  console.log('  Running:', health.running);
  console.log('  PID:', health.pid);
  console.log('  Uptime:', health.uptime + 'ms');

  // sendKeys - send special keys
  console.log('\nSending Ctrl+L to clear...');
  agent.sendKeys(['ctrl+l']);

  // send expression and use expect() for detailed match
  agent.sendLine('const x = "PREFIX_match_SUFFIX"');
  agent.sendLine('x');

  const result = await agent.expect(/match/, { timeout: 2000 });
  console.log('\nExpect result:');
  console.log('  Match:', result.match?.[0]);
  console.log('  Before:', result.before);
  console.log('  After:', result.after);

  // sendSecret - won't be logged
  agent.sendSecret('const secret = "password123"');

  // Check history - secret should be redacted
  const secretMsg = agent.history.find(m => m.meta.secret);
  console.log('\nSecret in history:', secretMsg?.raw); // Should be [REDACTED]

  agent.sendLine('.exit');
  await agent.dispose();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run examples
// ═══════════════════════════════════════════════════════════════════════════════

const examples: Record<string, () => Promise<void>> = {
  session: sessionRecordingExample,
  streams: streamsExample,
  pool: poolExample,
  server: serverExample,
  metrics: metricsExample,
  terminal: terminalExample,
  enhanced: enhancedApiExample,
};

const example = process.argv[2] || 'terminal';

if (examples[example]) {
  console.log(`\n>>> Running: ${example}\n`);
  examples[example]()
    .then(() => console.log('\n>>> Done'))
    .catch(console.error);
} else {
  console.log(`
Advanced Features Examples:

  npx ts-node advanced-features.ts session   - Session recording/playback
  npx ts-node advanced-features.ts streams   - Streams API
  npx ts-node advanced-features.ts pool      - Agent pool
  npx ts-node advanced-features.ts server    - WebSocket server
  npx ts-node advanced-features.ts metrics   - Metrics & audit
  npx ts-node advanced-features.ts terminal  - Terminal detection/emulation
  npx ts-node advanced-features.ts enhanced  - Enhanced API
`);
}
