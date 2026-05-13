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
}
