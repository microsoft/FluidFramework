# Fluid Framework - Project Overview

## Purpose
Distributed real-time collaborative web application framework using JavaScript/TypeScript.

## Tech Stack
- TypeScript (strict mode)
- pnpm monorepo
- ESLint + Biome for linting/formatting
- API Extractor for API docs
- Mocha for testing, c8 for coverage

## Structure
- packages/ - Core packages (@fluidframework/*)
- experimental/ - Experimental packages
- examples/ - Example apps
- azure/packages/ - Azure-specific
- tools/ - Build tools

## Key Conventions
- Dual ESM/CJS builds (lib/ for ESM, dist/ for CJS)
- Package exports use release tags: /public, /beta, /alpha, /legacy, /internal
- workspace:~ for internal deps
- Conventional commits
