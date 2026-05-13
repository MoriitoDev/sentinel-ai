import type { CliOptions } from '../domain/entities';

export function parseCliArgs(args: string[]): CliOptions {
    const concurrencyIdx = args.findIndex(a => a === '--concurrency' || a === '-c');
    return {
        deepScan: args.includes('--deep') || args.includes('-d'),
        concurrency: concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : 5,
        includeDev: args.includes('--include-dev') || args.includes('-i'),
    };
}
