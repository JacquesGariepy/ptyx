import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Core
    index: 'src/index.ts',
    adapters: 'src/adapters.ts',
    middleware: 'src/middleware.ts',
    cli: 'src/cli.ts',
    // Builtin adapters (REPL/shells)
    'adapters/builtins': 'src/adapters/index.ts',
    'adapters/node': 'src/adapters/node.ts',
    'adapters/python': 'src/adapters/python.ts',
    'adapters/bash': 'src/adapters/bash.ts',
    // AI CLI adapters
    'adapters/ai': 'src/adapters/ai/index.ts',
    'adapters/ai/claude': 'src/adapters/ai/claude.ts',
    'adapters/ai/copilot': 'src/adapters/ai/copilot.ts',
    'adapters/ai/amazonq': 'src/adapters/ai/amazonq.ts',
    'adapters/ai/gemini': 'src/adapters/ai/gemini.ts',
    'adapters/ai/ollama': 'src/adapters/ai/ollama.ts',
    'adapters/ai/aider': 'src/adapters/ai/aider.ts',
    'adapters/ai/openinterpreter': 'src/adapters/ai/openinterpreter.ts',
    'adapters/ai/llm': 'src/adapters/ai/llm.ts',
    'adapters/ai/cody': 'src/adapters/ai/cody.ts',
    'adapters/ai/cursor': 'src/adapters/ai/cursor.ts',
    'adapters/ai/chatgpt': 'src/adapters/ai/chatgpt.ts',
    'adapters/ai/codex': 'src/adapters/ai/codex.ts',
    'adapters/ai/continue': 'src/adapters/ai/continue.ts',
    'adapters/ai/goose': 'src/adapters/ai/goose.ts',
    'adapters/ai/vibeos': 'src/adapters/ai/vibeos.ts',
    'adapters/ai/opencode': 'src/adapters/ai/opencode.ts',
    'adapters/ai/mistral': 'src/adapters/ai/mistral.ts',
    'adapters/ai/perplexity': 'src/adapters/ai/perplexity.ts',
    'adapters/ai/tabby': 'src/adapters/ai/tabby.ts',
    'adapters/ai/codeium': 'src/adapters/ai/codeium.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['node-pty'],
  banner: {
    js: '/* pty-agent - Universal transparent PTY wrapper */',
  },
});
