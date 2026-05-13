import { NpmHttpClient } from './infrastructure/NpmHttpClient';
import { OsvHttpClient } from './infrastructure/OsvHttpClient';
import { GuardUseCase, type GuardVerdict } from './guard/GuardUseCase';
import { isMaliciousEntry } from './domain/entities';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// ── ANSI colors ───────────────────────────────────────────────────────────
const c = {
    green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
    red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
    bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function verdictIcon(v: GuardVerdict): string {
    if (v.error === 'not found on npm') return c.red('\u2717');
    if (v.vulnerabilities.some(isMaliciousEntry)) return c.red('\u2622');
    if (v.vulnerabilities.length > 0) return c.yellow('\u26A0');
    if (v.isTooNew) return c.yellow('\u26A0');
    if (v.exists) return c.green('\u2713');
    return c.red('?');
}

function formatVerdict(v: GuardVerdict): string {
    const icon = verdictIcon(v);
    const label = v.requestedVersion ? `${v.name}@${v.requestedVersion}` : v.name;

    if (v.error === 'not found on npm') {
        return ` ${icon} ${c.bold(v.name)}  ${c.dim('\u2192 NOT FOUND on npm (hallucinated package)')}`;
    }
    if (v.vulnerabilities.some(isMaliciousEntry)) {
        const malCount = v.vulnerabilities.filter(isMaliciousEntry).length;
        return ` ${icon} ${c.bold(v.name)}  ${c.red(`[MALICIOUS]`)} ${c.dim(`${malCount} confirmed malware report(s)`)}`;
    }
    const parts: string[] = [];
    if (v.latestVersion) parts.push(`v${v.latestVersion}`);
    if (v.isTooNew) parts.push(c.yellow('published <72h ago'));
    if (v.vulnerabilities.length > 0) {
        const real = v.vulnerabilities.filter(x => !isMaliciousEntry(x));
        parts.push(`\u2014 ${real.length} known vulnerabilit${real.length === 1 ? 'y' : 'ies'}`);
    }
    if (parts.length === 0 && v.exists) parts.push('clean');
    if (parts.length === 0) parts.push(c.dim('built-in (Node.js)'));
    return ` ${icon} ${c.bold(v.name)}  ${c.dim(parts.join(', '))}`;
}

function hasIssues(v: GuardVerdict): boolean {
    if (v.error === 'not found on npm') return true;
    if (v.vulnerabilities.some(isMaliciousEntry)) return true;
    if (v.vulnerabilities.length > 0) return true;
    if (v.isTooNew) return true;
    return false;
}

async function main(): Promise<void> {
    const rawNames = process.argv.slice(2);
    if (rawNames.length === 0) {
        console.error('Usage: npx tsx src/guard.ts <package> [package...]');
        console.error('  Checks packages for safety before installation.');
        process.exit(1);
    }

    const npmClient = new NpmHttpClient();
    const osvClient = new OsvHttpClient();
    const useCase = new GuardUseCase(npmClient, osvClient);

    process.stdout.write(`${c.bold('sentinel guard')} ${c.dim(`\u2014 checking ${rawNames.length} package${rawNames.length === 1 ? '' : 's'}`)}\n\n`);

    const verdicts = await useCase.execute(rawNames);

    for (const v of verdicts) {
        console.log(formatVerdict(v));
    }

    const problematic = verdicts.filter(hasIssues);
    if (problematic.length === 0) {
        console.log(`\n ${c.green(c.bold('\u2713 All packages look safe \u2014 proceeding with install.'))}`);
        process.exit(0);
    }

    const bar = c.red('\u2500'.repeat(50));
    console.log(`\n${c.bold(c.red('\u250c' + bar + '\u2510'))}`);
    console.log(`${c.bold(c.red('\u2502'))}  ${c.bold('Blocked \u2014')} ${problematic.length} package${problematic.length === 1 ? '' : 's'} ha${problematic.length === 1 ? 's' : 've'} issues        ${c.bold(c.red('\u2502'))}`);
    console.log(`${c.bold(c.red('\u2502'))}  ${c.dim('Review the warnings above before proceeding.')}  ${c.bold(c.red('\u2502'))}`);
    console.log(`${c.bold(c.red('\u2514' + bar + '\u2518'))}`);

    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(`\nInstall anyway? ${c.dim('[y/N]')} `);
    rl.close();

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        console.log(` ${c.yellow('\u2192 Proceeding with install (user override).')}`);
        process.exit(0);
    }

    console.log(` ${c.dim('Cancelled.')}`);
    process.exit(1);
}

main().catch(err => {
    console.error('guard error:', err);
    process.exit(1);
});
