import {
    isPackageTooNew,
    type CliOptions, type PackageReport, type TransitiveVulnReport, type Vulnerability, type TyposquattingReport,
} from '../domain/entities';
import type { SentinelConfig } from '../domain/config';
import type {
    IScanner, IFileSystemReader, IVersionResolver, INpmClient, IOsvClient,
} from '../domain/repositories';
import { TyposquattingService } from './services/TyposquattingService';
import type { IPopularPackagesStore } from '../domain/repositories';

export interface ScanResult {
    reports: PackageReport[];
    transitiveVulns: TransitiveVulnReport[];
    totalTransitiveCount: number;
    elapsedMs: number;
    typosquattingReports: TyposquattingReport[];
}

export class ScanProjectUseCase {
    private typosquattingService: TyposquattingService;

    constructor(
        private scanner: IScanner,
        private fileReader: IFileSystemReader,
        private versionResolver: IVersionResolver,
        private npmClient: INpmClient,
        private osvClient: IOsvClient,
        private config: SentinelConfig,
        private popularPackagesStore?: IPopularPackagesStore,
    ) {
        // Initialize typosquatting service if store is provided
        if (this.popularPackagesStore) {
            this.typosquattingService = new TyposquattingService(
                this.popularPackagesStore,
                this.config.typosquatting
            );
        }
    }

    async execute(options: CliOptions): Promise<ScanResult> {
        const startTime = Date.now();

        const globPattern = `{${this.config.scanPatterns.join(',')}}`;
        const usedDeps = await this.scanner.scan(globPattern, this.config.ignorePatterns);

        const declaredDeps = await this.fileReader.getDeclaredDependencies();

        // Run typosquatting detection in parallel with npm metadata fetching
        const effectiveConcurrency = options.concurrency ?? this.config.concurrency;
        const metadataPromise = this.npmClient.fetchAll(usedDeps, effectiveConcurrency);
        const typosquattingPromise = this.typosquattingService
            ? this.typosquattingService.detect(usedDeps)
            : Promise.resolve([]);

        const [metadataResults, typosquattingReports] = await Promise.all([
            metadataPromise,
            typosquattingPromise,
        ]);

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
                    vulnerabilities: [], isTooNew: isPackageTooNew(meta.createdAt, this.config.newPackageThresholdHours),
                });
                osvEntries.push({ name, version: installedVersion });
            }
        }

        const lock = await this.fileReader.getPackageLock();
        const allTransitive: typeof osvEntries = [];
        let transitiveVulns: TransitiveVulnReport[] = [];
        const directPkgs = new Set([...usedDeps, ...declaredDeps]);

        if (options.deepScan) {
            const effectiveIncludeDev = options.includeDev ?? this.config.includeDev;
            for (const [key, entry] of lock.entries()) {
                if (!key) continue;
                const pkgName = key.replace('node_modules/', '');
                if (directPkgs.has(pkgName)) continue;
                if (entry.dev && !effectiveIncludeDev) continue;
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
            typosquattingReports,
        };
    }
}
