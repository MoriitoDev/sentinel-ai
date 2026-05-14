import { loadConfig } from './domain/config';
import { parseCliArgs } from './cli/CliParser';
import { printReport } from './cli/AnsiFormatter';
import { formatJsonReport } from './cli/JsonFormatter';
import { formatTextReport } from './cli/TextFormatter';
import { createContainer } from './container';
import { writeFileSync } from 'node:fs';

const fileConfig = loadConfig();
const cliArgs = parseCliArgs(process.argv.slice(2));

const container = createContainer(fileConfig);

const options = {
    deepScan: cliArgs.deepScan,
    concurrency: cliArgs.concurrency ?? fileConfig.concurrency,
    includeDev: cliArgs.includeDev ?? fileConfig.includeDev,
    verbose: cliArgs.verbose ?? false,
    format: cliArgs.format ?? fileConfig.outputFormat,
    outputFile: cliArgs.outputFile ?? fileConfig.outputFile,
};

const modeLabel = options.deepScan ? 'deep mode' : 'standard mode';
const flags = [`concurrency=${options.concurrency}`];
if (options.deepScan && options.includeDev) flags.push('dev-transitive=on');
process.stdout.write(`Scanning source files (${modeLabel}, ${flags.join(', ')}) \u2026 `);

container.scanUseCase.execute(options).then(result => {
    const total = result.reports.length + result.totalTransitiveCount;
    process.stdout.write(`${total} packages scanned.\n`);

    const isJson = options.format === 'json';

    if (isJson) {
        const json = formatJsonReport(result, options);
        console.log(json);
        if (options.outputFile) {
            writeFileSync(options.outputFile, json, 'utf-8');
            console.error(`Report saved to ${options.outputFile}`);
        }
    } else {
        printReport(result, options);
        if (options.outputFile) {
            const plain = formatTextReport(result, options);
            writeFileSync(options.outputFile, plain, 'utf-8');
            console.error(`Report saved to ${options.outputFile}`);
        }
    }
});
