# Sentinel-AI

[![npm version](https://badge.fury.io/js/@moriito%2Fsentinel-ai.svg)](https://www.npmjs.com/package/@moriito/sentinel-ai)
[![CI](https://github.com/MoriitoDev/sentinel-ai/workflows/CI/badge.svg)](https://github.com/MoriitoDev/sentinel-ai/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A CLI tool to prevent **AI slopsquatting** (hallucinated package imports) and detect general vulnerabilities in your codebase.

## Features

- **AI Hallucination Detection** — catches imports of packages that do not exist on npm
- **Shadow Code Detection** — flags packages used in imports but missing from `package.json`
- **Vulnerability Scan** — checks all packages against the OSV database (single batch request)
- **Malicious Package Alerts** — warns on packages with known malware (MAL-* entries)
- **Package Age Check** — flags suspiciously new packages (< 72 hours on npm)
- **Pre-Install Guard** — intercepts `npm install` to block hallucinated or vulnerable packages before they reach your disk
- **Node.js Built-in Filter** — ignores `fs`, `path`, `crypto`, `node:fs`, `node:path`, and other runtime modules
- **Concurrent Requests** — configurable parallelism + retry with exponential backoff

## Quick Start

```bash
git clone https://github.com/MoriitoDev/sentinel-ai.git
cd sentinel-ai
npm install

# Basic scan
npm run scan

# Full vulnerability scan
npm run scan:deep
```

## CLI Reference

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--deep` | `-d` | Enable full scanning (age + vulns + transitive deps) | off |
| `--concurrency` | `-c` | Max parallel requests to npm | `5` |
| `--include-dev` | `-i` | Include dev-only transitive deps in deep mode | off |
| `--output` | `-o` | Save report to file (plain text or JSON, console still shows) | — |
| `--format` | `-f` | Output format: `text` (ANSI) or `json` | `text` |
| `--verbose` | `-v` | Enable debug logging | off |

### Standard mode

Only checks for hallucinations and shadow code:

```bash
npm run scan
```

### Deep mode

Adds age checks and OSV vulnerability scanning for all packages:

```bash
npm run scan:deep
npx tsx src/main.ts --deep --concurrency 10
```

## Output

```
────────────────────────────────────────────────────────
 Sentinel Report  — 4 packages, 860ms, deep mode
────────────────────────────────────────────────────────

 AI HALLUCINATIONS (1)
   ai-slopsquatting         ← not found on npm

 SHADOW CODE (1)
   @swc

 VULNERABILITIES (0)

 CLEAN (2)
   @swc
   fast-glob            v3.3.3

────────────────────────────────────────────────────────
```

### Output to file

```bash
# Default text report (no ANSI codes)
npm run scan -- --output report.txt

# JSON report
npm run scan:deep -- --format json --output report.json
```

The console always shows the colorized output. The file receives a clean copy.

### Configuration file

Create `.sentinelrc.json` in the project root to set defaults:

```json
{
  "concurrency": 10,
  "includeDev": true,
  "outputFormat": "json"
}
```

CLI flags always override config file values.

## Documentation

Full documentation is available as a VitePress site. To run it locally:

```bash
npm run docs:dev
```

Or browse the markdown source in [docs/](./docs).

## How it works

1. Scans source files with SWC AST parser
2. Reads `package.json` for declared dependencies and `package-lock.json` for exact versions
3. Fetches npm registry metadata in parallel (configurable concurrency)
4. Queries OSV vulnerability database in a single batch request (including transitive deps)
5. Reports findings grouped into Hallucinations, Shadow Code, Vulnerabilities, Transitive Vulnerabilities, and Clean

## License

MIT
