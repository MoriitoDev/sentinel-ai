# Concepts

## AI Hallucination

When an AI assistant generates code (like ChatGPT, Claude, Copilot), it sometimes invents package names that do not exist on npm. These are called **AI hallucinations** — also referred to as **slopsquatting**.

Sentinel-AI detects these by cross-referencing every import against the npm registry. If the package returns a 404, it is flagged as an AI hallucination.

```
 AI HALLUCINATIONS (1)
   ai-slopsquatting         ← not found on npm
```

## Shadow Code

A package that **exists on npm** but is **not declared in `package.json`**. This could mean:

- The package was imported manually without being added to `package.json`
- An AI hallucinated a real package name (it exists, but shouldn't be used)
- The import was copied from another project

```
 SHADOW CODE (1)
   @swc
```

## Node.js Built-in Modules

Packages like `fs`, `path`, `crypto` are Node.js runtime modules, not npm packages. Sentinel-AI automatically filters them out to avoid false positives.

List includes: `fs`, `path`, `crypto`, `http`, `https`, `net`, `tls`, `os`, `child_process`, `url`, `buffer`, `stream`, `util`, `events`, and more.

## Vulnerability Scan (Deep Mode)

When `--deep` is enabled, Sentinel-AI queries the [OSV (Open Source Vulnerabilities)](https://osv.dev) database, which aggregates data from:

- **GitHub Advisory Database** (GHSA-*)
- **Snyk**
- **npm Security Advisories**

All severity levels are reported: LOW, MEDIUM, HIGH, CRITICAL.

## Malicious Packages (MAL-*)

The OSV database also tracks **confirmed malicious packages** published to npm. These are flagged separately from regular vulnerabilities with a prominent `[MALICIOUS]` badge, as they represent a more severe threat.

## Package Age Check

A package published to npm less than 72 hours ago is flagged as suspicious, shown with a `[new <72h]` badge. This is a heuristic — malicious packages are often uploaded, spread, and quickly removed within hours.

## Batch OSV Query

Instead of making one HTTP request per package, Sentinel-AI sends a **single batch request** to the OSV API (`POST /v1/querybatch`) containing all packages at once. This reduces latency from O(N) to O(1) for the vulnerability check.

## Concurrency

Requests to the npm registry are parallelized with a configurable concurrency limit (default: 5). Retry logic (max 3 attempts with exponential backoff: 1s → 2s → 4s) handles rate limiting (HTTP 429).

## Transitive Dependencies

When `--deep` is enabled, Sentinel-AI reads `package-lock.json` and scans **all** transitive dependencies (not just packages you import directly). This catches vulnerabilities in packages that your dependencies use.

### Example

```
Your code: import 'axios'
               ↓
axios uses: follow-redirects  (transitive dep)
               ↓
follow-redirects has CVE-2023-26159 (HIGH)
```

Without `--deep`, `follow-redirects` would not be scanned. With `--deep`, it is included in the OSV batch query.

### Origin tracking

For each transitive vulnerability found, Sentinel-AI reports which direct dependency introduced it:

```
 TRANSITIVE VULNERABILITIES (2)
   follow-redirects (v2.4.1)    ← from axios@1.6.8
   qs (v0.6.6)                  ← from axios@1.6.8
```

### `--include-dev`

By default, only production transitive dependencies are scanned. Use `--include-dev` to also include dev-only transitive packages.

## Version Resolution

Sentinel-AI resolves the installed version of each package using priority order:

1. **package-lock.json** — exact version (always available, no `node_modules` needed)
2. **`node_modules/<pkg>/package.json`** — exact version (requires `node_modules`)
3. **package.json** — version range (fallback, least precise)
