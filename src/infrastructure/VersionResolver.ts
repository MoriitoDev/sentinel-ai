import type { IVersionResolver } from '../domain/repositories';
import type { LockEntry } from '../domain/entities';
import { FileSystemReader } from './FileSystemReader';
import * as fs from 'fs/promises';

export class VersionResolver implements IVersionResolver {
    constructor(private fileReader: FileSystemReader) {}

    async getInstalledVersion(pkgName: string): Promise<string | null> {
        const lock = await this.fileReader.getPackageLock();
        const entry = lock.get(`node_modules/${pkgName}`);
        if (entry?.version) return entry.version;

        try {
            const modContent = await fs.readFile(`./node_modules/${pkgName}/package.json`, 'utf-8');
            return JSON.parse(modContent).version || null;
        } catch { /* fall through */ }

        try {
            const raw = await fs.readFile('./package.json', 'utf-8');
            const pkg = JSON.parse(raw);
            return pkg.dependencies?.[pkgName] || pkg.devDependencies?.[pkgName] || null;
        } catch {
            return null;
        }
    }

    getVersionFromLock(pkgName: string, lock: Map<string, LockEntry>): string | null {
        const entry = lock.get(`node_modules/${pkgName}`);
        return entry?.version || null;
    }
}
