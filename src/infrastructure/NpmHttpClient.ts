import type { INpmClient } from '../domain/repositories';
import type { PackageMetadata } from '../domain/entities';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export class NpmHttpClient implements INpmClient {
    async fetchMetadata(pkg: string, attempt = 1): Promise<PackageMetadata | null> {
        const MAX = 3;
        try {
            const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
            if (res.status === 404) return null;
            if (res.status === 429 && attempt < MAX) {
                await sleep(1000 * Math.pow(2, attempt - 1));
                return this.fetchMetadata(pkg, attempt + 1);
            }
            const data = await res.json();
            return { exists: true, createdAt: data.time?.created, latestVersion: data['dist-tags']?.latest };
        } catch {
            if (attempt < MAX) {
                await sleep(1000 * Math.pow(2, attempt - 1));
                return this.fetchMetadata(pkg, attempt + 1);
            }
            return null;
        }
    }

    async fetchAll(pkgs: string[], limit: number): Promise<Array<PackageMetadata | null>> {
        const results: Array<PackageMetadata | null> = new Array(pkgs.length);
        const indexed = pkgs.map((name, idx) => ({ name, idx }));
        for (let i = 0; i < indexed.length; i += limit) {
            const chunk = indexed.slice(i, i + limit);
            await Promise.all(chunk.map(async ({ name, idx }) => {
                results[idx] = await this.fetchMetadata(name);
            }));
        }
        return results;
    }

    async fetchPopularPackages(limit: number = 500): Promise<string[]> {
        const MAX_RETRIES = 3;
        const allPackages = new Set<string>();
        
        // Try multiple search queries to gather popular packages
        const queries = [
            'react', 'vue', 'angular', 'express', 'lodash',
            'framework', 'library', 'tool', 'cli', 'utils'
        ];
        
        for (const query of queries) {
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const res = await fetch(
                        `https://api.npms.io/v2/search?q=${encodeURIComponent(query)}&size=50`,
                        {
                            headers: {
                                'Accept': 'application/json',
                            },
                        }
                    );
                    
                    if (res.status === 429 && attempt < MAX_RETRIES) {
                        await sleep(2000 * attempt);
                        continue;
                    }
                    
                    if (!res.ok) {
                        throw new Error(`npms.io API returned ${res.status}`);
                    }
                    
                    const data = await res.json();
                    
                    if (data.results && Array.isArray(data.results)) {
                        for (const result of data.results) {
                            if (result.package?.name) {
                                allPackages.add(result.package.name);
                            }
                        }
                    }
                    
                    // Success, break retry loop
                    break;
                } catch (err) {
                    if (attempt === MAX_RETRIES) {
                        console.warn(`Warning: Failed to fetch packages for query '${query}': ${err}`);
                    }
                    await sleep(1000 * attempt);
                }
            }
            
            // Stop if we have enough packages
            if (allPackages.size >= limit) {
                break;
            }
        }
        
        return Array.from(allPackages).slice(0, limit);
    }
}
