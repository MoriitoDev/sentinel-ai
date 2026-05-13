import {
    isPackageTooNew,
    type CliOptions, type PackageReport, type TransitiveVulnReport, type Vulnerability,
} from '../domain/entities';
import type {
    IScanner, IFileSystemReader, IVersionResolver, INpmClient, IOsvClient,
} from '../domain/repositories';

export interface ScanResult {
    reports: PackageReport[];
    transitiveVulns: TransitiveVulnReport[];
    totalTransitiveCount: number;
    elapsedMs: number;
}

export class ScanProjectUseCase {
    constructor(
        private scanner: IScanner,
        private fileReader: IFileSystemReader,
        private versionResolver: IVersionResolver,
        private npmClient: INpmClient,
        private osvClient: IOsvClient,
    ) {}

    async execute(options: CliOptions): Promise<ScanResult> {
        const startTime = Date.now();

        const usedDeps = await this.scanner.scan('src/**/*.{ts,js,tsx,jsx}');

        const declaredDeps = await this.fileReader.getDeclaredDependencies();

        const metadataResults = await this.npmClient.fetchAll(usedDeps, options.concurrency);

        const reports: PackageReport[] = [];
        const osvEntries: Array<{ name: string; version: string | null }> = [];

        for (let i = 0; i < usedDeps.length; i++) {
            const name = usedDeps[i];
            const meta = metadataResults[i];
            const isDeclared = declaredDeps.has(name);

            if (meta === null) {
                reports.push({
                    name, isDeclared, isHallucination: true,
                    metadata: null, installedVersion: null,
                    vulnerabilities: [], isTooNew: false,
                });
            } else {
                const installedVersion = isDeclared
                    ? await this.versionResolver.getInstalledVersion(name)
                    : null;
                reports.push({
                    name, isDeclared, isHallucination: false,
                    metadata: meta, installedVersion,
                    vulnerabilities: [], isTooNew: isPackageTooNew(meta.createdAt),
                });
                osvEntries.push({ name, version: installedVersion });
            }
        }

        const lock = await this.fileReader.getPackageLock();
        const allTransitive: typeof osvEntries = [];
        let transitiveVulns: TransitiveVulnReport[] = [];
        const directPkgs = new Set([...usedDeps, ...declaredDeps]);

        if (options.deepScan) {
            for (const [key, entry] of lock.entries()) {
                if (!key) continue;
                const pkgName = key.replace('node_modules/', '');
                if (directPkgs.has(pkgName)) continue;
                if (entry.dev && !options.includeDev) continue;
                allTransitive.push({ name: pkgName, version: entry.version || null });
            }

            const allForOsv = [...osvEntries, ...allTransitive];
            const vulnMap = await this.osvClient.queryBatch(allForOsv);

            for (const report of reports) {
                if (!report.isHallucination) {
                    report.vulnerabilities = vulnMap.get(report.name) || [];
                }
            }

            const originMap = new Map<string, string[]>();
            for (const [key, entry] of lock.entries()) {
                if (!key) continue;
                const pkgName = key.replace('node_modules/', '');
                if (!directPkgs.has(pkgName)) continue;
                const deps = entry.dependencies;
                if (!deps) continue;
                for (const dep of Object.keys(deps)) {
                    if (!originMap.has(dep)) originMap.set(dep, []);
                    originMap.get(dep)!.push(`${pkgName}@${entry.version}`);
                }
            }

            for (const td of allTransitive) {
                const vulns = vulnMap.get(td.name) || [];
                if (vulns.length === 0) continue;
                const parents = originMap.get(td.name) || [];
                transitiveVulns.push({
                    name: td.name,
                    version: td.version || '?',
                    vulnerabilities: vulns,
                    origin: parents[0] || 'unknown',
                    parents,
                });
            }
        } else {
            if (osvEntries.length > 0) {
                const vulnMap = await this.osvClient.queryBatch(osvEntries);
                for (const report of reports) {
                    if (!report.isHallucination) {
                        report.vulnerabilities = vulnMap.get(report.name) || [];
                    }
                }
            }
        }

        return {
            reports,
            transitiveVulns,
            totalTransitiveCount: allTransitive.length,
            elapsedMs: Date.now() - startTime,
        };
    }
}
