import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  calculateSimilarity,
  normalizePackageName,
  detectTyposquatting,
} from '../domain/entities';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('lodash', 'lodash')).toBe(0);
    expect(levenshteinDistance('express', 'express')).toBe(0);
  });

  it('returns 1 for single character difference', () => {
    // Adding or removing one character
    expect(levenshteinDistance('express', 'expres')).toBe(1); // missing 's'
    expect(levenshteinDistance('react', 'reac')).toBe(1);     // missing 't'
    expect(levenshteinDistance('lodash', 'lodas')).toBe(1);   // missing 'h'
  });

  it('returns 2 for two character differences or transpositions', () => {
    // Transposition requires 2 operations (delete + insert)
    expect(levenshteinDistance('lodash', 'lodahs')).toBe(2);  // transposition: 'sh' -> 'hs'
    // Substitution is 1 operation
    expect(levenshteinDistance('axios', 'axiom')).toBe(1);    // 's' -> 'm' (1 substitution)
    // Two insertions
    expect(levenshteinDistance('lodash', 'lodaahh')).toBe(2);  // extra 'a' and 'h'
  });

  it('returns correct distance for transposition', () => {
    expect(levenshteinDistance('react', 'recat')).toBe(2);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'xyz')).toBe(3);
  });

  it('handles case sensitivity', () => {
    expect(levenshteinDistance('React', 'react')).toBe(1);
  });
});

describe('calculateSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(calculateSimilarity('lodash', 'lodash')).toBe(1);
  });

  it('returns high score for typosquatting candidates', () => {
    // Single char deletion gives high similarity
    const score1 = calculateSimilarity('express', 'expres');
    expect(score1).toBeGreaterThan(0.8);
    expect(score1).toBeLessThan(1);

    // Transposition gives slightly lower but still high similarity
    const score2 = calculateSimilarity('lodash', 'lodahs');
    expect(score2).toBeGreaterThan(0.6);
    expect(score2).toBeLessThan(1);
  });

  it('returns medium score for somewhat similar names', () => {
    const score = calculateSimilarity('lodash', 'loadash');
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThan(0.9);
  });

  it('returns low score for different names', () => {
    const score = calculateSimilarity('lodash', 'express');
    expect(score).toBeLessThan(0.5);
  });

  it('handles empty strings', () => {
    expect(calculateSimilarity('', '')).toBe(1);
    expect(calculateSimilarity('abc', '')).toBe(0);
  });
});

describe('normalizePackageName', () => {
  it('returns null scope for unscoped packages', () => {
    const result = normalizePackageName('lodash');
    expect(result.scope).toBeNull();
    expect(result.name).toBe('lodash');
  });

  it('correctly parses scoped packages', () => {
    const result = normalizePackageName('@types/node');
    expect(result.scope).toBe('@types');
    expect(result.name).toBe('node');
  });

  it('handles scoped packages with nested paths', () => {
    const result = normalizePackageName('@angular/core/testing');
    expect(result.scope).toBe('@angular');
    expect(result.name).toBe('core');
  });

  it('handles packages starting with @ but without scope', () => {
    const result = normalizePackageName('@invalid');
    expect(result.scope).toBeNull();
    expect(result.name).toBe('@invalid');
  });
});

describe('detectTyposquatting', () => {
  const popularPackages = [
    'lodash',
    'express',
    'react',
    'react-dom',
    'axios',
    '@types/node',
    '@angular/core',
  ];

  it('returns null for exact matches with popular packages', () => {
    expect(detectTyposquatting('lodash', popularPackages, 0.85)).toBeNull();
    expect(detectTyposquatting('express', popularPackages, 0.85)).toBeNull();
    expect(detectTyposquatting('@types/node', popularPackages, 0.85)).toBeNull();
  });

  it('detects typosquatting candidates with single char changes', () => {
    // Single char deletion gives high similarity (>0.8)
    const result = detectTyposquatting('expres', popularPackages, 0.8);
    expect(result).not.toBeNull();
    expect(result!.similarTo).toBe('express');
    expect(result!.similarityScore).toBeGreaterThan(0.8);
  });

  it('detects typosquatting with transposition at lower threshold', () => {
    // Transposition gives ~0.67 similarity, use lower threshold
    const result = detectTyposquatting('lodahs', popularPackages, 0.6);
    expect(result).not.toBeNull();
    expect(result!.similarTo).toBe('lodash');
  });

  it('returns null when similarity is below threshold', () => {
    const result = detectTyposquatting('completely-different', popularPackages, 0.85);
    expect(result).toBeNull();
  });

  it('handles scoped packages correctly', () => {
    // Should match @types/node if checking @types/noode
    const result = detectTyposquatting('@types/noode', popularPackages, 0.8);
    expect(result).not.toBeNull();
    expect(result!.similarTo).toBe('@types/node');
  });

  it('ignores packages with different scopes', () => {
    // @other/core should not match @angular/core
    const result = detectTyposquatting('@other/core', popularPackages, 0.85);
    expect(result).toBeNull();
  });

  it('respects threshold parameter', () => {
    // expres vs express is ~86% similar (1 char missing)
    const strict = detectTyposquatting('expres', popularPackages, 0.9);
    const lenient = detectTyposquatting('expres', popularPackages, 0.8);

    expect(strict).toBeNull(); // Too strict
    expect(lenient).not.toBeNull(); // Acceptable
  });

  it('returns report with correct structure', () => {
    const result = detectTyposquatting('expres', popularPackages, 0.8);
    expect(result).toMatchObject({
      name: 'expres',
      similarTo: 'express',
      isSuspicious: true,
    });
    expect(result!.distance).toBeGreaterThan(0);
    expect(result!.similarityScore).toBeGreaterThan(0);
    expect(result!.similarityScore).toBeLessThanOrEqual(1);
  });

  it('handles empty popular packages list', () => {
    const result = detectTyposquatting('lodash', [], 0.85);
    expect(result).toBeNull();
  });
});
