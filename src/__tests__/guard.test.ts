import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuardUseCase } from '../guard/GuardUseCase';
import type { INpmClient, IOsvClient } from '../domain/repositories';

describe('GuardUseCase', () => {
  const mockNpmClient: INpmClient = {
    fetchMetadata: vi.fn(),
    fetchAll: vi.fn(),
  };
  const mockOsvClient: IOsvClient = { queryBatch: vi.fn() };
  let guard: GuardUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new GuardUseCase(mockNpmClient, mockOsvClient);
  });

  it('identifies built-in modules without querying npm for them', async () => {
    const verdicts = await guard.execute(['fs']);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].name).toBe('fs');
    expect(verdicts[0].exists).toBe(true);
    expect(verdicts[0].error).toBeNull();
    // fetchAll is called with empty array since built-ins skip the check list
    expect(mockNpmClient.fetchAll).toHaveBeenCalledWith([], 0);
  });

  it('returns metadata for an existing npm package', async () => {
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '4.18.2' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const verdicts = await guard.execute(['express']);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].name).toBe('express');
    expect(verdicts[0].exists).toBe(true);
    expect(verdicts[0].latestVersion).toBe('4.18.2');
    expect(verdicts[0].error).toBeNull();
  });

  it('reports a non-existent package as a hallucination', async () => {
    mockNpmClient.fetchAll.mockResolvedValue([null]);

    const verdicts = await guard.execute(['ai-hallucinated-pkg']);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].name).toBe('ai-hallucinated-pkg');
    expect(verdicts[0].exists).toBe(false);
    expect(verdicts[0].error).toBe('not found on npm');
  });

  it('marks recently published packages as too new', async () => {
    const recent = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: recent, latestVersion: '1.0.0' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const verdicts = await guard.execute(['fresh-pkg']);

    expect(verdicts[0].isTooNew).toBe(true);
  });

  it('attaches vulnerabilities returned by OSV', async () => {
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(
      new Map([['vuln-pkg', [{ id: 'GHSA-xxxx', severity: 'HIGH' }]]]),
    );

    const verdicts = await guard.execute(['vuln-pkg']);

    expect(verdicts[0].vulnerabilities).toHaveLength(1);
    expect(verdicts[0].vulnerabilities[0].id).toBe('GHSA-xxxx');
  });

  it('parses a requested version from package@version syntax', async () => {
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '4.18.2' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const verdicts = await guard.execute(['express@4.18.0']);

    expect(verdicts[0].name).toBe('express');
    expect(verdicts[0].requestedVersion).toBe('4.18.0');
  });

  it('parses scoped package names correctly', async () => {
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '2.0.0' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const verdicts = await guard.execute(['@scope/foo']);

    expect(verdicts[0].name).toBe('@scope/foo');
    expect(verdicts[0].requestedVersion).toBeNull();
  });

  it('handles a scoped package with a version specifier', async () => {
    mockNpmClient.fetchAll.mockResolvedValue([
      { exists: true, createdAt: '2020-01-01', latestVersion: '2.0.0' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map());

    const verdicts = await guard.execute(['@scope/foo@1.5.0']);

    expect(verdicts[0].name).toBe('@scope/foo');
    expect(verdicts[0].requestedVersion).toBe('1.5.0');
  });

  it('handles multiple packages with mixed results', async () => {
    mockNpmClient.fetchAll.mockResolvedValue([
      null,
      { exists: true, createdAt: '2020-01-01', latestVersion: '3.0.0' },
    ]);
    mockOsvClient.queryBatch.mockResolvedValue(new Map([['found-pkg', []]]));

    const verdicts = await guard.execute(['missing-pkg', 'found-pkg']);

    expect(verdicts).toHaveLength(2);
    expect(verdicts[0].name).toBe('missing-pkg');
    expect(verdicts[0].exists).toBe(false);
    expect(verdicts[0].error).toBe('not found on npm');
    expect(verdicts[1].name).toBe('found-pkg');
    expect(verdicts[1].exists).toBe(true);
    expect(verdicts[1].error).toBeNull();
  });

  it('skips OSV queries when all args are built-ins', async () => {
    const verdicts = await guard.execute(['fs', 'path', 'crypto']);

    expect(verdicts).toHaveLength(3);
    for (const v of verdicts) {
      expect(v.exists).toBe(true);
    }
    expect(mockOsvClient.queryBatch).not.toHaveBeenCalled();
  });
});
