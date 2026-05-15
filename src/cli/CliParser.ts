import type { CliOptions } from '../domain/entities';

export interface ExtendedCliOptions extends CliOptions {
    typosquattingThreshold?: number;
    refreshPopularPackages?: boolean;
}

export function parseCliArgs(args: string[]): ExtendedCliOptions {
    const concurrencyIdx = args.findIndex(a => a === '--concurrency' || a === '-c');
    const formatIdx = args.findIndex(a => a === '--format' || a === '-f');
    const outputIdx = args.findIndex(a => a === '--output' || a === '-o');
    const typosquattingIdx = args.findIndex(a => a === '--typosquatting-threshold');
    
    let typosquattingThreshold: number | undefined;
    if (typosquattingIdx !== -1) {
        const value = parseFloat(args[typosquattingIdx + 1]);
        if (!isNaN(value) && value >= 0 && value <= 1) {
            typosquattingThreshold = value;
        }
    }
    
    return {
        deepScan: args.includes('--deep') || args.includes('-d'),
        concurrency: concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1], 10) : undefined,
        includeDev: args.includes('--include-dev') || args.includes('-i') || undefined,
        verbose: args.includes('--verbose') || args.includes('-v'),
        format: formatIdx !== -1 ? args[formatIdx + 1] as 'text' | 'json' : undefined,
        outputFile: outputIdx !== -1 ? args[outputIdx + 1] : undefined,
        typosquattingThreshold,
        refreshPopularPackages: args.includes('--refresh-popular-packages'),
    };
}
