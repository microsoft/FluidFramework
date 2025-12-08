# File Dependency Extension Example

This directory contains a practical example of how to use file dependency extension in fluid-build.

## Scenario

You have a custom code generation task that:
1. Reads template files from `src/templates/`
2. Uses a configuration file `codegen.config.json`
3. Generates TypeScript files in `generated/`

The global configuration defines the basic file dependencies, and individual packages can extend them to add package-specific inputs or outputs.

## Global Configuration (fluidBuild.config.cjs)

```javascript
module.exports = {
  tasks: {
    "codegen": {
      dependsOn: [],
      files: {
        inputGlobs: [
          "src/templates/**/*.hbs",
          "codegen.config.json"
        ],
        outputGlobs: [
          "generated/**/*.ts"
        ],
        gitignore: ["input"],      // Apply gitignore rules to inputs only
        includeLockFiles: true     // Include lock files as inputs
      }
    },
    "build": {
      dependsOn: ["codegen", "tsc"]
    }
  }
}
```

## Package-Level Extension (package.json)

### Example 1: Adding Extra Input Files

A package that needs additional configuration files:

```json
{
  "name": "@example/package-a",
  "scripts": {
    "codegen": "custom-codegen --config codegen.config.json"
  },
  "fluidBuild": {
    "tasks": {
      "codegen": {
        "dependsOn": ["..."],
        "files": {
          "inputGlobs": ["...", "extra-config.json", "schema/*.json"],
          "outputGlobs": ["..."]
        }
      }
    }
  }
}
```

Result: The task will track these inputs:
- `src/templates/**/*.hbs` (from global)
- `codegen.config.json` (from global)
- `extra-config.json` (added by package)
- `schema/*.json` (added by package)

### Example 2: Adding Extra Output Files

A package that generates additional files:

```json
{
  "name": "@example/package-b",
  "scripts": {
    "codegen": "custom-codegen --output generated --docs docs/generated"
  },
  "fluidBuild": {
    "tasks": {
      "codegen": {
        "dependsOn": ["..."],
        "files": {
          "inputGlobs": ["..."],
          "outputGlobs": ["...", "docs/generated/**/*.md"]
        }
      }
    }
  }
}
```

Result: The task will track these outputs:
- `generated/**/*.ts` (from global)
- `docs/generated/**/*.md` (added by package)

### Example 3: Completely Overriding File Dependencies

A package with entirely different file structure (no "..." means replace, not extend):

```json
{
  "name": "@example/package-c",
  "scripts": {
    "codegen": "different-tool --in lib/specs --out lib/generated"
  },
  "fluidBuild": {
    "tasks": {
      "codegen": {
        "dependsOn": ["..."],
        "files": {
          "inputGlobs": ["lib/specs/**/*.yaml"],
          "outputGlobs": ["lib/generated/**/*.ts"]
        }
      }
    }
  }
}
```

Result: The global file dependencies are completely replaced (no extension):
- Inputs: `lib/specs/**/*.yaml`
- Outputs: `lib/generated/**/*.ts`

## Benefits

1. **Incremental Builds**: Tasks only run when inputs change or outputs are missing
2. **DRY Principle**: Define common file patterns once globally, extend them per-package
3. **Flexibility**: Override completely when needed, extend when possible
4. **Maintainability**: Update common patterns in one place

## How It Works

When you run `fluid-build`:
1. It reads the global task definition from `fluidBuild.config.cjs`
2. For each package, it merges the package-level task definition with the global one
3. The "..." syntax in `inputGlobs` or `outputGlobs` expands to include the inherited values
4. Files matching the globs are hashed and compared to detect changes
5. Tasks are skipped if all inputs are unchanged and all outputs exist

This enables fast incremental builds without modifying task implementation code.
