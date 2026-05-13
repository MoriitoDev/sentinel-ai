import type { PackageMetadata, Vulnerability, LockEntry } from './entities';

export interface IScanner {
    scan(pattern: string): Promise<string[]>;
}

export interface IFileSystemReader {
    getDeclaredDependencies(): Promise<Set<string>>;
    getPackageLock(): Promise<Map<string, LockEntry>>;
}

export interface IVersionResolver {
    getInstalledVersion(pkgName: string): Promise<string | null>;
    getVersionFromLock(pkgName: string, lock: Map<string, LockEntry>): string | null;
}

export interface INpmClient {
    fetchMetadata(pkg: string): Promise<PackageMetadata | null>;
    fetchAll(pkgs: string[], concurrency: number): Promise<Array<PackageMetadata | null>>;
}

export interface IOsvClient {
    queryBatch(entries: Array<{ name: string; version: string | null }>): Promise<Map<string, Vulnerability[]>>;
}
