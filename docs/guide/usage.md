# Usage

## Command-line flags

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--deep` | `-d` | Enable full vulnerability scan (age check + OSV + transitive deps) | off |
| `--concurrency` | `-c` | Max parallel npm registry requests | `5` |
| `--include-dev` | `-i` | Include dev-only transitive dependencies in deep mode | off |
| `--output` | `-o` | Save report to file (always prints to console too) | — |
| `--format` | `-f` | Output format: `text` (ANSI) or `json` | `text` |
| `--verbose` | `-v` | Enable debug logging to stderr | off |

## Modes

### Standard mode (no flags)

Scans your source code and reports:
- **AI Hallucinations** — packages imported but not found on npm
- **Shadow Code** — packages that exist on npm but are not declared in `package.json`

```bash
npx tsx src/main.ts
```

### Deep mode (`--deep`)

Performs everything in standard mode, plus:
- **Package age check** — flags packages published less than 72 hours ago
- **Vulnerability scan** — queries the OSV database for all packages (single batch request)
- **Transitive dependencies** — scans ALL dependencies in `package-lock.json` (not just direct imports)
- **Malicious package detection** — alerts on known malware entries (MAL-*) with a prominent `[MALICIOUS]` badge
- **Clean package reporting** — shows which declared packages have zero vulnerabilities
- **Version resolution** — uses exact versions from `package-lock.json` before falling back to `node_modules`

```bash
npx tsx src/main.ts --deep
```

### Including dev-only transitive deps (`--include-dev`)

By default, deep mode only scans production transitive dependencies. Use `--include-dev` to also scan dev-only transitive deps (types, build tools, etc.).

```bash
npx tsx src/main.ts --deep --include-dev
```

### Concurrency control (`--concurrency VALUE`)

Controls how many parallel requests are made to the npm registry. Lower values reduce the chance of rate limiting. Higher values speed up scanning for large projects.

```bash
# Slow and cautious
npx tsx src/main.ts --concurrency 2

# Fast for large projects
npx tsx src/main.ts --deep --concurrency 20
```

### Output to file (`--output PATH`)

Saves a copy of the report to a file while still printing the colorized output to the console. The file format depends on `--format`:

- **`text`** (default) — plain text without ANSI codes, suitable for diffs and CI logs
- **`json`** — structured JSON with summary, reports, and vulnerabilities

```bash
# Plain text report
npx tsx src/main.ts --output report.txt

# JSON report with full deep scan
npx tsx src/main.ts --deep --format json --output report.json
```

### JSON output (`--format json`)

Prints the report as structured JSON instead of the colorized table. Useful for programmatic consumption or CI pipelines.

```bash
# JSON to stdout
npx tsx src/main.ts --deep --format json

# JSON to file (console still shows colorized output)
npx tsx src/main.ts --deep --format json --output report.json
```

### Verbose logging (`--verbose`)

Enables debug-level logging to stderr for troubleshooting:

```bash
npx tsx src/main.ts --verbose
```

## Configuration file

Sentinel-AI reads settings from `.sentinelrc.json` in the project root. If the file does not exist, defaults are used. CLI flags always override config file values.

```json
{
  "scanPatterns": ["src/**/*.{ts,js,tsx,jsx}", "scripts/**/*.ts"],
  "ignorePatterns": ["**/node_modules/**", "**/dist/**", "**/*.test.ts"],
  "newPackageThresholdHours": 72,
  "concurrency": 5,
  "includeDev": false,
  "outputFormat": "text"
}
```

## How version resolution works

Sentinel-AI resolves the installed version of each package in priority order:

1. **package-lock.json** — exact version, no `node_modules` needed
2. **`node_modules/<pkg>/package.json`** — exact installed version
3. **package.json** — version range (fallback)

## Example output

### Standard mode

```
────────────────────────────────────────────────────────
 Sentinel Report  — 3 packages, 712ms, standard mode
────────────────────────────────────────────────────────

 AI HALLUCINATIONS (1)
   ai-slopsquatting         ← not found on npm

 SHADOW CODE (1)
   @swc

────────────────────────────────────────────────────────
```

### Deep mode

```
────────────────────────────────────────────────────────
 Sentinel Report  — 34 packages, 951ms, deep mode
────────────────────────────────────────────────────────

 AI HALLUCINATIONS (1)
   ai-slopsquatting         ← not found on npm

 SHADOW CODE (1)
   @swc

 CLEAN (1)
   fast-glob            v3.3.3

────────────────────────────────────────────────────────
```

### Deep mode with vulnerabilities (hypothetical)

```
────────────────────────────────────────────────────────
 Sentinel Report  — 34 packages, 2.1s, deep mode
────────────────────────────────────────────────────────

 AI HALLUCINATIONS (1)
   ai-slopsquatting         ← not found on npm

 SHADOW CODE (1)
   @swc                    [MALICIOUS]

 VULNERABILITIES — Direct (1)
   lodash               v4.17.21
     GHSA-35jh-r3h4-6jhm  CRITICAL  Command Injection in lodash

 TRANSITIVE VULNERABILITIES (2)
   follow-redirects (v2.4.1)    ← from axios@1.6.8
     GHSA-xxxx  CRITICAL  Arbitrary Code Execution in follow-redirects
   qs (v0.6.6)                  ← from axios@1.6.8
     GHSA-yyyy  MEDIUM  Prototype Pollution in qs

 CLEAN (80)

────────────────────────────────────────────────────────
```
