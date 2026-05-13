# Installation

Sentinel-AI is currently in development and not published to npm. Clone the repository and run it directly with `tsx`.

## Requirements

- **Node.js** v18 or higher (native `fetch` support)
- **npm** (comes with Node.js)

## Setup

```bash
# Clone the repository
git clone https://github.com/MoriitoDev/sentinel-ai.git
cd sentinel-ai

# Install dependencies
npm install

# Basic scan (hallucinations + shadow code only)
npm run scan

# Full vulnerability scan
npm run scan:deep
```

## Running directly

You can also invoke `tsx` directly with any flags:

```bash
npx tsx src/main.ts --deep --concurrency 10
```

## Next steps

Head to the [Usage guide](/guide/usage) to see all available flags and modes.
