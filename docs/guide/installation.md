# Installation

## Via npm (recommended)

Install the package in your project:

```bash
npm i @moriito/sentinel-ai
```

Run a scan:

```bash
# Basic scan (hallucinations + shadow code)
npx sentinel

# Deep scan (vulnerabilities + transitive deps + typosquatting)
npx sentinel --deep

# With options
npx sentinel --deep --concurrency 10 --include-dev
```

## Local development

Clone the repository and run it directly with `tsx`:

### Requirements

- **Node.js** v18 or higher (native `fetch` support)
- **npm** (comes with Node.js)

### Setup

```bash
git clone https://github.com/MoriitoDev/sentinel-ai.git
cd sentinel-ai
npm install

# Basic scan
npm run scan

# Full vulnerability scan
npm run scan:deep
```

## Next steps

Head to the [Usage guide](/guide/usage) to see all available flags and modes.
