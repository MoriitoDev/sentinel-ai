import type { LockEntry } from '../../domain/entities';

export function buildOriginMap(
    lock: Map<string, LockEntry>,
    directPkgs: Set<string>,
): Map<string, string[]> {
    const origin = new Map<string, string[]>();
    for (const [key, entry] of lock.entries()) {
        if (!key) continue;
        const pkgName = key.replace('node_modules/', '');
        if (!directPkgs.has(pkgName)) continue;
        const deps = entry.dependencies;
        if (!deps) continue;
        for (const dep of Object.keys(deps)) {
            if (!origin.has(dep)) origin.set(dep, []);
            origin.get(dep)!.push(`${pkgName}@${entry.version}`);
        }
    }
    return origin;
}
