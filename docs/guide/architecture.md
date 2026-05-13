# Architecture

Sentinel-AI follows **Clean Architecture** with 4 layers, each with a single responsibility. Dependency injection in `src/main.ts` wires them together.

## Layer overview

```
┌─────────────────────────────────────────────────┐
│                    CLI Layer                      │
│    CliParser.ts    AnsiFormatter.ts    main.ts    │
├─────────────────────────────────────────────────┤
│                 Application Layer                 │
│    ScanProjectUseCase.ts    services/             │
├─────────────────────────────────────────────────┤
│               Infrastructure Layer                │
│  SwcScanner  FileSystemReader  VersionResolver    │
│  NpmHttpClient    OsvHttpClient                   │
├─────────────────────────────────────────────────┤
│                  Domain Layer                      │
│    entities.ts    repositories.ts                 │
└─────────────────────────────────────────────────┘
```

## Domain Layer

Defines the enterprise business rules — pure types, interfaces, and helper functions with zero external dependencies.

- **`entities.ts`** — `PackageMetadata`, `PackageReport`, `Vulnerability`, `LockEntry`, `CliOptions`, `TransitiveVulnReport`, plus helper functions like `isMaliciousEntry()` and `isPackageTooNew()`. Also exports the `NODE_BUILTIN_MODULES` constant set.
- **`repositories.ts`** — Interface contracts (TypeScript interfaces) for each external dependency: `IScanner`, `IFileSystemReader`, `IVersionResolver`, `INpmClient`, `IOsvClient`.

## Infrastructure Layer

Implements the interfaces defined in the domain layer. Each class focuses on one external concern.

### SwcScanner
- Uses **fast-glob** to find all `.ts`, `.tsx`, `.js`, `.jsx` files
- Parses each file with **SWC** into an AST
- Extracts `ImportDeclaration` nodes, strips subpaths (`firebase/auth` → `firebase`), filters built-in modules and relative imports (`./`, `../`)
- Returns a de-duplicated list of package names

### FileSystemReader
- Reads `package.json` for declared dependencies (`dependencies` + `devDependencies`)
- Reads `package-lock.json` for exact package versions and transitive dependency trees
- Caches the lock file in memory after the first read

### VersionResolver
- Resolves exact installed version for a package using priority: lock file → `node_modules/<pkg>/package.json` → `package.json` range

### NpmHttpClient
- Fetches npm registry metadata for a package
- HTTP 429 triggers exponential backoff: 1s → 2s → 4s (max 3 retries)
- Returns `null` for 404 (hallucination), metadata object otherwise

### OsvHttpClient
- Sends a single `POST /v1/querybatch` request to the OSV API with ALL packages
- Maps responses back to individual packages by index
- Returns vulnerability arrays

## Application Layer

Orchestrates domain and infrastructure to fulfill use cases.

### ScanProjectUseCase

The main orchestrator. Its `execute()` method:

1. Calls `IScanner.scan()` to get all imported packages from source files
2. Reads `package.json` via `IFileSystemReader` for declared dependencies
3. For each package, fetches npm metadata via `INpmClient` (concurrency-limited) to detect hallucinations and shadow code
4. Resolves installed versions via `IVersionResolver`
5. If `--deep`: collects transitive dependencies from lock file, builds origin map via `OriginTracker`, queries OSV batch API
6. Returns a `ScanResult` with all reports, transitive vulnerabilities, and timing

### OriginTracker

Service that builds a map of which direct dependency owns each transitive dependency by scanning the `dependencies` field inside every direct package's lock file entry.

## CLI Layer

Parses arguments and presents results.

### CliParser
- Reads `process.argv` and returns a `CliOptions` object
- Supports `--deep`/`-d`, `--concurrency`/`-c VALUE`, `--include-dev`/`-i`

### AnsiFormatter
- Colors output with ANSI escape codes (zero external deps)
- Groups results into sections: AI HALLUCINATIONS (red), SHADOW CODE (orange), VULNERABILITIES — Direct (yellow), TRANSITIVE VULNERABILITIES (yellow), CLEAN (green)

### main.ts
The entry point. Wires all dependencies together and kicks off the use case:

```ts
const scanner = new SwcScanner();
const fileReader = new FileSystemReader();
const versionResolver = new VersionResolver(fileReader);
const npmClient = new NpmHttpClient();
const osvClient = new OsvHttpClient();

const useCase = new ScanProjectUseCase(
    scanner, fileReader, versionResolver, npmClient, osvClient,
);

useCase.execute(options).then(result => {
    printReport(result, options);
});
```

## Execution flow

```
main.ts
  │
  ├─ CliParser → CliOptions
  │
  ├─ SwcScanner.scan()          → package names from imports
  ├─ FileSystemReader           → declared deps from package.json
  │
  ├─ NpmHttpClient              → metadata per package (concurrency-limited)
  │
  ├─ VersionResolver            → exact installed version
  │
  ├─ (deep mode)
  │   ├─ FileSystemReader       → all transitive deps from lock file
  │   ├─ OriginTracker          → parent map for each transitive dep
  │   └─ OsvHttpClient          → batch vuln query (single request)
  │
  └─ AnsiFormatter.printReport()
```

## Data flow

```
Source files ──→ Import list ──→ npm registry ──→ Metadata + versions
                                      │
package.json ──→ Declared deps        │
                                      ▼
package-lock.json ──→ Exact versions + transitive deps
                          │
                          ▼
               OSV batch API ──→ Vulnerabilities (direct + transitive)
                          │
                          ▼
                   Report sections:
                   • AI HALLUCINATIONS
                   • SHADOW CODE
                   • VULNERABILITIES — Direct
                   • TRANSITIVE VULNERABILITIES
                   • CLEAN
```

## Retry logic

```
fetchNpmMetadata(attempt = 1)
  ├─ Success → return data
  ├─ 404 → return null (hallucination)
  ├─ 429 + attempt < 3 → sleep(1s * 2^attempt), retry
  └─ Error + attempt < 3 → sleep(1s * 2^attempt), retry
```

## Color system (ANSI)

No external library. Output uses raw ANSI escape codes:

```ts
const c = {
    red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
    orange: (s: string) => `\x1b[38;5;208m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
    dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
    bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
};
```
