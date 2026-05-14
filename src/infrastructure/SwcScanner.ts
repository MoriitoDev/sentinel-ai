import type { IScanner } from '../domain/repositories';
import { isNodeBuiltin } from '../domain/entities';
import glob from 'fast-glob';
import * as swc from '@swc/core';
import * as fs from 'fs/promises';

const DEFAULT_IGNORE = ['**/node_modules/**', '**/dist/**'];

export class SwcScanner implements IScanner {
    async scan(pattern: string, ignorePatterns?: string[]): Promise<string[]> {
        const ignore = ignorePatterns?.length
            ? [...DEFAULT_IGNORE, ...ignorePatterns]
            : DEFAULT_IGNORE;
        const files = await glob(pattern, { ignore });
        const allDeps = new Set<string>();
        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const ast = await swc.parse(content, { syntax: 'typescript', tsx: true });
                ast.body.forEach((node: any) => {
                    if (node.type === 'ImportDeclaration') {
                        const dep = node.source.value.split('/')[0];
                        if (dep && !dep.startsWith('.') && !isNodeBuiltin(dep)) allDeps.add(dep);
                    }
                });
            } catch { /* skip unreadable files */ }
        }
        return Array.from(allDeps);
    }
}
