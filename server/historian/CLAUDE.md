# Historian — Agent Context

## Overview

Historian is a service that tracks the historical record for a Fluid document. It acts as a proxy to the underlying git repository that maintains versioned snapshots.

## Structure

This is a release group root with two packages:

-   **`@fluidframework/historian`** (`packages/historian`) — Express-based HTTP server entry point (`src/www.ts`). Depends on historian-base.
-   **`@fluidframework/historian-base`** (`packages/historian-base`) — Core logic: routes, services, runner, and customizations (`src/`). Contains tests under `src/test/`.

## Build & Dev

-   **Package manager:** pnpm (v10). Do not use npm install.
-   **Node:** >=22.22.2
-   **Build:** `pnpm install && npm run build` (compiles TypeScript then lints)
-   **Build (compile only):** `npm run build:compile`
-   **Lint:** `npm run lint` (prettier + eslint)
-   **Lint fix:** `npm run lint:fix`
-   **Test:** `npm run test` (runs mocha tests in historian-base)
-   **Test with coverage:** `cd packages/historian-base && npm run test:coverage` (c8 + mocha)
-   **Docker build:** `npm run build:docker` (requires root build context: `--build-context root=../..`)

## Key Dependencies

-   **Express** for HTTP serving
-   **ioredis** for Redis caching
-   **axios** for upstream HTTP calls to git REST API
-   **winston** for logging
-   **nconf** for configuration
-   **jsonwebtoken** for JWT auth (in historian-base)

## Testing

-   Test framework: **mocha** (historian-base only)
-   Mocking: **sinon**, **axios-mock-adapter**, **ioredis-mock**
-   HTTP testing: **supertest**
-   Tests live in `packages/historian-base/src/test/`
-   Build tests separately: `cd packages/historian-base && npm run build:test`

## Configuration

Runtime config is in `packages/historian/config.json` and loaded via nconf.

## Conventions

-   Follow the root repo's CLAUDE.md: use string literals (not hex codes) for new assert messages.
-   TypeScript ~5.1.6. Do not upgrade without coordination.
-   ESLint flat config (`eslint.config.mts` at root and per-package).
