import type { CliOptions } from '../domain/entities';

export function parseCliArgs(args: string[]): CliOptions {
    const concurrencyIdx = args.findIndex(a => a === '--concurrency' || a === '-c');
    const formatIdx = args.findIndex(a => a === '--format' || a === '-f');
    const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
    return {
        deepScan: args.includes('--deep') || args.includes('-d'),
        concurrency: concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : undefined,
        includeDev: args.includes('--include-dev') || args.includes('-i') || undefined,
        verbose: args.includes('--verbose') || args.includes('-v'),
        format: formatIdx !== -1 ? args[formatIdx + 1] as 'text' | 'json' : undefined,
        outputFile: outputIdx !== -1 ? args[outputIdx + 1] : undefined,
    };
}
