export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  constructor(
    private level: LogLevel = 'info',
  ) {}

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  debug(msg: string): void {
    if (this.shouldLog('debug')) console.error(`[DEBUG] ${msg}`);
  }

  info(msg: string): void {
    if (this.shouldLog('info')) console.error(`[INFO] ${msg}`);
  }

  warn(msg: string): void {
    if (this.shouldLog('warn')) console.warn(`[WARN] ${msg}`);
  }

  error(msg: string, cause?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${msg}`);
      if (cause) console.error(cause);
    }
  }
}
