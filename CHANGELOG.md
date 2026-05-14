# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-14

### Added
- Initial public release with core features:
  - AI hallucination detection (slopsquatting prevention)
  - Shadow code detection
  - Vulnerability scanning via OSV database
  - Package age checking (< 72h flagging)
  - Malicious package detection (MAL-* entries)
  - Transitive dependency analysis
  - Guard mode for pre-install safety checks
  - JSON and text output formats
  - Configuration via .sentinelrc.json
  - Comprehensive documentation with VitePress
