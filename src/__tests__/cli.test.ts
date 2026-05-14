import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCliArgs } from '../cli/CliParser';
import { printReport } from '../cli/AnsiFormatter';
import type { ScanResult } from '../application/ScanProjectUseCase';

describe('parseCliArgs', () => {
  it('returns defaults when no args are given', () => {
    const opts = parseCliArgs([]);
    expect(opts.deepScan).toBe(false);
    expect(opts.concurrency).toBe(5);
    expect(opts.includeDev).toBe(false);
  });

  it('recognizes the --deep flag', () => {
    expect(parseCliArgs(['--deep']).deepScan).toBe(true);
  });

  it('recognizes the -d shorthand', () => {
    expect(parseCliArgs(['-d']).deepScan).toBe(true);
  });

  it('parses --concurrency value', () => {
    expect(parseCliArgs(['--concurrency', '10']).concurrency).toBe(10);
  });

  it('parses the -c shorthand with a value', () => {
    expect(parseCliArgs(['-c', '3']).concurrency).toBe(3);
  });

  it('recognizes the --include-dev flag', () => {
    expect(parseCliArgs(['--include-dev']).includeDev).toBe(true);
  });

  it('recognizes the -i shorthand', () => {
    expect(parseCliArgs(['-i']).includeDev).toBe(true);
  });

  it('handles combined flags correctly', () => {
    const opts = parseCliArgs(['--deep', '--concurrency', '8', '--include-dev']);
    expect(opts.deepScan).toBe(true);
    expect(opts.concurrency).toBe(8);
    expect(opts.includeDev).toBe(true);
  });

  it('parses --concurrency at the end of args', () => {
    const opts = parseCliArgs(['-d', '-i', '--concurrency', '12']);
    expect(opts.deepScan).toBe(true);
    expect(opts.includeDev).toBe(true);
    expect(opts.concurrency).toBe(12);
  });
});

function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    reports: [],
    transitiveVulns: [],
    totalTransitiveCount: 0,
    elapsedMs: 100,
    ...overrides,
  };
}

describe('printReport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the AI HALLUCINATIONS section', () => {
    const result = makeResult({
      reports: [
        {
          name: 'hallucinated-pkg',
          isDeclared: true,
          isHallucination: true,
          metadata: null,
          installedVersion: null,
          vulnerabilities: [],
          isTooNew: false,
        },
      ],
    });
    printReport(result, { deepScan: false, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('AI HALLUCINATIONS');
    expect(output).toContain('hallucinated-pkg');
    expect(output).toContain('not found on npm');
  });

  it('prints the SHADOW CODE section', () => {
    const result = makeResult({
      reports: [
        {
          name: 'shadow-pkg',
          isDeclared: false,
          isHallucination: false,
          metadata: { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
          installedVersion: null,
          vulnerabilities: [],
          isTooNew: false,
        },
      ],
    });
    printReport(result, { deepScan: false, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('SHADOW CODE');
    expect(output).toContain('shadow-pkg');
  });

  it('prints VULNERABILITIES in deep mode when vulns exist', () => {
    const result = makeResult({
      reports: [
        {
          name: 'vuln-pkg',
          isDeclared: true,
          isHallucination: false,
          metadata: { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
          installedVersion: '1.0.0',
          vulnerabilities: [{ id: 'GHSA-xxxx', severity: 'HIGH', summary: 'Remote code execution' }],
          isTooNew: false,
        },
      ],
    });
    printReport(result, { deepScan: true, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('VULNERABILITIES');
    expect(output).toContain('Direct');
    expect(output).toContain('vuln-pkg');
    expect(output).toContain('GHSA-xxxx');
    expect(output).toContain('HIGH');
    expect(output).toContain('Remote code execution');
  });

  it('prints TRANSITIVE VULNERABILITIES in deep mode', () => {
    const result = makeResult({
      reports: [],
      transitiveVulns: [
        {
          name: 'transitive-pkg',
          version: '2.0.0',
          vulnerabilities: [{ id: 'GHSA-yyyy', severity: 'MODERATE' }],
          origin: 'direct-pkg@1.0.0',
          parents: ['direct-pkg@1.0.0'],
        },
      ],
    });
    printReport(result, { deepScan: true, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('TRANSITIVE VULNERABILITIES');
    expect(output).toContain('transitive-pkg');
    expect(output).toContain('direct-pkg@1.0.0');
  });

  it('prints CLEAN section in deep mode for clean packages', () => {
    const result = makeResult({
      reports: [
        {
          name: 'clean-pkg',
          isDeclared: true,
          isHallucination: false,
          metadata: { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
          installedVersion: '1.0.0',
          vulnerabilities: [],
          isTooNew: false,
        },
      ],
    });
    printReport(result, { deepScan: true, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('CLEAN');
    expect(output).toContain('clean-pkg');
  });

  it('prints no-issues message in standard mode when everything is clean', () => {
    const result = makeResult({
      reports: [
        {
          name: 'clean-pkg',
          isDeclared: true,
          isHallucination: false,
          metadata: { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
          installedVersion: '1.0.0',
          vulnerabilities: [],
          isTooNew: false,
        },
      ],
    });
    printReport(result, { deepScan: false, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('No shadow code or hallucinations detected');
  });

  it('includes the Sentinel Report header and elapsed time', () => {
    const result = makeResult({ elapsedMs: 2500 });
    printReport(result, { deepScan: false, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Sentinel Report');
    expect(output).toContain('2.5s');
    expect(output).toContain('standard mode');
  });

  it('shows MALICIOUS badge for shadow packages with MAL- vulns', () => {
    const result = makeResult({
      reports: [
        {
          name: 'mal-shadow',
          isDeclared: false,
          isHallucination: false,
          metadata: { exists: true, createdAt: '2020-01-01', latestVersion: '1.0.0' },
          installedVersion: null,
          vulnerabilities: [{ id: 'MAL-0001' }],
          isTooNew: false,
        },
      ],
    });
    printReport(result, { deepScan: false, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('[MALICIOUS]');
  });

  it('marks deep scan mode in the header', () => {
    const result = makeResult();
    printReport(result, { deepScan: true, concurrency: 5, includeDev: false });

    const output = vi.mocked(console.log).mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('deep mode');
  });
});
