import type { IOsvClient } from '../domain/repositories';
import type { Vulnerability } from '../domain/entities';

export class OsvHttpClient implements IOsvClient {
    async queryBatch(entries: Array<{ name: string; version: string | null }>): Promise<Map<string, Vulnerability[]>> {
        const queries = entries.map(e => ({
            package: { name: e.name, ecosystem: 'npm' },
            ...(e.version ? { version: e.version } : {}),
        }));

        try {
            const res = await fetch('https://api.osv.dev/v1/querybatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queries }),
            });
            const data = await res.json() as { results?: Array<{ vulns?: Vulnerability[] } | null> };
            const map = new Map<string, Vulnerability[]>();
            entries.forEach((e, i) => {
                const result = data.results?.[i];
                map.set(e.name, result?.vulns || []);
            });
            return map;
        } catch {
            return new Map(entries.map(e => [e.name, []]));
        }
    }
}
