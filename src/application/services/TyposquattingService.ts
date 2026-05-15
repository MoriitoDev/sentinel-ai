import type { TyposquattingReport } from '../../domain/entities';
import { detectTyposquatting } from '../../domain/entities';
import type { IPopularPackagesStore } from '../domain/repositories';
import type { TyposquattingConfig } from '../domain/config';

export interface TyposquattingServiceConfig extends TyposquattingConfig {
    refreshCache?: boolean;
}

export class TyposquattingService {
    private store: IPopularPackagesStore;
    private config: TyposquattingServiceConfig;
    private popularPackages: string[] | null = null;

    constructor(store: IPopularPackagesStore, config: TyposquattingServiceConfig) {
        this.store = store;
        this.config = config;
    }

    async detect(packageNames: string[]): Promise<TyposquattingReport[]> {
        if (!this.config.enabled) {
            return [];
        }

        // Load popular packages (from cache or API)
        if (!this.popularPackages) {
            this.popularPackages = await this.store.getPopularPackages(this.config.refreshCache);
        }

        // If we couldn't load popular packages, return empty
        if (!this.popularPackages || this.popularPackages.length === 0) {
            return [];
        }

        const reports: TyposquattingReport[] = [];

        for (const name of packageNames) {
            // Skip packages that are too short
            if (name.length < this.config.minPackageLength) {
                continue;
            }

            // Skip scoped packages with very short names after the scope
            if (name.startsWith('@')) {
                const parts = name.split('/');
                if (parts.length >= 2 && parts[1].length < this.config.minPackageLength) {
                    continue;
                }
            }

            // Detect typosquatting
            const report = detectTyposquatting(name, this.popularPackages, this.config.threshold);
            
            if (report) {
                reports.push(report);
            }
        }

        return reports;
    }

    /**
     * Clear the cached popular packages to force a refresh on next detect()
     */
    clearCache(): void {
        this.popularPackages = null;
    }
}
