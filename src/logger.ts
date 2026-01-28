/**
 * ptyx Logger - Centralized logging for the ptyx package
 *
 * Usage:
 *   import { createLogger, setLogLevel, LogLevel } from './logger.js';
 *   const log = createLogger('PtyAgent');
 *   log.debug('Starting agent');
 *   log.info('Connected');
 *   log.timing('Spawn time', startTime);
 *
 * Enable debug logging:
 *   PTYX_DEBUG=1 node your-script.js
 *   PTYX_LOG_LEVEL=debug node your-script.js
 *
 * Log levels (in order of verbosity):
 *   - debug: Detailed debug info (only when PTYX_DEBUG=1 or PTYX_LOG_LEVEL=debug)
 *   - info: General info (default)
 *   - warn: Warnings
 *   - error: Errors only
 *   - silent: No logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

// Global log level
let globalLogLevel: LogLevel = LogLevel.INFO;

// Check environment for debug mode
const isDebugEnabled = (): boolean => {
  return process.env.PTYX_DEBUG === '1' ||
         process.env.PTYX_DEBUG === 'true' ||
         process.env.PTYX_LOG_LEVEL === 'debug';
};

// Initialize log level from environment
if (isDebugEnabled()) {
  globalLogLevel = LogLevel.DEBUG;
} else if (process.env.PTYX_LOG_LEVEL) {
  const level = process.env.PTYX_LOG_LEVEL.toLowerCase();
  switch (level) {
    case 'debug': globalLogLevel = LogLevel.DEBUG; break;
    case 'info': globalLogLevel = LogLevel.INFO; break;
    case 'warn': globalLogLevel = LogLevel.WARN; break;
    case 'error': globalLogLevel = LogLevel.ERROR; break;
    case 'silent': globalLogLevel = LogLevel.SILENT; break;
  }
}

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  globalLogLevel = level;
}

/**
 * Get the current global log level
 */
export function getLogLevel(): LogLevel {
  return globalLogLevel;
}

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

const useColors = process.env.NO_COLOR !== '1' && process.stdout.isTTY;

/**
 * Format a log message with timestamp and prefix
 */
function formatMessage(name: string, level: string, args: unknown[]): unknown[] {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = `[ptyx:${name}:${level}]`;

  if (useColors) {
    const colorMap: Record<string, string> = {
      DEBUG: colors.dim,
      INFO: colors.cyan,
      WARN: colors.yellow,
      ERROR: colors.red,
      EVENT: colors.magenta,
      TIMING: colors.green,
    };
    const color = colorMap[level] || colors.reset;
    return [`${colors.dim}${timestamp}${colors.reset} ${color}${prefix}${colors.reset}`, ...args];
  }

  return [`${timestamp} ${prefix}`, ...args];
}

/**
 * Logger interface
 */
export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  event: (eventName: string, data?: unknown) => void;
  timing: (label: string, startTime: number) => void;
  isDebugEnabled: () => boolean;
  child: (subName: string) => Logger;
  /** Print to stdout (for user-facing output, not logging) */
  print: (...args: unknown[]) => void;
  /** Print to stderr (for user-facing errors, not logging) */
  printError: (...args: unknown[]) => void;
}

/**
 * Write formatted output to a stream
 */
function writeToStream(stream: NodeJS.WriteStream, args: unknown[]): void {
  const message = args.map(arg =>
    typeof arg === 'string' ? arg : JSON.stringify(arg)
  ).join(' ');
  stream.write(message + '\n');
}

/**
 * Create a logger instance for a component
 *
 * @param name - Name of the component (e.g., 'PtyAgent', 'Adapter:Claude')
 * @param options - Logger options
 * @returns Logger instance
 */
export function createLogger(name: string, options: { forceDebug?: boolean } = {}): Logger {
  const debugEnabled = options.forceDebug || globalLogLevel <= LogLevel.DEBUG;

  return {
    debug: (...args: unknown[]) => {
      if (globalLogLevel <= LogLevel.DEBUG) {
        writeToStream(process.stderr, formatMessage(name, 'DEBUG', args));
      }
    },

    info: (...args: unknown[]) => {
      if (globalLogLevel <= LogLevel.INFO) {
        writeToStream(process.stderr, formatMessage(name, 'INFO', args));
      }
    },

    warn: (...args: unknown[]) => {
      if (globalLogLevel <= LogLevel.WARN) {
        writeToStream(process.stderr, formatMessage(name, 'WARN', args));
      }
    },

    error: (...args: unknown[]) => {
      if (globalLogLevel <= LogLevel.ERROR) {
        writeToStream(process.stderr, formatMessage(name, 'ERROR', args));
      }
    },

    event: (eventName: string, data?: unknown) => {
      if (globalLogLevel <= LogLevel.DEBUG) {
        const dataStr = data ? JSON.stringify(data, null, 2).substring(0, 500) : '';
        writeToStream(process.stderr, formatMessage(name, 'EVENT', [eventName, dataStr]));
      }
    },

    timing: (label: string, startTime: number) => {
      if (globalLogLevel <= LogLevel.DEBUG) {
        const duration = Date.now() - startTime;
        writeToStream(process.stderr, formatMessage(name, 'TIMING', [`${label}: ${duration}ms`]));
      }
    },

    isDebugEnabled: () => debugEnabled,

    child: (subName: string) => createLogger(`${name}:${subName}`, options),

    // User-facing output (not logging)
    print: (...args: unknown[]) => {
      const message = args.map(arg =>
        typeof arg === 'string' ? arg : JSON.stringify(arg)
      ).join(' ');
      process.stdout.write(message + '\n');
    },

    printError: (...args: unknown[]) => {
      const message = args.map(arg =>
        typeof arg === 'string' ? arg : JSON.stringify(arg)
      ).join(' ');
      process.stderr.write(message + '\n');
    },
  };
}

/**
 * Default logger for the ptyx package
 */
export const defaultLogger = createLogger('core');

export default createLogger;
