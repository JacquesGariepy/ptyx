import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // Core
    index: 'src/index.ts',
    adapters: 'src/adapters.ts',
    middleware: 'src/middleware.ts',
    cli: 'src/cli.ts',
    // Builtin adapters (optional imports)
    'adapters/builtins': 'src/adapters/index.ts',
    'adapters/claude': 'src/adapters/claude.ts',
    'adapters/node': 'src/adapters/node.ts',
    'adapters/python': 'src/adapters/python.ts',
    'adapters/bash': 'src/adapters/bash.ts',
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
