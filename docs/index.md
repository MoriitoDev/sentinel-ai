---
layout: home

hero:
  name: "Sentinel-AI"
  text: "Detect AI hallucinated packages & npm vulnerabilities"
  tagline: A CLI tool to catch slopsquatting, shadow code, and supply-chain risks in your JavaScript/TypeScript projects.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/MoriitoDev/sentinel-ai

features:
  - icon: 🕵️
    title: AI Hallucination Detection
    details: Catches imports of packages that don't exist on npm — AI slopsquatting prevention.
  - icon: 📦
    title: Shadow Code Detection
    details: Flags packages used in code but missing from package.json — dead or smuggled imports.
  - icon: 🔍
    title: Vulnerability Scanning
    details: Queries the OSV database (batch API) for all packages including transitive deps.
  - icon: ⏳
    title: Package Age Check
    details: Flags packages published less than 72 hours ago — heuristic for supply-chain attacks.
  - icon: ☢️
    title: Malicious Package Alerts
    details: MAL- entries from the advisory database get a prominent [MALICIOUS] badge.
  - icon: 🧩
    title: Transitive Dependency Analysis
    details: Reads package-lock.json to scan deep dependencies — shows origin for each transitive vuln.
---
