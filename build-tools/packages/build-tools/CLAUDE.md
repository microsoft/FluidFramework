# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This package (`@fluidframework/build-tools`) contains the core build infrastructure for Fluid Framework, with two main tools:

- **`fluid-build`**: Task scheduler supporting incremental builds with intelligent change detection and parallel execution
- **`fluid-type-test-generator`**: Type compatibility test generator (see version-tools package for broader type test functionality)

This is a CommonJS package that outputs compiled code to `dist/` (unlike `build-cli` and `version-tools` which use `lib/`).

## Common Development Commands

### Building

```bash
# Build this package (runs TypeScript compilation and test compilation)
pnpm build
# Or: fluid-build --task build

# Compile just the main TypeScript (no tests)
pnpm run tsc

# Compile tests only
pnpm run build:test

# Clean build artifacts
pnpm clean
```

### Testing

```bash
# Run all tests (runs compiled tests from dist/test/)
pnpm test
# Or: pnpm run test:mocha

# Run a specific test file (after building)
pnpm exec mocha dist/test/biomeConfig.test.js
pnpm exec mocha dist/test/npmPackage.test.js
```

Tests are written in `src/test/` with `.test.ts` extension and compile to `dist/test/`. Mocha is the test runner, and tests expect Node.js types.

### Linting and Formatting

```bash
# Run ESLint
pnpm lint
# Or: pnpm run eslint

# Fix ESLint issues
pnpm run lint:fix
# Or: pnpm run eslint:fix

# Format with Biome
pnpm run format
# Or: pnpm run format:biome

# Check formatting
pnpm run check:format
# Or: pnpm run check:biome
```

## Code Architecture

### Core Concepts

**Build Graph**: The foundation of `fluid-build` is a directed acyclic graph (DAG) of tasks across packages. Each node is a `BuildPackage` containing multiple `Task` objects. Task dependencies drive execution order and parallelization.

**Task Hierarchy**:
- `Task` (abstract base) - in `tasks/task.ts`
  - `LeafTask` - executable tasks (run commands) in `tasks/leaf/leafTask.ts`
    - `TscTask`, `EsLintTask`, `WebpackTask`, etc. - specialized implementations in `tasks/leaf/`
  - `GroupTask` - composite tasks (depend on other tasks, no command) in `tasks/groupTask.ts`

**Key Classes**:
- **`FluidRepo`** (`fluidBuild/fluidRepo.ts`): Repository root representation containing release groups and packages
- **`MonoRepo`** (`common/monoRepo.ts`): Represents a release group (workspace) managed by pnpm/Lerna
- **`Package`** (`common/npmPackage.ts`): Individual npm package with package.json metadata
- **`BuildPackage`** (`fluidBuild/buildGraph.ts`): Wrapper around `Package` with tasks and build graph relationships
- **`TaskFactory`** (`fluidBuild/tasks/taskFactory.ts`): Creates appropriate `LeafTask` subclass based on command executable

### Incremental Build System

The build system tracks file hashes and build metadata to skip tasks when inputs haven't changed:

**TscTask** (`tasks/leaf/tscTask.ts`):
- Reads TypeScript's `.tsbuildinfo` files (incremental build metadata)
- Compares file hashes of all input files listed in build info
- Skips compilation if no inputs changed since last successful build

**Tsc-Dependent Tasks** (ESLint, TSLint, API Extractor):
- Copy dependent `tsc` task build info + tool version/config into a "done file"
- Compare current state to previous done file to determine if rebuild needed
- These tasks in `tasks/leaf/lintTasks.ts` and `tasks/leaf/apiExtractorTask.ts`

**DeclarativeTask** (`tasks/leaf/declarativeTask.ts`):
- Generic incremental task using `files` configuration from task definitions
- Uses `inputGlobs` and `outputGlobs` to track dependencies
- Honors gitignore settings for file matching

**File Hash Cache** (`fluidBuild/fileHashCache.ts`):
- Caches file content hashes within a build to avoid re-reading files
- Used across all incremental detection mechanisms

### Task Definition System

Task definitions live in two places:

1. **Global definitions**: Root `fluidBuild.config.cjs` under `tasks` property applies to all packages
2. **Package augmentations**: `fluidBuild.tasks` in individual `package.json` files

The system merges these with special syntax:
- `"..."` in package definition = include dependencies from global definition
- Dependencies support: `"task"` (same package), `"^task"` (all dependent packages), `"package#task"` (specific package)
- Ordering: `before: ["*"]`, `after: ["task"]`
- Non-script tasks: `script: false` (no npm script execution)

See `fluidTaskDefinitions.ts` for the full definition schema and merging logic.

### Parallel Execution

`fluid-build` uses the `async` library's `PriorityQueue` to execute tasks:
- Tasks queue when all dependencies complete
- Concurrency defaults to number of CPUs (configurable with `--concurrency`)
- Task weight determines priority (higher weight = higher priority)
- Weight calculated from number of dependent tasks (more dependents = higher priority)

Worker mode (`--worker` flag):
- Reuses worker processes instead of spawning new ones (~29% faster)
- Experimental, increases memory usage significantly
- Workers implemented in `tasks/workers/`

## Directory Structure

```
src/
├── fluidBuild/              # Core fluid-build scheduler
│   ├── tasks/               # Task implementations
│   │   ├── leaf/            # Executable tasks (tsc, eslint, webpack, etc.)
│   │   └── workers/         # Worker pool for --worker mode
│   ├── fluidTsc/            # TypeScript compilation utilities
│   ├── buildGraph.ts        # Build graph construction (BuildPackage, task creation)
│   ├── fluidTaskDefinitions.ts  # Task definition schema and merging
│   ├── fluidRepo.ts         # Repository structure representation
│   ├── tscUtils.ts          # TypeScript API utilities
│   └── options.ts           # CLI option parsing
├── common/                  # Shared utilities
│   ├── npmPackage.ts        # Package abstraction
│   ├── monoRepo.ts          # Release group/workspace abstraction
│   ├── gitRepo.ts           # Git operations
│   ├── biomeConfig.ts       # Biome configuration utilities
│   ├── typeTests.ts         # Type test utilities
│   └── utils.ts             # General utilities (exec, file operations)
└── test/                    # Tests (compile to dist/test/)
```

## Debugging

### Debug Traces

Use the `DEBUG` environment variable with the `debug` package:

```bash
# All fluid-build traces
DEBUG=fluid-build:* fluid-build

# Specific trace categories
DEBUG=fluid-build:init fluid-build              # Package loading and selection
DEBUG=fluid-build:task:definition fluid-build   # Task definition resolution
DEBUG=fluid-build:task:init fluid-build         # Task creation
DEBUG=fluid-build:task:init:dep fluid-build     # Task dependencies
DEBUG=fluid-build:task:trigger fluid-build      # Why tasks run (incremental)
DEBUG=fluid-build:task:exec fluid-build         # Task execution
DEBUG=fluid-build:task:queue fluid-build        # Task queueing
DEBUG=fluid-build:graph fluid-build             # Build graph construction
```

### VS Code Debugging

- Entry points are in `bin/` scripts (e.g., `bin/fluid-build`)
- Scripts require compiled output from `dist/`
- Set breakpoints in `dist/` JavaScript files after building
- For `.vscode/launch.json` configurations, see root workspace

## Important Implementation Details

### Entry Points

- **`bin/fluid-build`**: Calls `dist/fluidBuild/fluidBuild.js` (compiled from `src/fluidBuild/fluidBuild.ts`)
- **`bin/fluid-type-test-generator`**: Type test generation entry (if exists)
- **`bin/fluid-tsc`**: TypeScript wrapper with fluid-build enhancements (if exists)

### Task Executable Mapping

The `executableToLeafTask` object in `tasks/taskFactory.ts` maps command executables to specialized task handlers:
- `tsc` → `TscTask` (with incremental build info)
- `eslint` → `EsLintTask` (tsc-dependent)
- `webpack` → `WebpackTask`
- `api-extractor` → `ApiExtractorTask` (tsc-dependent)
- `biome check` → `BiomeTask`
- Unknown executables → `UnknownLeafTask` (basic execution)

### Exported API

The package exports types and utilities for other tools (see `src/index.ts`):
- `FluidRepo`, `Package`, `MonoRepo`: Repository abstractions
- Task definition utilities: `getTaskDefinitions`, `normalizeGlobalTaskDefinitions`
- Type compatibility types: `TypeOnly`, `MinimalType`, `FullType`, etc.
- TypeScript utilities: `TscUtils` namespace

These exports support `build-cli` commands and policy checking tools.

## Testing Patterns

- Tests use Mocha with Node.js `assert`
- Test data fixtures in `src/test/data/`
- Tests must be built before running (TypeScript → JavaScript)
- Use `@types/mocha` for test types
- Integration tests may reference actual package structures
