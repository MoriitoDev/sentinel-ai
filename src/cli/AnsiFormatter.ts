import { isMaliciousEntry, type PackageReport, type TransitiveVulnReport, type CliOptions } from '../domain/entities';
import type { ScanResult } from '../application/ScanProjectUseCase';

// ── ANSI colors ───────────────────────────────────────────────────────────
const c = {
    red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
    orange: (s: string) => `\x1b[38;5;208m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
    dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
    bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};
const RULER = '\u2500'.repeat(56);

export function printReport(result: ScanResult, options: CliOptions): void {
    const { reports, transitiveVulns, totalTransitiveCount, elapsedMs } = result;
    const hallucinated = reports.filter(r => r.isHallucination);
    const shadow       = reports.filter(r => !r.isDeclared && !r.isHallucination);
    const withVulns    = reports.filter(r => r.isDeclared && !r.isHallucination && r.vulnerabilities.length > 0);
    const clean        = reports.filter(r => r.isDeclared && !r.isHallucination && r.vulnerabilities.length === 0);

    const totalPkgs = reports.length + totalTransitiveCount;
    const headerLabel = options.deepScan ? `deep mode` : `standard mode`;
    const elapsed = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`;

    console.log(`\n${c.bold(c.yellow(RULER))}`);
    console.log(` ${c.bold('Sentinel Report')}  ${c.dim(`\u2014 ${totalPkgs} packages, ${elapsed}, ${headerLabel}`)}`);
    console.log(`${c.bold(c.yellow(RULER))}\n`);

    // 1. AI HALLUCINATIONS
    if (hallucinated.length > 0) {
        console.log(` ${c.red(c.bold(`AI HALLUCINATIONS (${hallucinated.length})`))}`);
        for (const r of hallucinated) {
            console.log(`   ${c.red(r.name.padEnd(24))} ${c.dim('\u2190 not found on npm')}`);
        }
        console.log('');
    }

    // 2. SHADOW CODE
    if (shadow.length > 0) {
        console.log(` ${c.orange(c.bold(`SHADOW CODE (${shadow.length})`))}`);
        for (const r of shadow) {
            const mal = r.vulnerabilities.some(isMaliciousEntry) ? ` ${c.red('[MALICIOUS]')}` : '';
            const newBadge = r.isTooNew ? ` ${c.yellow('[new <72h]')}` : '';
            console.log(`   ${c.orange(r.name.padEnd(24))}${mal}${newBadge}`);
            const realVulns = r.vulnerabilities.filter(v => !isMaliciousEntry(v));
            if (options.deepScan && realVulns.length > 0) {
                console.log(`   ${c.dim('  \u2514 vulnerabilities:')} ${realVulns.length}`);
            }
        }
        console.log('');
    }

    // 3. VULNERABILITIES — Direct
    if (options.deepScan && withVulns.length > 0) {
        console.log(` ${c.yellow(c.bold(`VULNERABILITIES \u2014 Direct (${withVulns.length})`))}`);
        for (const r of withVulns) {
            const v = r.installedVersion ? `v${r.installedVersion}` : '?';
            console.log(`   ${c.yellow(r.name.padEnd(20))} ${c.dim(v)}`);
            r.vulnerabilities.filter(v => !isMaliciousEntry(v)).slice(0, 5).forEach(vuln => {
                const sev  = vuln.database_specific?.severity || vuln.severity || '';
                const sid  = vuln.id || vuln.aliases?.[0] || '?';
                console.log(`     ${c.dim(sid)}  ${sev ? c.red(c.bold(sev)) : c.dim('?')}`);
                if (vuln.summary) console.log(`     ${c.dim(vuln.summary.slice(0, 90))}`);
            });
            const more = r.vulnerabilities.filter(v => !isMaliciousEntry(v)).length - 5;
            if (more > 0) console.log(`     ${c.dim(`\u2026 and ${more} more`)}`);
        }
        console.log('');
    }

    // 4. TRANSITIVE VULNERABILITIES
    if (options.deepScan && transitiveVulns.length > 0) {
        console.log(` ${c.yellow(c.bold(`TRANSITIVE VULNERABILITIES (${transitiveVulns.length})`))}`);
        for (const tv of transitiveVulns) {
            const fromLabel = tv.parents.length === 1
                ? `\u2190 from ${tv.origin}`
                : `\u2190 from ${tv.origin} (+${tv.parents.length - 1} more)`;
            console.log(`   ${c.yellow(tv.name.padEnd(20))} ${c.dim(`v${tv.version}  ${fromLabel}`)}`);
            tv.vulnerabilities.filter(v => !isMaliciousEntry(v)).slice(0, 5).forEach(vuln => {
                const sev  = vuln.database_specific?.severity || vuln.severity || '';
                const sid  = vuln.id || vuln.aliases?.[0] || '?';
                console.log(`     ${c.dim(sid)}  ${sev ? c.red(c.bold(sev)) : c.dim('?')}`);
                if (vuln.summary) console.log(`     ${c.dim(vuln.summary.slice(0, 90))}`);
            });
            const more = tv.vulnerabilities.filter(v => !isMaliciousEntry(v)).length - 5;
            if (more > 0) console.log(`     ${c.dim(`\u2026 and ${more} more`)}`);
        }
        console.log('');
    }

    // 5. CLEAN
    if (options.deepScan && clean.length > 0) {
        console.log(` ${c.green(c.bold(`CLEAN (${clean.length})`))}`);
        for (const r of clean) {
            const v = r.installedVersion ? `${r.installedVersion}` : '';
            console.log(`   ${c.green(r.name.padEnd(20))} ${c.dim(v ? `v${v}` : '')}`);
        }
        console.log('');
    }

    if (!options.deepScan && hallucinated.length === 0 && shadow.length === 0) {
        console.log(` ${c.green('No shadow code or hallucinations detected.')}\n`);
    }

    console.log(`${c.bold(c.yellow(RULER))}\n`);
}
