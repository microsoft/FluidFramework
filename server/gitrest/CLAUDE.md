# GitRest — Agent Context

## Overview

GitRest provides a REST API to Git repositories, modeled after GitHub's REST APIs. It is part of the Fluid Framework server infrastructure.

## Project Structure

-   **Release group root:** `server/gitrest/`
-   **Packages:**
    -   `@fluidframework/gitrest` (`packages/gitrest/`) — Entry point of the GitRest service (`src/www.ts`)
    -   `@fluidframework/gitrest-base` (`packages/gitrest-base/`) — Base library: routes, utils, runners, storage, and Redis integration
-   **Workspace:** pnpm workspaces (`pnpm-workspace.yaml`)

## Key Source Layout (`gitrest-base`)

-   `src/routes/git/` — Git object REST endpoints: blobs, commits, refs, tags, trees
-   `src/routes/repository/` — Repository-level endpoints: commits, contents
-   `src/routes/summaries.ts` — Summary upload/download
-   `src/utils/` — Core utilities: filesystem abstractions, isomorphic-git manager, Redis FS, whole-summary read/write
-   `src/runner.ts` / `src/runnerFactory.ts` — Service runner
-   `src/app.ts` — Express app setup
-   `src/test/` — Mocha tests

## Build & Dev

```shell
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Build without linting (faster)
pnpm run build:compile

# Lint
pnpm run lint
pnpm run lint:fix

# Run tests (gitrest-base only)
cd packages/gitrest-base && npm test

# Test with coverage
cd packages/gitrest-base && npm run test:coverage

# Start the service
npm run start
```

## Docker

```shell
# Build container (run from server/gitrest/)
docker build -t gitrest . --build-context root=../..

# Dev mode with docker-compose
npm run start:dev

# Run tests in container
docker run -t gitrest npm test
```

## Tech Stack

-   **Runtime:** Node.js, Express
-   **Git backend:** isomorphic-git
-   **Storage:** Local filesystem, Redis (via `redisFs`), in-memory (`memfs`)
-   **Testing:** Mocha, Sinon, Supertest, c8 (coverage)
-   **Linting:** ESLint + Prettier
-   **Build:** TypeScript, concurrently

## REST API Pattern

Endpoints follow the GitHub API pattern:

-   `POST /repos/:owner/:repo/git/blobs` — Create blob
-   `POST /repos/:owner/:repo/git/trees` — Create tree
-   `POST /repos/:owner/:repo/git/commits` — Create commit
-   `POST /repos/:owner/:repo/git/refs` — Create ref
-   `PATCH /repos/:owner/:repo/git/refs/:ref` — Update ref
-   `DELETE /repos/:owner/:repo/git/refs/:ref` — Delete ref
-   `POST /repos/:owner/:repo/git/tags` — Create tag

## Conventions

-   Follow the parent repo's CLAUDE.md: use string literal assert messages (not hex codes) for new asserts.
-   API report files (`*.api.md`) are generated — never hand-edit them.
-   TypeScript strict mode. ESLint config extends `@fluidframework/eslint-config-fluid`.
-   Prettier config is at the release group root (`prettier.config.cjs`).
