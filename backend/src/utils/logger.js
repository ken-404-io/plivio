/**
 * Structured JSON logger.
 * Writes to stdout (info/debug) and stderr (warn/error).
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function write(level, data, message) {
  if (LEVELS[level] > currentLevel) return;

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(data && typeof data === 'object' ? data : {}),
  });

  if (level === 'error' || level === 'warn') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export const logger = {
  error: (data, msg) => write('error', data, msg),
  warn:  (data, msg) => write('warn',  data, msg),
  info:  (data, msg) => write('info',  data, msg),
  debug: (data, msg) => write('debug', data, msg),
};
