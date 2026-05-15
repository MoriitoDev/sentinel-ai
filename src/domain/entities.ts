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
    concurrency?: number;
    includeDev?: boolean;
    verbose?: boolean;
    format?: 'text' | 'json';
    outputFile?: string;
}

export interface TransitiveVulnReport {
    name: string;
    version: string;
    vulnerabilities: Vulnerability[];
    origin: string;
    parents: string[];
}

export interface TyposquattingReport {
    name: string;
    similarTo: string;
    distance: number;
    similarityScore: number;
    isSuspicious: boolean;
}

/**
 * Calculates the Levenshtein distance between two strings
 * Complexity: O(n*m) where n and m are string lengths
 */
export function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = b[i - 1] === a[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    return matrix[b.length][a.length];
}

/**
 * Calculates similarity score between 0 and 1
 * 1 = identical, 0 = completely different
 */
export function calculateSimilarity(name1: string, name2: string): number {
    if (name1 === name2) return 1;
    const maxLen = Math.max(name1.length, name2.length);
    if (maxLen === 0) return 1;
    const distance = levenshteinDistance(name1, name2);
    return 1 - distance / maxLen;
}

/**
 * Normalizes a package name into scope and name components
 */
export function normalizePackageName(name: string): { scope: string | null; name: string } {
    if (name.startsWith('@')) {
        const parts = name.slice(1).split('/');
        if (parts.length >= 2) {
            return { scope: `@${parts[0]}`, name: parts[1] };
        }
    }
    return { scope: null, name };
}

/**
 * Detects if a package name is a typosquatting candidate
 * Returns null if no suspicious similarity found
 */
export function detectTyposquatting(
    packageName: string,
    popularPackages: string[],
    threshold: number = 0.85
): TyposquattingReport | null {
    // Skip if package is already in popular list (exact match)
    if (popularPackages.includes(packageName)) {
        return null;
    }
    
    const targetNorm = normalizePackageName(packageName);
    let bestMatch: { name: string; score: number; distance: number } | null = null;
    
    for (const popular of popularPackages) {
        // Skip self-comparison
        if (popular === packageName) continue;
        
        const popularNorm = normalizePackageName(popular);
        let score: number;
        
        // Both have scopes - compare scope + name together
        if (targetNorm.scope && popularNorm.scope) {
            if (targetNorm.scope === popularNorm.scope) {
                // Same scope, compare names only
                score = calculateSimilarity(targetNorm.name, popularNorm.name);
            } else {
                // Different scopes, skip (too different)
                continue;
            }
        } else if (!targetNorm.scope && !popularNorm.scope) {
            // Both unscoped, compare directly
            score = calculateSimilarity(packageName, popular);
        } else {
            // One scoped, one not - skip unless special case
            // Could be @types/package vs package
            if (targetNorm.scope === '@types' && !popularNorm.scope) {
                score = calculateSimilarity(targetNorm.name, popularNorm.name);
            } else if (popularNorm.scope === '@types' && !targetNorm.scope) {
                score = calculateSimilarity(targetNorm.name, popularNorm.name);
            } else {
                continue;
            }
        }
        
        if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
            const distance = levenshteinDistance(packageName, popular);
            bestMatch = { name: popular, score, distance };
        }
    }
    
    if (!bestMatch) return null;
    
    return {
        name: packageName,
        similarTo: bestMatch.name,
        distance: bestMatch.distance,
        similarityScore: bestMatch.score,
        isSuspicious: true,
    };
}

export function isNodeBuiltin(name: string): boolean {
    if (NODE_BUILTIN_MODULES.has(name)) return true;
    const stripped = name.startsWith('node:') ? name.slice(5) : null;
    return stripped ? NODE_BUILTIN_MODULES.has(stripped) : false;
}

export function isMaliciousEntry(vuln: Vulnerability): boolean {
    return (vuln.id || '').startsWith('MAL-');
}

export function isPackageTooNew(createdAt: string, thresholdHours: number = NEW_PACKAGE_THRESHOLD_HOURS): boolean {
    if (!createdAt) return false;
    const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
    return ageHours < thresholdHours;
}
