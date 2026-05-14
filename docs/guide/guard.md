# Guard Mode

The **guard mode** is a pre-install safety check that validates packages before `npm install`, `npm i`, or `npm add` runs. It intercepts the command, checks each package against the npm registry and OSV database, and blocks the install if any issues are found — prompting the user to confirm or cancel.

## How it works

```
User: npm install lodash@^4.0.0
        │
        ▼  (shell function intercepts)
    guard-npm.sh
        │  extracts package names: ["lodash@^4.0.0"]
        │
        ▼  calls
    npx tsx src/guard.ts lodash@^4.0.0
        │
        ├─ NpmHttpClient.fetchMetadata()  → exists? 404?
        ├─ isPackageTooNew()              → <72h?
        └─ OsvHttpClient.queryBatch()     → vulns? MAL-*?
        │
        ▼  prints verdict per package
   ┌─ All clean → exit 0 → npm proceeds
   └─ Issues found → print report
                      ├─ "y" → exit 0 → npm proceeds
                      └─ "n" → exit 1 → npm is blocked
```

## One-time setup

Add the shell interceptor to your `.bashrc` or `.zshrc`:

```bash
export SENTINEL_DIR="/path/to/sentinel-ai"
source "$SENTINEL_DIR/scripts/guard-npm.sh"
```

Then reload your shell:

```bash
source ~/.bashrc   # or ~/.zshrc
```

## Using directly

You can also run the guard check manually without the interceptor:

```bash
npx tsx src/guard.ts lodash react
npx tsx src/guard.ts ai-slopsquatting        # hallucinated → blocked
npm run guard -- lodash                        # via package script
```

## Scenarios

### All packages clean

```
$ npm install fast-glob

sentinel guard — checking 1 package

 ✓ fast-glob  v3.3.3

 ✓ All packages look safe — proceeding with install.
```

npm proceeds normally.

### Hallucinated / blocked package

```
$ npm install ai-slopsquatting

sentinel guard — checking 1 package

 ✗ ai-slopsquatting  → NOT FOUND on npm (hallucinated package)

┌──────────────────────────────────────────────────┐
│  Blocked — 1 package has issues                  │
│  Review the warnings above before proceeding.    │
└──────────────────────────────────────────────────┘

Install anyway? [y/N]
```

Type `y` to override and allow the install, or press Enter (default `N`) to cancel.

### Mixed packages

```
$ npm install lodash ai-slopsquatting

sentinel guard — checking 2 packages

 ✓ lodash            v4.18.1
 ✗ ai-slopsquatting  → NOT FOUND on npm (hallucinated package)

┌──────────────────────────────────────────────────┐
│  Blocked — 1 package has issues                  │
│  Review the warnings above before proceeding.    │
└──────────────────────────────────────────────────┘

Install anyway? [y/N]
```

All packages are checked and displayed. Only the problematic ones are flagged.

## What is checked

| Check | Source | Blocks? |
|-------|--------|---------|
| Package exists on npm | npm registry (404 = hallucination) | Yes |
| Published <72h ago | npm registry `time.created` | Yes |
| Known vulnerabilities | OSV API batch query | Yes |
| MAL-* malware entries | OSV API (confirmed malware) | Yes |
| Node.js built-in module | Local set (`fs`, `path`, etc.) | No (skipped) |

## Exit codes

| Exit code | Meaning |
|-----------|---------|
| 0 | All packages clean, or user chose to proceed |
| 1 | Issues found and user declined, or error |
