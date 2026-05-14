import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildOriginMap } from '../application/services/OriginTracker';
import { ScanProjectUseCase } from '../application/ScanProjectUseCase';
import type { IScanner, IFileSystemReader, IVersionResolver, INpmClient, IOsvClient } from '../domain/repositories';
import type { LockEntry } from '../domain/entities';
import { DEFAULT_CONFIG } from '../domain/config';

describe('buildOriginMap', () => {
  it('maps transitive deps to their direct parent', () => {
    const lock = new Map<string, LockEntry>([
      ['node_modules/express', { version: '4.18.0', dependencies: { accepts: '1.3.8', 'array-flatten': '1.1.1' } }],
      ['node_modules/accepts', { version: '1.3.8', dependencies: { 'mime-types': '2.1.35' } }],
    ]);
    const direct = new Set(['express']);
    const map = buildOriginMap(lock, direct);

    expect(map.get('accepts')).toEqual(['express@4.18.0']);
    expect(map.get('array-flatten')).toEqual(['express@4.18.0']);
    expect(map.has('mime-types')).toBe(false);
  });

  it('maps a transitive dep pulled in by multiple parents', () => {
    const lock = new Map<string, LockEntry>([
      ['node_modules/express', { version: '4.18.0', dependencies: { accepts: '1.3.8' } }],
      ['node_modules/body-parser', { version: '1.20.0', dependencies: { accepts: '1.3.8' } }],
      ['node_modules/accepts', { version: '1.3.8' }],
    ]);
    const direct = new Set(['express', 'body-parser']);
    const map = buildOriginMap(lock, direct);

    expect(map.get('accepts')).toEqual(['express@4.18.0', 'body-parser@1.20.0']);
  });

  it('returns empty map for empty lock', () => {
    const map = buildOriginMap(new Map(), new Set(['express']));
    expect(map.size).toBe(0);
  });

  it('returns empty map when no lock entries match direct packages', () => {
    const lock = new Map([['node_modules/express', { version: '1.0.0', dependencies: { foo: '1.0.0' } }]]);
    const map = buildOriginMap(lock, new Set(['other']));
    expect(map.size).toBe(0);
  });

  it('skips lock entries without dependencies', () => {
    const lock = new Map([['node_modules/express', { version: '1.0.0' }]]);
    const map = buildOriginMap(lock, new Set(['express']));
    expect(map.size).toBe(0);
  });

  it('skips lock entries with an empty key', () => {
    const lock = new Map<string, LockEntry>([
      ['', { version: '1.0.0' }],
      ['node_modules/express', { version: '1.0.0', dependencies: { bar: '2.0.0' } }],
    ]);
    const map = buildOriginMap(lock, new Set(['express']));
    expect(map.get('bar')).toEqual(['express@1.0.0']);
  });
});

describe('ScanProjectUseCase', () => {
  const mockScanner: IScanner = { scan: vi.fn() };
  const mockFileReader: IFileSystemReader = {
    getDeclaredDependencies: vi.fn(),
    getPackageLock: vi.fn(),
  };
  const mockVersionResolver: IVersionResolver = {
    getInstalledVersion: vi.fn(),
    getVersionFromLock: vi.fn(),
  };
  const mockNpmClient: INpmClient = {
    fetchMetadata: vi.fn(),
    fetchAll: vi.fn(),
  };
  const mockOsvClient: IOsvClient = { queryBatch: vi.fn() };

  let useCase: ScanProjectUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ScanProjectUseCase(
      mockScanner,
      mockFileReader,
      mockVersionResolver,
      mockNpmClient,
      mockOsvClient,
      DEFAULT_CONFIG,
    );
  });

  it('detects hallucinated packages in standard mode', async () => {
    mockScanner.scan.mockResolvedValue(['hallucinated-pkg', 'real-pkg']);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set(['real-pkg']));
    mockFileReader.getPackageLock.mockResolvedValue(new Map());
    mockNpmClient.fetchAll.mockResolvedValue([
      null,
      { exists: true, createdAt: '2020-01-01', latestVersion: '2.0.0' },
    ]);
    mockVersionResolver.getInstalledVersion.mockResolvedValue('2.0.0');
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const result = await useCase.execute({
      deepScan: false,
      concurrency: 5,
      includeDev: false,
    });

    expect(result.reports).toHaveLength(2);
    const hallucinated = result.reports[0];
    expect(hallucinated.name).toBe('hallucinated-pkg');
    expect(hallucinated.isHallucination).toBe(true);
    expect(hallucinated.metadata).toBeNull();
    expect(hallucinated.installedVersion).toBeNull();

    const real = result.reports[1];
    expect(real.name).toBe('real-pkg');
    expect(real.isHallucination).toBe(false);
    expect(real.metadata).toEqual({
      exists: true,
      createdAt: '2020-01-01',
      latestVersion: '2.0.0',
    });
    expect(real.installedVersion).toBe('2.0.0');
    expect(real.isDeclared).toBe(true);
  });

  it('marks imported-but-undeclared packages as shadow code', async () => {
    mockScanner.scan.mockResolvedValue(['shadow-pkg']);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set());
    mockFileReader.getPackageLock.mockResolvedValue(new Map());
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const result = await useCase.execute({
      deepScan: false,
      concurrency: 5,
      includeDev: false,
    });

    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].name).toBe('shadow-pkg');
    expect(result.reports[0].isDeclared).toBe(false);
    expect(result.reports[0].isHallucination).toBe(false);
  });

  it('queries OSV for direct dependencies in standard mode', async () => {
    mockScanner.scan.mockResolvedValue(['vuln-pkg']);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set(['vuln-pkg']));
    mockFileReader.getPackageLock.mockResolvedValue(new Map());
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
    ]);
    mockVersionResolver.getInstalledVersion.mockResolvedValue('1.0.0');
    mockOsvClient.queryBatch.mockResolvedValue(
      new Map([['vuln-pkg', [{ id: 'GHSA-xxxx', summary: 'Critical vuln', severity: 'HIGH' }]]]),
    );

    const result = await useCase.execute({
      deepScan: false,
      concurrency: 5,
      includeDev: false,
    });

    expect(result.reports[0].vulnerabilities).toHaveLength(1);
    expect(result.reports[0].vulnerabilities[0].id).toBe('GHSA-xxxx');
    expect(mockOsvClient.queryBatch).toHaveBeenCalledWith([
      { name: 'vuln-pkg', version: '1.0.0' },
    ]);
  });

  it('includes transitive vulnerabilities in deep scan', async () => {
    mockScanner.scan.mockResolvedValue(['direct-pkg']);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set(['direct-pkg']));
    mockFileReader.getPackageLock.mockResolvedValue(
      new Map([
        [
          'node_modules/direct-pkg',
          { version: '1.0.0', dependencies: { 'transitive-pkg': '2.0.0' } },
        ],
        ['node_modules/transitive-pkg', { version: '2.0.0' }],
      ]),
    );
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
    ]);
    mockVersionResolver.getInstalledVersion.mockResolvedValue('1.0.0');
    mockOsvClient.queryBatch.mockResolvedValue(
      new Map([
        ['direct-pkg', []],
        ['transitive-pkg', [{ id: 'GHSA-yyyy', summary: 'Transitive vuln', severity: 'MODERATE' }]],
      ]),
    );

    const result = await useCase.execute({
      deepScan: true,
      concurrency: 5,
      includeDev: false,
    });

    expect(result.totalTransitiveCount).toBe(1);
    expect(result.transitiveVulns).toHaveLength(1);
    expect(result.transitiveVulns[0].name).toBe('transitive-pkg');
    expect(result.transitiveVulns[0].origin).toBe('direct-pkg@1.0.0');
    expect(result.transitiveVulns[0].vulnerabilities).toHaveLength(1);
    expect(result.transitiveVulns[0].vulnerabilities[0].id).toBe('GHSA-yyyy');
  });

  it('sets installedVersion on declared packages only', async () => {
    mockScanner.scan.mockResolvedValue(['declared-pkg', 'shadow-pkg']);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set(['declared-pkg']));
    mockFileReader.getPackageLock.mockResolvedValue(new Map());
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
      { exists: true, createdAt: '2020-01-01', latestVersion: '2.0.0' },
    ]);
    mockVersionResolver.getInstalledVersion.mockResolvedValue('1.0.0');
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const result = await useCase.execute({
      deepScan: false,
      concurrency: 5,
      includeDev: false,
    });

    expect(result.reports[0].name).toBe('declared-pkg');
    expect(result.reports[0].installedVersion).toBe('1.0.0');
    expect(result.reports[1].name).toBe('shadow-pkg');
    expect(result.reports[1].installedVersion).toBeNull();
  });

  it('passes concurrency limit to npmClient.fetchAll', async () => {
    mockScanner.scan.mockResolvedValue(['pkg']);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set());
    mockFileReader.getPackageLock.mockResolvedValue(new Map());
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    await useCase.execute({ deepScan: false, concurrency: 42, includeDev: false });

    expect(mockNpmClient.fetchAll).toHaveBeenCalledWith(['pkg'], 42);
  });

  it('skips dev-only transitive packages when includeDev is false', async () => {
    mockScanner.scan.mockResolvedValue(['direct-pkg']);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set(['direct-pkg']));
    mockFileReader.getPackageLock.mockResolvedValue(
      new Map([
        ['node_modules/direct-pkg', { version: '1.0.0', dev: false, dependencies: { 'transitive-pkg': '2.0.0' } }],
        ['node_modules/transitive-pkg', { version: '2.0.0', dev: true }],
      ]),
    );
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
    ]);
    mockVersionResolver.getInstalledVersion.mockResolvedValue('1.0.0');
    mockOsvClient.queryBatch.mockResolvedValue(new Map([['direct-pkg', []]]));

    const result = await useCase.execute({
      deepScan: true,
      concurrency: 5,
      includeDev: false,
    });

    expect(result.totalTransitiveCount).toBe(0);
  });

  it('handles an empty scan result gracefully', async () => {
    mockScanner.scan.mockResolvedValue([]);
    mockFileReader.getDeclaredDependencies.mockResolvedValue(new Set());
    mockFileReader.getPackageLock.mockResolvedValue(new Map());
    mockNpmClient.fetchAll.mockResolvedValue([]);

    const result = await useCase.execute({
      deepScan: false,
      concurrency: 5,
      includeDev: false,
    });

    expect(result.reports).toHaveLength(0);
    expect(result.transitiveVulns).toHaveLength(0);
    expect(result.totalTransitiveCount).toBe(0);
  });
});
