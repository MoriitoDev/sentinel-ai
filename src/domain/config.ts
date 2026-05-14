import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface SentinelConfig {
  scanPatterns: string[];
  ignorePatterns: string[];
  newPackageThresholdHours: number;
  concurrency: number;
  includeDev: boolean;
  outputFormat: 'text' | 'json';
  outputFile?: string;
}

export const DEFAULT_CONFIG: SentinelConfig = {
  scanPatterns: ['src/**/*.{ts,js,tsx,jsx}'],
  ignorePatterns: ['**/node_modules/**', '**/dist/**'],
  newPackageThresholdHours: 72,
  concurrency: 5,
  includeDev: false,
  outputFormat: 'text',
};

const CONFIG_FILE = '.sentinelrc.json';

export function loadConfig(cwd: string = process.cwd()): SentinelConfig {
  const configPath = join(cwd, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(raw) as Partial<SentinelConfig>;

    if (userConfig.newPackageThresholdHours !== undefined && userConfig.newPackageThresholdHours <= 0) {
      console.warn(`Warning: newPackageThresholdHours must be positive, using default (${DEFAULT_CONFIG.newPackageThresholdHours})`);
      userConfig.newPackageThresholdHours = DEFAULT_CONFIG.newPackageThresholdHours;
    }

    if (userConfig.concurrency !== undefined && userConfig.concurrency < 1) {
      console.warn(`Warning: concurrency must be at least 1, using default (${DEFAULT_CONFIG.concurrency})`);
      userConfig.concurrency = DEFAULT_CONFIG.concurrency;
    }

    if (userConfig.outputFormat !== undefined && !['text', 'json'].includes(userConfig.outputFormat)) {
      console.warn(`Warning: outputFormat must be "text" or "json", using default ("text")`);
      userConfig.outputFormat = DEFAULT_CONFIG.outputFormat;
    }

    return { ...DEFAULT_CONFIG, ...userConfig };
  } catch (err) {
    console.warn(`Warning: failed to parse ${CONFIG_FILE}, using defaults:`, err);
    return { ...DEFAULT_CONFIG };
  }
}
