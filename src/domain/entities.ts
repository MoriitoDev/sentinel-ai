export const NEW_PACKAGE_THRESHOLD_HOURS = 72;

export const NODE_BUILTIN_MODULES = new Set([
    'fs', 'path', 'crypto', 'http', 'https', 'http2', 'net', 'tls', 'url',
    'querystring', 'os', 'vm', 'domain', 'dgram', 'dns', 'assert', 'util',
    'zlib', 'buffer', 'stream', 'events', 'string_decoder', 'punycode',
    'module', 'constants', 'process', 'tty', 'child_process', 'cluster',
    'readline', 'repl', 'v8', 'async_hooks', 'perf_hooks', 'timers',
    'diagnostics_channel', 'trace_events', 'console', 'inspector',
    'worker_threads', 'wasi', 'test', 'node:test',
]);

export interface Vulnerability {
    id?: string;
    aliases?: string[];
    summary?: string;
    severity?: string;
    database_specific?: { severity?: string };
}

export interface PackageMetadata {
    exists: true;
    createdAt: string;
    latestVersion: string;
}

export interface PackageReport {
    name: string;
    isDeclared: boolean;
    isHallucination: boolean;
    metadata: PackageMetadata | null;
    installedVersion: string | null;
    vulnerabilities: Vulnerability[];
    isTooNew: boolean;
}

export interface LockEntry {
    version: string;
    resolved?: string;
    dev?: boolean;
    dependencies?: Record<string, string>;
}

export interface CliOptions {
    deepScan: boolean;
    concurrency: number;
    includeDev: boolean;
}

export interface TransitiveVulnReport {
    name: string;
    version: string;
    vulnerabilities: Vulnerability[];
    origin: string;
    parents: string[];
}

export function isMaliciousEntry(vuln: Vulnerability): boolean {
    return (vuln.id || '').startsWith('MAL-');
}

export function isPackageTooNew(createdAt: string): boolean {
    if (!createdAt) return false;
    const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
    return ageHours < NEW_PACKAGE_THRESHOLD_HOURS;
}
