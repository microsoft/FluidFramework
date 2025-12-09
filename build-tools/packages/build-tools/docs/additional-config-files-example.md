# Additional Config Files - Practical Example

This document demonstrates how to use the `additionalConfigFiles` feature to track shared configuration files that affect task handlers like `eslint`, `tsc`, or `api-extractor`.

## Problem

You have a monorepo with:
- A root-level `.eslintrc.cjs` that all packages inherit from
- A shared `common/eslint-config.json` that multiple packages use
- Package-specific `.eslintrc.json` files

When you modify the root or shared config files, you want packages to automatically rebuild their `eslint` task to pick up the changes.

## Solution

Use `additionalConfigFiles` in the global task definition to track these shared configs:

### Global Configuration (`fluidBuild.config.cjs`)

```javascript
module.exports = {
  version: 1,
  tasks: {
    "eslint": {
      dependsOn: ["..."],  // Inherit default dependencies
      files: {
        // Track the root eslint config and shared config relative to each package
        additionalConfigFiles: [
          "../../.eslintrc.cjs",
          "../../common/build/eslint-config.json"
        ]
      }
    }
  }
}
```

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
- `../../.eslintrc.cjs` (from global)
- `../../common/build/eslint-config.json` (from global)
- `.eslintrc.local.json` (added by package)
- Plus the `.eslintrc.*` file that eslint task handler automatically discovers

### Package-Level Override

To completely replace the global configuration:

```json
{
  "fluidBuild": {
    "tasks": {
      "eslint": {
        "files": {
          "additionalConfigFiles": [
            ".eslintrc.special.json"
          ]
        }
      }
    }
  }
}
```

This package will ONLY track `.eslintrc.special.json` (no "..." means no inheritance).

## How It Works

1. The `EsLintTask` handler automatically discovers and tracks the package's `.eslintrc.*` file
2. The `additionalConfigFiles` property adds extra files to track
3. When any tracked file changes, the task is marked as out-of-date and will re-run
4. File paths are relative to the package directory (use `../` to go up to parent directories)

## Use Cases

### Tracking Root TypeScript Configs

```javascript
{
  "tasks": {
    "tsc": {
      "files": {
        "additionalConfigFiles": ["../../tsconfig.base.json"]
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
          "../../api-extractor-base.json",
          "../../api-extractor-lint.json"
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
          "../../.eslintrc.cjs",
          "../../.eslintignore",
          "../../common/eslint-rules/custom-rules.json"
        ]
      }
    }
  }
}
```

## Supported Task Handlers

The `additionalConfigFiles` feature works with any task handler that extends `TscDependentTask`:
- `EsLintTask` (eslint)
- `TsLintTask` (tslint)
- `ApiExtractorTask` (api-extractor)
- `GenerateEntrypointsTask` (flub generate entrypoints)

## Benefits

1. **Automatic Rebuilds**: Changes to shared configs trigger rebuilds automatically
2. **DRY Configuration**: Define shared configs once globally, extend per-package as needed
3. **No Code Changes**: No need to modify task handler implementations
4. **Incremental Builds**: Only affected packages rebuild when shared configs change
