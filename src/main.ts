import { parseCliArgs } from './cli/CliParser';
import { printReport } from './cli/AnsiFormatter';
import { ScanProjectUseCase } from './application/ScanProjectUseCase';
import { SwcScanner } from './infrastructure/SwcScanner';
import { FileSystemReader } from './infrastructure/FileSystemReader';
import { VersionResolver } from './infrastructure/VersionResolver';
import { NpmHttpClient } from './infrastructure/NpmHttpClient';
import { OsvHttpClient } from './infrastructure/OsvHttpClient';

const options = parseCliArgs(process.argv.slice(2));

const modeLabel = options.deepScan ? 'deep mode' : 'standard mode';
const flags = [`concurrency=${options.concurrency}`];
if (options.deepScan && options.includeDev) flags.push('dev-transitive=on');
process.stdout.write(`Scanning source files (${modeLabel}, ${flags.join(', ')}) \u2026 `);

const scanner = new SwcScanner();
const fileReader = new FileSystemReader();
const versionResolver = new VersionResolver(fileReader);
const npmClient = new NpmHttpClient();
const osvClient = new OsvHttpClient();

const useCase = new ScanProjectUseCase(
    scanner,
    fileReader,
    versionResolver,
    npmClient,
    osvClient,
);

useCase.execute(options).then(result => {
    const total = result.reports.length + result.totalTransitiveCount;
    process.stdout.write(`${total} packages scanned.\n`);
    printReport(result, options);
});
