import { describe, it, expect } from 'vitest';
import {
  isMaliciousEntry,
  isPackageTooNew,
  NEW_PACKAGE_THRESHOLD_HOURS,
  NODE_BUILTIN_MODULES,
} from '../domain/entities';

describe('isMaliciousEntry', () => {
  it('returns true when id starts with MAL-', () => {
    expect(isMaliciousEntry({ id: 'MAL-2025-0001' })).toBe(true);
  });

  it('returns false when id does not start with MAL-', () => {
    expect(isMaliciousEntry({ id: 'GHSA-xxxx-xxxx-xxxx' })).toBe(false);
  });

  it('returns false when id is missing', () => {
    expect(isMaliciousEntry({})).toBe(false);
  });

  it('returns false when id is an empty string', () => {
    expect(isMaliciousEntry({ id: '' })).toBe(false);
  });

  it('returns false for CVE-like identifiers', () => {
    expect(isMaliciousEntry({ id: 'CVE-2025-1234' })).toBe(false);
  });
});

describe('isPackageTooNew', () => {
  it('returns true when package is less than threshold hours old', () => {
    const recent = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(isPackageTooNew(recent)).toBe(true);
  });

  it('returns false when package is older than threshold hours', () => {
    const old = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
    expect(isPackageTooNew(old)).toBe(false);
  });

  it('returns false when createdAt is empty', () => {
    expect(isPackageTooNew('')).toBe(false);
  });

  it('returns false when createdAt is exactly at the threshold', () => {
    const threshold = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    expect(isPackageTooNew(threshold)).toBe(false);
  });

  it('returns false when createdAt is null or undefined', () => {
    expect(isPackageTooNew('')).toBe(false);
  });
});

describe('constants', () => {
  it('NEW_PACKAGE_THRESHOLD_HOURS is 72', () => {
    expect(NEW_PACKAGE_THRESHOLD_HOURS).toBe(72);
  });

  it('NODE_BUILTIN_MODULES includes common built-ins', () => {
    expect(NODE_BUILTIN_MODULES.has('fs')).toBe(true);
    expect(NODE_BUILTIN_MODULES.has('path')).toBe(true);
    expect(NODE_BUILTIN_MODULES.has('http')).toBe(true);
    expect(NODE_BUILTIN_MODULES.has('crypto')).toBe(true);
    expect(NODE_BUILTIN_MODULES.has('child_process')).toBe(true);
  });

  it('NODE_BUILTIN_MODULES excludes external package names', () => {
    expect(NODE_BUILTIN_MODULES.has('express')).toBe(false);
    expect(NODE_BUILTIN_MODULES.has('lodash')).toBe(false);
    expect(NODE_BUILTIN_MODULES.has('react')).toBe(false);
  });

  it('NODE_BUILTIN_MODULES includes the node: prefixed test module', () => {
    expect(NODE_BUILTIN_MODULES.has('node:test')).toBe(true);
  });
});
