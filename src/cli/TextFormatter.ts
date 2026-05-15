import { isMaliciousEntry, type PackageReport, type TransitiveVulnReport, type CliOptions, type TyposquattingReport } from '../domain/entities';
import type { ScanResult } from '../application/ScanProjectUseCase';

const RULER = '\u2500'.repeat(56);

export function formatTextReport(result: ScanResult, options: CliOptions): string {
    const { reports, transitiveVulns, totalTransitiveCount, elapsedMs, typosquattingReports } = result;
    const hallucinated = reports.filter(r => r.isHallucination);
    const shadow = reports.filter(r => !r.isDeclared && !r.isHallucination);
    const withVulns = reports.filter(r => r.isDeclared && !r.isHallucination && r.vulnerabilities.length > 0);
    const clean = reports.filter(r => r.isDeclared && !r.isHallucination && r.vulnerabilities.length === 0);

    const totalPkgs = reports.length + totalTransitiveCount;
    const headerLabel = options.deepScan ? 'deep mode' : 'standard mode';
    const elapsed = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`;

    const lines: string[] = [];
    lines.push(`\n${RULER}`);
    lines.push(` Sentinel Report \u2014 ${totalPkgs} packages, ${elapsed}, ${headerLabel}`);
    lines.push(`${RULER}\n`);

    if (hallucinated.length > 0) {
        lines.push(` AI HALLUCINATIONS (${hallucinated.length})`);
        for (const r of hallucinated) {
            lines.push(`   ${r.name.padEnd(24)} \u2190 not found on npm`);
        }
        lines.push('');
    }

    if (shadow.length > 0) {
        lines.push(` SHADOW CODE (${shadow.length})`);
        for (const r of shadow) {
            const mal = r.vulnerabilities.some(isMaliciousEntry) ? ' [MALICIOUS]' : '';
            const newBadge = r.isTooNew ? ' [new <72h]' : '';
            lines.push(`   ${r.name.padEnd(24)}${mal}${newBadge}`);
            const realVulns = r.vulnerabilities.filter(v => !isMaliciousEntry(v));
            if (options.deepScan && realVulns.length > 0) {
                lines.push(`   \\-- vulnerabilities: ${realVulns.length}`);
            }
        }
        lines.push('');
    }

    if (typosquattingReports.length > 0) {
        lines.push(` TYPO SQUATTING SUSPECTS (${typosquattingReports.length})`);
        for (const t of typosquattingReports) {
            const score = Math.round(t.similarityScore * 100);
            lines.push(`   ${t.name.padEnd(24)} \u2190 similar to ${t.similarTo} (${score}%)`);
        }
        lines.push('');
    }

    if (options.deepScan && withVulns.length > 0) {
        lines.push(` VULNERABILITIES \u2014 Direct (${withVulns.length})`);
        for (const r of withVulns) {
            const v = r.installedVersion ? `v${r.installedVersion}` : '?';
            lines.push(`   ${r.name.padEnd(20)} ${v}`);
            r.vulnerabilities.filter(v => !isMaliciousEntry(v)).slice(0, 5).forEach(vuln => {
                const sev = vuln.database_specific?.severity || vuln.severity || '';
                const sid = vuln.id || vuln.aliases?.[0] || '?';
                lines.push(`     ${sid}  ${sev || '?'}`);
                if (vuln.summary) lines.push(`     ${vuln.summary.slice(0, 90)}`);
            });
            const more = r.vulnerabilities.filter(v => !isMaliciousEntry(v)).length - 5;
            if (more > 0) lines.push(`     \u2026 and ${more} more`);
        }
        lines.push('');
    }

    if (options.deepScan && transitiveVulns.length > 0) {
        lines.push(` TRANSITIVE VULNERABILITIES (${transitiveVulns.length})`);
        for (const tv of transitiveVulns) {
            const fromLabel = tv.parents.length === 1
                ? `\u2190 from ${tv.origin}`
                : `\u2190 from ${tv.origin} (+${tv.parents.length - 1} more)`;
            lines.push(`   ${tv.name.padEnd(20)} v${tv.version}  ${fromLabel}`);
            tv.vulnerabilities.filter(v => !isMaliciousEntry(v)).slice(0, 5).forEach(vuln => {
                const sev = vuln.database_specific?.severity || vuln.severity || '';
                const sid = vuln.id || vuln.aliases?.[0] || '?';
                lines.push(`     ${sid}  ${sev || '?'}`);
                if (vuln.summary) lines.push(`     ${vuln.summary.slice(0, 90)}`);
            });
            const more = tv.vulnerabilities.filter(v => !isMaliciousEntry(v)).length - 5;
            if (more > 0) lines.push(`     \u2026 and ${more} more`);
        }
        lines.push('');
    }

    if (options.deepScan && clean.length > 0) {
        lines.push(` CLEAN (${clean.length})`);
        for (const r of clean) {
            const v = r.installedVersion ? `${r.installedVersion}` : '';
            lines.push(`   ${r.name.padEnd(20)} ${v ? `v${v}` : ''}`);
        }
        lines.push('');
    }

    if (!options.deepScan && hallucinated.length === 0 && shadow.length === 0) {
        lines.push(' No shadow code or hallucinations detected.\n');
    }

    lines.push(`${RULER}\n`);
    return lines.join('\n');
}
