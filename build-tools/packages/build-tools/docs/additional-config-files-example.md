# Additional Config Files - Practical Example

This document demonstrates how to use the `additionalConfigFiles` feature to track shared configuration files that affect task handlers like `eslint`, `tsc`, or `api-extractor`.

## Problem

You have a monorepo with:
- A shared ESLint config at `common/build/eslint-config-fluid/flat.mts` that all packages inherit from
- Package-specific `eslint.config.mts` files
- Packages at various depths in the directory structure (e.g., `packages/foo`, `packages/bar/baz`, etc.)

When you modify the shared config files, you want packages to automatically rebuild their `eslint` task to pick up the changes, but you don't want to hardcode different relative paths like `../../` or `../../../` for each package depth.

## Solution

Use `additionalConfigFiles` with the `${repoRoot}` token in the global task definition to track shared configs:

### Global Configuration (`fluidBuild.config.cjs`)

```javascript
module.exports = {
  version: 1,
  tasks: {
    "eslint": {
      files: {
        // Use ${repoRoot} token to reference files at the repository root
        // This works for all packages regardless of directory depth
        additionalConfigFiles: [
          "${repoRoot}/common/build/eslint-config-fluid/flat.mts"
        ]
      }
    }
  }
}
```

The `${repoRoot}` token will be replaced with the absolute path to the repository root, so you don't need to use relative paths like `../../` that vary by package depth.

### Package-Level Extension (`package.json`)

If a specific package needs to track additional config files, it can extend the global list:

```json
{
  "name": "@fluidframework/my-package",
  "scripts": {
    "eslint": "eslint --format stylish src"
  },
  "fluidBuild": {
    "tasks": {
      "eslint": {
        "files": {
          "additionalConfigFiles": [
            "...",
            ".eslintrc.local.json"
          ]
        }
      }
    }
  }
}
```

This package will track:
- `${repoRoot}/common/build/eslint-config-fluid/flat.mts` (from global, resolves to absolute path)
- `.eslintrc.local.json` (added by package, relative to package directory)
- Plus the `eslint.config.mts` file that the eslint task handler automatically discovers

### Package-Level Override

To completely replace the global configuration:

```json
{
  "fluidBuild": {
    "tasks": {
      "eslint": {
        "files": {
          "additionalConfigFiles": [
            "${repoRoot}/.eslintrc.special.json"
          ]
        }
      }
    }
  }
}
```

This package will ONLY track `${repoRoot}/.eslintrc.special.json` (no "..." means no inheritance).

## How It Works

1. The `EsLintTask` handler automatically discovers and tracks the package's `eslint.config.mts` file
2. The `additionalConfigFiles` property adds extra files to track
3. The `${repoRoot}` token is replaced with the absolute path to the repository root before resolving the path
4. When any tracked file changes, the task is marked as out-of-date and will re-run
5. File paths can be:
   - Relative to the package directory (e.g., `.eslintrc.local.json` or `../../config.json`)
   - Using the `${repoRoot}` token (e.g., `${repoRoot}/common/build/eslint-config-fluid/flat.mts`)

## Use Cases

### Tracking Root TypeScript Configs

```javascript
{
  "tasks": {
    "tsc": {
      "files": {
        "additionalConfigFiles": ["${repoRoot}/tsconfig.base.json"]
      }
    }
  }
}
```

### Tracking Shared API Extractor Configs

```javascript
{
  "tasks": {
    "api-extractor:commonjs": {
      "files": {
        "additionalConfigFiles": [
          "${repoRoot}/common/build/build-common/api-extractor-base.json",
          "${repoRoot}/common/build/build-common/api-extractor-lint.json"
        ]
      }
    }
  }
}
```

### Tracking Multiple Configs Per Task

```javascript
{
  "tasks": {
    "eslint": {
      "files": {
        "additionalConfigFiles": [
          "${repoRoot}/common/build/eslint-config-fluid/flat.mts",
          "${repoRoot}/common/build/eslint-config-fluid/index.js"
        ]
      }
    }
  }
}
```

## Supported Task Handlers

The `additionalConfigFiles` feature works with any task handler that extends `LeafWithFileStatDoneFileTask`, which includes most tasks in the fluid-build system:
- `EsLintTask` (eslint)
- `ApiExtractorTask` (api-extractor)
- `GenerateEntrypointsTask` (flub generate entrypoints)
- `BiomeTask` (biome check/format)
- `PrettierTask` (prettier)
- `Ts2EsmTask` (ts2esm)
- And other tasks that track input/output files

The feature can also be used with tasks extending `TscDependentTask`, which provides specialized config file tracking for TypeScript-based tools.

## Benefits

1. **Automatic Rebuilds**: Changes to shared configs trigger rebuilds automatically
2. **DRY Configuration**: Define shared configs once globally, extend per-package as needed
3. **No Code Changes**: No need to modify task handler implementations
4. **Incremental Builds**: Only affected packages rebuild when shared configs change
