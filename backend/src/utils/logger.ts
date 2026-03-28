type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel: number =
  LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVELS.info;

function write(level: Level, data: Record<string, unknown>, message: string): void {
  if (LEVELS[level] > currentLevel) return;

  const entry = JSON.stringify({
    ts:  new Date().toISOString(),
    level,
    msg: message,
    ...data,
  });

  if (level === 'error' || level === 'warn') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export const logger = {
  error: (data: Record<string, unknown>, msg: string) => write('error', data, msg),
  warn:  (data: Record<string, unknown>, msg: string) => write('warn',  data, msg),
  info:  (data: Record<string, unknown>, msg: string) => write('info',  data, msg),
  debug: (data: Record<string, unknown>, msg: string) => write('debug', data, msg),
};
