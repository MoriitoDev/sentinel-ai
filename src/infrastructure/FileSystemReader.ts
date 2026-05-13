import type { IFileSystemReader } from '../domain/repositories';
import type { LockEntry } from '../domain/entities';
import * as fs from 'fs/promises';

export class FileSystemReader implements IFileSystemReader {
    private lockCache: Map<string, LockEntry> | null = null;

    async getDeclaredDependencies(): Promise<Set<string>> {
        try {
            const raw = await fs.readFile('./package.json', 'utf-8');
            const pkg = JSON.parse(raw);
            return new Set([
                ...Object.keys(pkg.dependencies || {}),
                ...Object.keys(pkg.devDependencies || {}),
            ]);
        } catch {
            return new Set<string>();
        }
    }

    async getPackageLock(): Promise<Map<string, LockEntry>> {
        if (this.lockCache) return this.lockCache;
        const map = new Map<string, LockEntry>();
        try {
            const raw = await fs.readFile('./package-lock.json', 'utf-8');
            const lock = JSON.parse(raw);
            const entries = lock.packages || lock.dependencies || {};
            for (const [key, val] of Object.entries(entries)) {
                if (key && typeof val === 'object' && val !== null) {
                    map.set(key, val as LockEntry);
                }
            }
        } catch { /* no lock file */ }
        this.lockCache = map;
        return map;
    }
}
