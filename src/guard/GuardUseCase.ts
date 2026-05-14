import type { INpmClient, IOsvClient } from '../domain/repositories';
import type { Vulnerability } from '../domain/entities';
import { isPackageTooNew, isMaliciousEntry, isNodeBuiltin } from '../domain/entities';

export interface GuardVerdict {
    name: string;
    requestedVersion: string | null;
    exists: boolean | null;
    latestVersion: string | null;
    isTooNew: boolean;
    vulnerabilities: Vulnerability[];
    error: string | null;
}

function parsePackageSpec(raw: string): { name: string; version: string | null } {
    const atIdx = raw.lastIndexOf('@');
    const slashIdx = raw.lastIndexOf('/');
    if (atIdx > slashIdx) {
        return { name: raw.slice(0, atIdx), version: raw.slice(atIdx + 1) };
    }
    return { name: raw, version: null };
}

export class GuardUseCase {
    constructor(
        private npmClient: INpmClient,
        private osvClient: IOsvClient,
    ) {}

    async execute(rawNames: string[]): Promise<GuardVerdict[]> {
        const parsed = rawNames.map(n => ({ raw: n, ...parsePackageSpec(n) }));
        const verdicts: GuardVerdict[] = [];

        const toCheck: Array<{ name: string; version: string | null }> = [];

        for (const p of parsed) {
            if (isNodeBuiltin(p.name)) {
                verdicts.push({
                    name: p.name,
                    requestedVersion: p.version,
                    exists: true,
                    latestVersion: null,
                    isTooNew: false,
                    vulnerabilities: [],
                    error: null,
                });
                continue;
            }
            verdicts.push({
                name: p.name,
                requestedVersion: p.version,
                exists: null,
                latestVersion: null,
                isTooNew: false,
                vulnerabilities: [],
                error: null,
            });
            toCheck.push({ name: p.name, version: p.version });
        }

        const metadatas = await this.npmClient.fetchAll(
            toCheck.map(e => e.name),
            toCheck.length,
        );

        const osvEntries: Array<{ name: string; version: string | null }> = [];

        for (let i = 0; i < toCheck.length; i++) {
            const vIdx = verdicts.findIndex(v => v.name === toCheck[i].name && v.exists === null);
            if (vIdx === -1) continue;
            const meta = metadatas[i];
            if (meta === null) {
                verdicts[vIdx].exists = false;
                verdicts[vIdx].error = 'not found on npm';
            } else {
                verdicts[vIdx].exists = true;
                verdicts[vIdx].latestVersion = meta.latestVersion;
                verdicts[vIdx].isTooNew = isPackageTooNew(meta.createdAt);
                osvEntries.push({ name: toCheck[i].name, version: meta.latestVersion });
            }
        }

        if (osvEntries.length > 0) {
            const vulnMap = await this.osvClient.queryBatch(osvEntries);
            for (const [name, vulns] of vulnMap) {
                const vIdx = verdicts.findIndex(v => v.name === name);
                if (vIdx !== -1) {
                    verdicts[vIdx].vulnerabilities = vulns;
                }
            }
        }

        return verdicts;
    }
}
