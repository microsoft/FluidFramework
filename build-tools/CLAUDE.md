# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the build-tools release group for Fluid Framework, containing build and release tooling for the Fluid Framework monorepo. It's a pnpm workspace with multiple packages that provide CLI tools and build infrastructure.

## Key Packages

- **@fluid-tools/build-cli (flub)**: Modern CLI tool for build and release operations, built with oclif. Primary entry point for most build-tools functionality.
- **@fluidframework/build-tools**: Contains `fluid-build` (incremental build orchestrator) and legacy CLI tools. New commands should be added to build-cli, not here.
- **@fluid-tools/version-tools**: APIs and CLI for semantic versioning with Fluid-specific version schemes (internal, virtualPatch).
- **@fluidframework/bundle-size-tools**: Tools for analyzing and tracking bundle sizes.
- **@fluid-tools/build-infrastructure**: Shared infrastructure for build tooling.

## Common Commands

### Building

```bash
# Build everything (uses fluid-build)
pnpm build

# Fast parallel build with worker threads
pnpm build:fast

# Build only TypeScript compilation
pnpm build:compile

# Incremental build with fluid-build
fluid-build

# Build specific package by name or path
fluid-build @fluid-tools/build-cli
fluid-build packages/build-cli
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in specific package
cd packages/build-cli && pnpm test:mocha

# Run specific test file (after building)
cd packages/build-cli && mocha lib/test/path/to/file.test.js
```

### Linting and Formatting

```bash
# Check formatting and linting
pnpm lint

# Auto-fix formatting and linting issues
pnpm lint:fix

# Format with Biome
pnpm format

# Check format without fixing
pnpm check:format

# Run ESLint
pnpm ci:eslint
```

### Policy and Validation

```bash
# Check repository policies
pnpm policy-check

# Fix policy violations (except assert short codes)
pnpm policy-check:fix

# Fix assert short codes specifically
pnpm policy-check:asserts
```

### Dependency Management

```bash
# Check for dependency version mismatches
pnpm syncpack:versions

# Fix version mismatches
pnpm syncpack:versions:fix

# Check semver range consistency
pnpm syncpack:deps

# Fix semver ranges
pnpm syncpack:deps:fix
```

### Cleaning

```bash
# Clean all build artifacts
pnpm clean

# Clean specific package
cd packages/build-cli && pnpm clean
```

## Architecture

### fluid-build

`fluid-build` is the core incremental build orchestrator. It:
- Uses task definitions from `fluidBuild.config.cjs` at repo root and package-level `fluidBuild.tasks` in package.json
- Builds a dependency graph of tasks across packages
- Supports incremental detection by tracking file hashes and TypeScript build info
- Runs tasks in parallel based on dependency constraints
- Has experimental worker mode (`--worker`) for ~29% faster builds

Task dependencies use:
- `dependsOn`: Array of task dependencies in same package
- `^taskName`: Dependencies on task in all dependent packages
- `before`/`after`: Ordering constraints
- `"..."`: Include default dependencies from root config

### flub CLI Structure

Built with oclif framework. Commands are in `packages/build-cli/src/commands/`:
- `bump`: Version bumping for packages and release groups
- `check`: Policy checks and validation
- `generate`: Code/doc generation (typetests, packlists, etc.)
- `release`: Release workflow state machine
- `publish`/`promote`: npm publishing operations
- `modify`: Dependency and import modifications

Outputs to `lib/` (not `dist/`) due to oclif conventions.

### Version Schemes

Fluid uses non-standard semver schemes:
- **internal**: `a.b.c-internal.x.y.z` (deprecated but still in compat tests)
- **virtualPatch**: `0.major.minorpatch` where patch = minor*1000 + patch (pre-1.0 only)

### Release Groups

Build-tools is one "release group" in the larger Fluid monorepo. Release groups are workspace-managed package collections defined in the root repo's `fluidBuild.config.cjs`.

## Testing Local Changes in Client Release Group

To test build-tools changes against the client release group:

```bash
# From repo root, add pnpm overrides
npm pkg set pnpm.overrides.@fluidframework/build-tools=link:./build-tools/packages/build-tools pnpm.overrides.@fluid-tools/build-cli=link:./build-tools/packages/build-cli
pnpm i --no-frozen-lockfile

# Now pnpm build uses your local build-tools
pnpm build
```

Remember: Rebuild build-tools after changes for them to take effect in client.

## Development Workflow

1. Make changes in relevant package (`packages/build-cli`, `packages/build-tools`, etc.)
2. Build: `pnpm build` or `pnpm build:fast`
3. Test: `pnpm test` or test specific package
4. Lint: `pnpm lint` (fix with `pnpm lint:fix`)
5. Check policies: `pnpm policy-check` (fix with `pnpm policy-check:fix`)

## Important Notes

- This codebase uses ESM modules (`"type": "module"` in package.json)
- Test files use `.test.ts` suffix and compile to `lib/test/` or `dist/test/`
- Package manager is pnpm (version specified in `packageManager` field)
- Node version requirement: `>=20.15.1`
- New CLI commands belong in `build-cli`, not `build-tools`
- Biome is used for formatting/linting alongside ESLint
- TypeScript target is specified per-package in tsconfig.json files
