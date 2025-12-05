# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository is the **build-tools release group** for Fluid Framework. It contains the build infrastructure, CLI tools, and version management tools used to build and release the Fluid Framework repositories. This is a pnpm workspace monorepo containing several packages.

## Repository Structure

This is a pnpm workspace monorepo with packages in `packages/`:

- **@fluid-tools/build-cli** (`packages/build-cli/`) - The `flub` CLI tool, an oclif-based wrapper for build-tools functionality. New CLI commands should be added here, not to build-tools.
- **@fluidframework/build-tools** (`packages/build-tools/`) - The core build system containing `fluid-build` (task scheduler), type test generator, and policy checking. This is the home of "classic" Fluid build tools.
- **@fluid-tools/version-tools** (`packages/version-tools/`) - APIs and CLI for working with Fluid's custom version schemes (internal and virtualPatch).
- **@fluidframework/build-infrastructure** (`packages/build-infrastructure/`) - Shared infrastructure code.
- **@fluidframework/bundle-size-tools** (`packages/bundle-size-tools/`) - Bundle size analysis tools.

## Build System Architecture

### fluid-build Task Scheduler

`fluid-build` is the core build task scheduler that supports:
- **Declarative task definitions** via `fluidBuild` config in package.json and root fluidBuild.config.cjs
- **Incremental builds** with intelligent change detection (reads tsc build info, compares file hashes)
- **Parallel execution** based on dependency graph (up to # of CPUs by default)
- **Multiple workspaces** (release groups) in a single repo

Task definitions specify dependencies using:
- `dependsOn: ["task"]` - depends on task in same package
- `dependsOn: ["^task"]` - depends on task in all dependency packages
- `before: ["*"]` - runs before all other tasks
- `after: ["task"]` - runs after specified task
- `script: false` - doesn't trigger npm script
- `"..."` in arrays - includes dependencies from default definition

Packages augment default task definitions via `fluidBuild.tasks` in their package.json.

### Incremental Build Detection

Different task types have specialized incremental detection:
- **Tsc tasks**: Read TypeScript's incremental build info and compare file hashes
- **Eslint/Tslint/ApiExtractor**: Copy dependent tsc build info plus tool version/config into "done" files
- Tasks are skipped if inputs haven't changed since last successful build

### Worker Mode

Use `--worker` flag for ~29% faster builds by reusing worker processes instead of spawning new ones. Experimental and increases memory usage.

## Common Development Commands

### Building

```bash
# Install dependencies for all packages
pnpm install

# Build all packages in this release group (incremental)
pnpm build
# Or: fluid-build --task build

# Fast parallel build using worker mode (reuse processes)
pnpm run build:fast
# Or: fluid-build --worker

# Build just TypeScript compilation
pnpm run tsc
# Or: fluid-build --task tsc

# Build specific package(s)
fluid-build packages/build-cli
fluid-build @fluidframework/build-tools
fluid-build merge  # Any package matching "merge"

# Build specific task across all packages
fluid-build --task tsc
fluid-build --task build:docs

# Clean and rebuild
fluid-build --rebuild
fluid-build --clean

# Force rebuild (ignore incremental checks)
fluid-build --force
```

### Testing

```bash
# Run all tests (runs Mocha tests in each package)
pnpm test
# Or: pnpm run test:mocha

# Run tests with coverage
pnpm run test:coverage

# Run tests but stop on first failure
pnpm run test:bail

# Run tests in a single package
cd packages/build-tools
pnpm test
```

Tests are located in `src/test/` directories within each package. The test files use `.test.ts` extension. After building, tests run from compiled JavaScript in `dist/test/` (for build-tools) or `lib/test/` (for build-cli, version-tools).

### Linting and Formatting

```bash
# Run all linting checks
pnpm lint

# Fix linting issues automatically
pnpm run lint:fix

# Format code with Biome
pnpm run format
# Or: pnpm run format:biome

# Check formatting without fixing
pnpm run check:format
# Or: pnpm run check:biome

# Run policy checks
pnpm run policy-check

# Fix policy violations (except assert-short-codes)
pnpm run policy-check:fix
```

Formatting uses [Biome](https://biomejs.dev/) configured in `biome.jsonc`.

### Version and Dependency Management

```bash
# Check for version mismatches across packages
pnpm run syncpack:versions

# Fix version mismatches
pnpm run syncpack:versions:fix

# Check semver range consistency
pnpm run syncpack:deps

# Fix semver ranges
pnpm run syncpack:deps:fix
```

### Commit Messages

This repo uses **conventional commits** enforced by commitlint:
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.
- Both subject and body must use sentence-case
- Use the `pnpm commit` command for interactive commit creation

## flub CLI Architecture

`flub` (Fluid build) is built with [oclif](https://oclif.io), a CLI framework. Key points:

- Commands are in `packages/build-cli/src/commands/` organized by topic
- Build output goes to `lib/` (not `dist/`) due to oclif conventions
- Commands reuse functionality from `@fluidframework/build-tools`
- The CLI provides commands for: bump, check, exec, generate, info, list, merge, modify, promote, publish, release, report, transform, typetests

## Testing Build-Tools in the Client Release Group

To test local build-tools changes in the main Fluid Framework client release group:

1. From the repo root, add pnpm overrides:
```bash
npm pkg set pnpm.overrides.@fluidframework/build-tools=link:./build-tools/packages/build-tools pnpm.overrides.@fluid-tools/build-cli=link:./build-tools/packages/build-cli
pnpm i --no-frozen-lockfile
```

2. Make changes to build-tools and rebuild them
3. Test in client (changes require rebuild to take effect)
4. Revert overrides before committing (this state cannot be merged)

## Debugging

### Debug Traces

fluid-build uses the `debug` package for diagnostics. Set `DEBUG` environment variable:

```bash
# All fluid-build traces
DEBUG=fluid-build:* fluid-build

# Specific trace categories
DEBUG=fluid-build:init fluid-build              # Initialization and package loading
DEBUG=fluid-build:task:definition fluid-build   # Task definition resolution
DEBUG=fluid-build:task:init fluid-build         # Task creation and dependencies
DEBUG=fluid-build:task:trigger fluid-build      # Why tasks are triggered (incremental build)
DEBUG=fluid-build:task:exec fluid-build         # Task execution flow
```

### VS Code Debugging

Launch targets are defined in `.vscode/launch.json` for debugging commands like `flub generate typetests`. For broader testing via package.json scripts, use pnpm overrides approach above and set breakpoints in `node_modules` JavaScript files.

## Important Architectural Details

### Build Output Directories

- **build-cli & version-tools**: Output to `lib/` (oclif convention)
- **build-tools**: Output to `dist/` (standard convention)
- Tests compile to corresponding test directories

### Package Manager

- Uses **pnpm** (required, enforced by preinstall script)
- Workspace protocol: `workspace:~` for internal dependencies
- pnpm version: 10.18.3+ (see packageManager in root package.json)
- Node version: >=20.15.1

### Version Schemes

The Fluid Framework uses custom version schemes handled by version-tools:

- **internal scheme** (legacy): `a.b.c-internal.x.y.z` with public and internal version triplets
- **virtualPatch scheme**: Pre-1.0 packages using `0.major.minorpatch` format (minor * 1000 + patch)
- Standard semver is the default for new packages

### Dependencies and Overrides

- Minimal dependencies kept through pnpm overrides (e.g., empty packages for unused AWS SDK features from oclif)
- `@types/node` forced to single version (^22.8.0) to reduce dependency duplication
- Self-dependency on `@fluidframework/build-tools` allows `build:fast` script to work before workspace version is built

## Common Workflows

### Adding a New Command to flub

1. Add command file in `packages/build-cli/src/commands/<topic>/`
2. Extend base command classes (BaseCommand, BasePackageCommand, etc.)
3. Import functionality from `@fluidframework/build-tools` if needed
4. Build and test the command
5. Run `pnpm run build:readme` to update documentation

### Modifying Task Definitions

1. For global changes: Edit root `fluidBuild.config.cjs`
2. For package-specific: Edit `fluidBuild.tasks` in package's package.json
3. Test with `fluid-build --task <taskname>` and verify dependencies
4. Use `DEBUG=fluid-build:task:definition` to debug resolution

### Running a Single Test File

For build-tools (uses Mocha):
```bash
cd packages/build-tools
pnpm build
pnpm exec mocha dist/test/path/to/specific.test.js
```

For build-cli (uses Mocha with ESM):
```bash
cd packages/build-cli
pnpm build
pnpm exec mocha lib/test/path/to/specific.test.js
```
