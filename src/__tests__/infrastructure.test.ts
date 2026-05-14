import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Module-level mocks ──────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('fast-glob', () => ({ default: vi.fn() }));
vi.mock('@swc/core', () => ({ parse: vi.fn() }));

// ── Imports (resolved after mocks are installed) ────────────────────────────
import { readFile } from 'fs/promises';
import globMock from 'fast-glob';
import * as swc from '@swc/core';
import type { IFileSystemReader } from '../domain/repositories';
import { FileSystemReader } from '../infrastructure/FileSystemReader';
import { SwcScanner } from '../infrastructure/SwcScanner';
import { VersionResolver } from '../infrastructure/VersionResolver';
import { NpmHttpClient } from '../infrastructure/NpmHttpClient';
import { OsvHttpClient } from '../infrastructure/OsvHttpClient';
import type { LockEntry } from '../domain/entities';

// =============================================================================
// FileSystemReader
// =============================================================================
describe('FileSystemReader', () => {
  let reader: FileSystemReader;

  beforeEach(() => {
    vi.resetAllMocks();
    reader = new FileSystemReader();
  });

  describe('getDeclaredDependencies', () => {
    it('reads dependencies and devDependencies from package.json', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          dependencies: { express: '^4.18.0', lodash: '^4.17.21' },
          devDependencies: { vitest: '^4.0.0' },
        }),
      );

      const deps = await reader.getDeclaredDependencies();

      expect(deps).toEqual(new Set(['express', 'lodash', 'vitest']));
      expect(readFile).toHaveBeenCalledWith('./package.json', 'utf-8');
    });

    it('returns empty set when package.json has no dependencies', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ name: 'test' }));

      const deps = await reader.getDeclaredDependencies();

      expect(deps).toEqual(new Set());
    });

    it('returns empty set when package.json cannot be read', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const deps = await reader.getDeclaredDependencies();

      expect(deps).toEqual(new Set());
    });
  });

  describe('getPackageLock', () => {
    const lockJson = {
      packages: {
        '': { name: 'test' },
        'node_modules/express': { version: '4.18.0' },
        'node_modules/lodash': { version: '4.17.21' },
      },
    };

    it('parses the packages format from package-lock.json', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(lockJson));

      const map = await reader.getPackageLock();

      expect(map.get('node_modules/express')).toEqual({ version: '4.18.0' });
      expect(map.get('node_modules/lodash')).toEqual({ version: '4.17.21' });
      expect(map.size).toBe(2);
    });

    it('parses the dependencies format as fallback', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          dependencies: {
            express: { version: '4.18.0' },
          },
        }),
      );

      const map = await reader.getPackageLock();

      expect(map.get('express')).toEqual({ version: '4.18.0' });
    });

    it('returns empty map when the lock file is missing', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const map = await reader.getPackageLock();

      expect(map.size).toBe(0);
    });

    it('caches the parsed lock between calls', async () => {
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(lockJson));

      await reader.getPackageLock();
      await reader.getPackageLock();

      expect(readFile).toHaveBeenCalledTimes(1);
    });

    it('skips entries with non-object or null values', async () => {
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({
          packages: {
            'node_modules/foo': 'string-value',
            'node_modules/bar': null,
            'node_modules/baz': { version: '1.0.0' },
          },
        }),
      );

      const map = await reader.getPackageLock();

      expect(map.has('node_modules/foo')).toBe(false);
      expect(map.has('node_modules/bar')).toBe(false);
      expect(map.get('node_modules/baz')).toEqual({ version: '1.0.0' });
    });
  });
});

// =============================================================================
// SwcScanner
// =============================================================================
describe('SwcScanner', () => {
  let scanner: SwcScanner;

  beforeEach(() => {
    vi.resetAllMocks();
    scanner = new SwcScanner();
  });

  it('returns external imports from scanned source files', async () => {
    vi.mocked(globMock).mockResolvedValue(['src/index.ts']);
    vi.mocked(readFile).mockResolvedValue('import express from "express";\nimport lodash from "lodash";\n');
    vi.mocked(swc.parse).mockResolvedValue({
      body: [
        { type: 'ImportDeclaration', source: { value: 'express' } },
        { type: 'ImportDeclaration', source: { value: 'lodash' } },
      ],
    } as any);

    const deps = await scanner.scan('src/**/*.ts');

    expect(deps).toEqual(['express', 'lodash']);
    expect(globMock).toHaveBeenCalledWith('src/**/*.ts', {
      ignore: ['**/node_modules/**', '**/dist/**'],
    });
  });

  it('ignores relative imports (starting with dot)', async () => {
    vi.mocked(globMock).mockResolvedValue(['src/index.ts']);
    vi.mocked(readFile).mockResolvedValue('import "./local";\nimport "../util";\nimport express from "express";\n');
    vi.mocked(swc.parse).mockResolvedValue({
      body: [
        { type: 'ImportDeclaration', source: { value: './local' } },
        { type: 'ImportDeclaration', source: { value: '../util' } },
        { type: 'ImportDeclaration', source: { value: 'express' } },
      ],
    } as any);

    const deps = await scanner.scan('src/**/*.ts');

    expect(deps).toEqual(['express']);
  });

  it('ignores Node.js built-in modules', async () => {
    vi.mocked(globMock).mockResolvedValue(['src/index.ts']);
    vi.mocked(readFile).mockResolvedValue('import fs from "fs";\nimport http from "http";\nimport express from "express";\n');
    vi.mocked(swc.parse).mockResolvedValue({
      body: [
        { type: 'ImportDeclaration', source: { value: 'fs' } },
        { type: 'ImportDeclaration', source: { value: 'http' } },
        { type: 'ImportDeclaration', source: { value: 'express' } },
      ],
    } as any);

    const deps = await scanner.scan('src/**/*.ts');

    expect(deps).toEqual(['express']);
  });

  it('ignores node: prefixed built-in module imports', async () => {
    vi.mocked(globMock).mockResolvedValue(['src/index.ts']);
    vi.mocked(readFile).mockResolvedValue('import fs from "node:fs";\nimport { join } from "node:path";\nimport express from "express";\n');
    vi.mocked(swc.parse).mockResolvedValue({
      body: [
        { type: 'ImportDeclaration', source: { value: 'node:fs' } },
        { type: 'ImportDeclaration', source: { value: 'node:path' } },
        { type: 'ImportDeclaration', source: { value: 'express' } },
      ],
    } as any);

    const deps = await scanner.scan('src/**/*.ts');

    expect(deps).toEqual(['express']);
  });

  it('deduplicates repeated imports of the same package', async () => {
    vi.mocked(globMock).mockResolvedValue(['src/a.ts', 'src/b.ts']);
    vi.mocked(readFile).mockResolvedValue('import express from "express";\n');
    vi.mocked(swc.parse).mockResolvedValue({
      body: [{ type: 'ImportDeclaration', source: { value: 'express' } }],
    } as any);

    const deps = await scanner.scan('src/**/*.ts');

    expect(deps).toEqual(['express']);
  });

  it('skips files that cannot be read or parsed', async () => {
    vi.mocked(globMock).mockResolvedValue(['src/index.ts']);
    vi.mocked(readFile).mockRejectedValue(new Error('permission denied'));

    const deps = await scanner.scan('src/**/*.ts');

    expect(deps).toEqual([]);
  });

  it('handles scoped package names (split on / extracts scope as name)', async () => {
    vi.mocked(globMock).mockResolvedValue(['src/index.ts']);
    vi.mocked(readFile).mockResolvedValue('import "@scope/foo";\nimport "@scope/bar/baz";\n');
    vi.mocked(swc.parse).mockResolvedValue({
      body: [
        { type: 'ImportDeclaration', source: { value: '@scope/foo' } },
        { type: 'ImportDeclaration', source: { value: '@scope/bar/baz' } },
      ],
    } as any);

    const deps = await scanner.scan('src/**/*.ts');

    // split('/')[0] gives '@scope' for both, deduplicated by Set
    expect(deps).toEqual(['@scope']);
  });
});

// =============================================================================
// VersionResolver
// =============================================================================
describe('VersionResolver', () => {
  const mockGetPackageLock = vi.fn() as ReturnType<typeof vi.fn> & (() => Promise<Map<string, LockEntry>>);
  const mockReader: IFileSystemReader = {
    getDeclaredDependencies: vi.fn(),
    getPackageLock: mockGetPackageLock,
  };
  let resolver: VersionResolver;

  beforeEach(() => {
    vi.resetAllMocks();
    resolver = new VersionResolver(mockReader);
  });

  describe('getInstalledVersion', () => {
    it('returns version from the lock entry when present', async () => {
      mockGetPackageLock.mockResolvedValue(
        new Map([['node_modules/express', { version: '4.18.0' }]]),
      );

      const version = await resolver.getInstalledVersion('express');

      expect(version).toBe('4.18.0');
    });

    it('falls back to node_modules/package.json when lock has no entry', async () => {
      mockGetPackageLock.mockResolvedValue(new Map());
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ version: '3.0.0' }));

      const version = await resolver.getInstalledVersion('custom-pkg');

      expect(version).toBe('3.0.0');
      expect(readFile).toHaveBeenCalledWith('./node_modules/custom-pkg/package.json', 'utf-8');
    });

    it('falls back to package.json dependency range as last resort', async () => {
      mockGetPackageLock.mockResolvedValue(new Map());
      vi.mocked(readFile)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(
          JSON.stringify({
            dependencies: { 'fallback-pkg': '^2.0.0' },
          }),
        );

      const version = await resolver.getInstalledVersion('fallback-pkg');

      expect(version).toBe('^2.0.0');
    });

    it('returns null when all resolution strategies fail', async () => {
      mockGetPackageLock.mockResolvedValue(new Map());
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const version = await resolver.getInstalledVersion('ghost-pkg');

      expect(version).toBeNull();
    });
  });

  describe('getVersionFromLock', () => {
    it('returns version when the package exists in the lock map', () => {
      const lock = new Map([['node_modules/foo', { version: '1.0.0' }]]);
      expect(resolver.getVersionFromLock('foo', lock)).toBe('1.0.0');
    });

    it('returns null when the package is not in the lock map', () => {
      const lock = new Map();
      expect(resolver.getVersionFromLock('missing', lock)).toBeNull();
    });
  });
});

// =============================================================================
// NpmHttpClient
// =============================================================================
describe('NpmHttpClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: NpmHttpClient;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new NpmHttpClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchMetadata', () => {
    it('returns metadata on a successful 200 response', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({
            time: { created: '2020-01-15T00:00:00.000Z' },
            'dist-tags': { latest: '4.18.2' },
          }),
      });

      const meta = await client.fetchMetadata('express');

      expect(meta).toEqual({
        exists: true,
        createdAt: '2020-01-15T00:00:00.000Z',
        latestVersion: '4.18.2',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/express',
      );
    });

    it('returns null on a 404 response', async () => {
      mockFetch.mockResolvedValue({ status: 404 });

      const meta = await client.fetchMetadata('non-existent-pkg');

      expect(meta).toBeNull();
    });

    it('retries on 429 rate limit and succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({ status: 429 })
        .mockResolvedValueOnce({
          status: 200,
          json: () =>
            Promise.resolve({
              time: { created: '2020-01-01T00:00:00.000Z' },
              'dist-tags': { latest: '1.0.0' },
            }),
        });

      const meta = await client.fetchMetadata('throttled-pkg');

      expect(meta).not.toBeNull();
      expect(meta?.latestVersion).toBe('1.0.0');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on a network error and succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('network failure'))
        .mockResolvedValueOnce({
          status: 200,
          json: () =>
            Promise.resolve({
              time: { created: '2020-01-01T00:00:00.000Z' },
              'dist-tags': { latest: '2.0.0' },
            }),
        });

      const meta = await client.fetchMetadata('flaky-pkg');

      expect(meta?.latestVersion).toBe('2.0.0');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns null after exhausting all retries', async () => {
      mockFetch.mockRejectedValue(new Error('persistent error'));

      const meta = await client.fetchMetadata('down-pkg');

      expect(meta).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('encodes the package name in the URL', async () => {
      mockFetch.mockResolvedValue({ status: 404 });

      await client.fetchMetadata('@scope/foo');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/%40scope%2Ffoo',
      );
    });
  });

  describe('fetchAll', () => {
    it('returns results in the same order as input', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 200,
          json: () =>
            Promise.resolve({
              time: { created: '2020-01-01T00:00:00.000Z' },
              'dist-tags': { latest: '1.0.0' },
            }),
        })
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValueOnce({
          status: 200,
          json: () =>
            Promise.resolve({
              time: { created: '2020-01-01T00:00:00.000Z' },
              'dist-tags': { latest: '3.0.0' },
            }),
        });

      const results = await client.fetchAll(['pkg-a', 'pkg-b', 'pkg-c'], 5);

      expect(results).toHaveLength(3);
      expect(results[0]?.latestVersion).toBe('1.0.0');
      expect(results[1]).toBeNull();
      expect(results[2]?.latestVersion).toBe('3.0.0');
    });

    it('processes packages in batches respecting the concurrency limit', async () => {
      const makeOk = () =>
        Promise.resolve({
          status: 200,
          json: () =>
            Promise.resolve({
              time: { created: '2020-01-01T00:00:00.000Z' },
              'dist-tags': { latest: '1.0.0' },
            }),
        });

      mockFetch
        .mockImplementationOnce(makeOk)
        .mockImplementationOnce(makeOk)
        .mockImplementationOnce(makeOk);

      await client.fetchAll(['a', 'b', 'c'], 2);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('handles an empty input list', async () => {
      const results = await client.fetchAll([], 5);
      expect(results).toEqual([]);
    });
  });
});

// =============================================================================
// OsvHttpClient
// =============================================================================
describe('OsvHttpClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: OsvHttpClient;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new OsvHttpClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('queryBatch', () => {
    it('returns a map of package names to vulnerability arrays', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              { vulns: [{ id: 'GHSA-xxxx' }, { id: 'GHSA-yyyy' }] },
              { vulns: [] },
              null,
            ],
          }),
      });

      const entries = [
        { name: 'express', version: '4.18.0' },
        { name: 'lodash', version: '4.17.21' },
        { name: 'react', version: '18.0.0' },
      ];

      const map = await client.queryBatch(entries);

      expect(map.get('express')).toHaveLength(2);
      expect(map.get('express')?.[0]?.id).toBe('GHSA-xxxx');
      expect(map.get('lodash')).toEqual([]);
      expect(map.get('react')).toEqual([]);
    });

    it('returns empty map entries on network error', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const map = await client.queryBatch([{ name: 'express', version: '1.0.0' }]);

      expect(map.get('express')).toEqual([]);
    });

    it('sends the correct request payload', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({ results: [] }),
      });

      await client.queryBatch([{ name: 'express', version: '4.18.0' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.osv.dev/v1/querybatch',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queries: [
              {
                package: { name: 'express', ecosystem: 'npm' },
                version: '4.18.0',
              },
            ],
          }),
        },
      );
    });
  });
});
