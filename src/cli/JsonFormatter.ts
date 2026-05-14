import type { ScanResult } from '../application/ScanProjectUseCase';
import type { CliOptions } from '../domain/entities';

export function formatJsonReport(result: ScanResult, options: CliOptions): string {
    const { reports, transitiveVulns, totalTransitiveCount, elapsedMs } = result;
    const hallucinated = reports.filter(r => r.isHallucination);
    const shadow = reports.filter(r => !r.isDeclared && !r.isHallucination);
    const withVulns = reports.filter(r => r.isDeclared && !r.isHallucination && r.vulnerabilities.length > 0);

    return JSON.stringify({
        timestamp: new Date().toISOString(),
        mode: options.deepScan ? 'deep' : 'standard',
        elapsedMs,
        summary: {
            totalPackages: reports.length + totalTransitiveCount,
            hallucinations: hallucinated.length,
            shadowCode: shadow.length,
            vulnerabilities: withVulns.reduce((acc, r) => acc + r.vulnerabilities.length, 0),
            transitiveVulnerabilities: transitiveVulns.length,
        },
        reports: reports.map(r => ({
            name: r.name,
            isDeclared: r.isDeclared,
            isHallucination: r.isHallucination,
            installedVersion: r.installedVersion,
            isTooNew: r.isTooNew,
            vulnerabilities: r.vulnerabilities.map(v => ({
                id: v.id,
                aliases: v.aliases,
                summary: v.summary,
                severity: v.database_specific?.severity || v.severity,
            })),
        })),
        transitiveVulnerabilities: transitiveVulns.map(tv => ({
            name: tv.name,
            version: tv.version,
            origin: tv.origin,
            parents: tv.parents,
            vulnerabilities: tv.vulnerabilities.map(v => ({
                id: v.id,
                aliases: v.aliases,
                summary: v.summary,
                severity: v.database_specific?.severity || v.severity,
            })),
        })),
    }, null, 2);
}
