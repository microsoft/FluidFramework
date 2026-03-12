# Standing Up a Shadow NX Build in a FluidFramework Release Group

## Context

This prompt guides setting up NX as a **shadow build system** alongside the existing fluid-build orchestrator in a FluidFramework release group. The shadow build lets us validate NX's task graph, caching, and affected analysis without disrupting existing workflows. fluid-build remains the primary build system; NX runs in parallel as a read-only shadow.

This was first done in the **build-tools** release group (5 packages) and this document captures the lessons learned for applying the same pattern to larger release groups like **client** (~90 packages).

## Key Constraint

**NX must never invoke fluid-build.** Many package.json scripts (e.g., `build`, `compile`, `build:compile`) call `fluid-build --task <name>`, which triggers its own dependency resolution and upstream task execution. If NX runs these scripts, it causes redundant/conflicting multi-package builds. NX must either run the actual leaf command directly or noop for orchestrator-only tasks.

## Step-by-Step Process

### Step 1: Classify Every Task as Orchestrator or Executor

This is the foundational step. Every task in the fluid-build task graph falls into one of two categories, and the entire NX configuration depends on getting this classification right.

#### Orchestrator tasks

Orchestrator tasks only exist to fan out to other tasks via `dependsOn`. They do no work themselves. In NX, these must use the `nx:noop` executor to prevent NX from running their npm scripts (which would invoke fluid-build).

**How to identify orchestrators — check all three sources:**

1. **`fluidBuild.config.cjs` (repo root)** — Tasks with `script: false` are explicitly marked as orchestrators:
   ```js
   "build": {
     dependsOn: ["compile", "lint", "build:docs", ...],
     script: false,  // ← orchestrator
   },
   ```

2. **Release group root `package.json` `fluidBuild.tasks`** — Same pattern, `script: false`:
   ```json
   "fluidBuild": {
     "tasks": {
       "build": {
         "dependsOn": ["^build", "generate:packageList"],
         "script": false
       }
     }
   }
   ```

3. **Individual package.json scripts** — Even without explicit `script: false`, a script is effectively an orchestrator if it just calls fluid-build or delegates to another npm script:
   ```json
   "build": "fluid-build --task build",          // ← calls fluid-build → orchestrator
   "compile": "fluid-build . --task compile",     // ← calls fluid-build → orchestrator
   "lint": "npm run eslint",                      // ← just delegates → orchestrator
   "build:commonjs": "npm run tsc && npm run build:test"  // ← just delegates → orchestrator
   ```

4. **Scripts using `concurrently`** — A script that uses `concurrently` to fan out to sub-scripts is also an orchestrator. These are easy to miss because they look like they do real work, but they actually just delegate:
   ```json
   "check:exports": "concurrently \"npm:check:exports:*\"",   // ← fans out → orchestrator
   "build:api-reports": "concurrently \"npm:build:api-reports:*\"",  // ← fans out → orchestrator
   "build:test": "concurrently npm:build:test:mocha npm:build:test:jest npm:build:test:types"  // ← fans out → orchestrator
   ```

   **Important:** When a `concurrently` script fans out to sub-scripts, those sub-scripts are the real executors. Each sub-script may have its own dependency requirements (defined in `fluidBuild.tasks`). If the sub-scripts are not defined as separate NX targets with their own `dependsOn`, their prerequisites may not be met. See "Per-package overrides" below.

#### Executor tasks (leaf tasks)

Executor tasks do actual work — they run tsc, eslint, mocha, api-extractor, copyfiles, etc. These are the tasks NX should run via the default `nx:run-script` executor.

**How to identify executors:**

1. **`fluidBuild.config.cjs`** — Tasks with `script: true` or tasks defined as bare arrays (shorthand syntax):
   ```js
   "tsc": tscDependsOn,                           // ← array shorthand → executor
   "build:esnext": [...tscDependsOn, "^build:esnext"],  // ← array shorthand → executor
   "api-extractor:esnext": {
     dependsOn: ["build:esnext"],
     script: true,                                 // ← explicit executor
   },
   "build:copy": [],                               // ← array shorthand → executor
   ```

2. **Package.json scripts** — Scripts that run actual tools:
   ```json
   "tsc": "tsc",                                   // ← runs tsc directly → executor
   "build:esnext": "tsc --project ./tsconfig.json", // ← runs tsc directly → executor
   "eslint": "eslint --format stylish src",         // ← runs eslint directly → executor
   "build:test": "tsc --project ./src/test/tsconfig.json",  // ← executor
   "test:mocha": "mocha --recursive lib/test",      // ← executor
   "build:docs": "api-extractor run --local",       // ← executor
   "clean": "rimraf --glob dist lib ...",            // ← executor
   ```

#### Complete task classification for the client release group

From `fluidBuild.config.cjs`:

**Orchestrators** (`script: false`):
| Task | dependsOn |
|------|-----------|
| `ci:build` | compile, lint, ci:build:api-reports, ci:build:docs, build:manifest, build:readme |
| `full` | build, webpack |
| `build` | check:format, compile, lint, build:api-reports, build:docs, build:manifest, build:readme |
| `compile` | commonjs, build:esnext, api, build:test, build:copy |
| `commonjs` | tsc, build:test |
| `lint` | eslint, good-fences, depcruise, check:exports, check:release-tags |
| `checks` | check:format |
| `checks:fix` | (empty) |
| `api` | api-extractor:commonjs, api-extractor:esnext |
| `test:cjs` | test:unit:cjs |
| `test:esm` | test:unit:esm |
| `test:unit` | test:mocha, test:jest |
| `test:unit:cjs` | test:mocha:cjs |
| `test:unit:esm` | test:mocha:esm |
| `build:full` | full |
| `build:compile` | compile |
| `build:commonjs` | commonjs |

**Executors** (do real work):
| Task | dependsOn | Notes |
|------|-----------|-------|
| `tsc` | ^tsc, ^api, build:genver, ts2esm | TypeScript compilation |
| `build:esnext` | ^tsc, ^api, build:genver, ts2esm, ^build:esnext | ESNext build |
| `build:test` | typetests:gen, tsc, api-extractor:commonjs, api-extractor:esnext | Test compilation |
| `build:test:cjs` | typetests:gen, tsc, api-extractor:commonjs | CJS test compilation |
| `build:test:esm` | typetests:gen, build:esnext, api-extractor:esnext | ESM test compilation |
| `api-extractor:commonjs` | tsc | API extraction (CJS) |
| `api-extractor:esnext` | build:esnext | API extraction (ESM), `script: true` |
| `build:api-reports:current` | api-extractor:esnext | API report generation |
| `build:api-reports:legacy` | api-extractor:esnext | API report generation |
| `ci:build:api-reports:current` | api-extractor:esnext | CI API reports |
| `ci:build:api-reports:legacy` | api-extractor:esnext | CI API reports |
| `build:docs` | tsc, build:esnext | API documentation |
| `ci:build:docs` | tsc, build:esnext | CI documentation |
| `build:readme` | compile | `script: true` |
| `build:manifest` | compile | `script: true` |
| `build:copy` | (empty) | File copying |
| `build:genver` | (empty) | Version generation |
| `layerGeneration:gen` | (empty) | Layer generation |
| `typetests:gen` | (empty) | Type test generation |
| `ts2esm` | (empty) | ESM conversion |
| `eslint` | compile, build:test:esm | Linting |
| `eslint:fix` | compile, build:test:esm | Lint fixing |
| `good-fences` | (empty) | Dependency boundary checks |
| `depcruise` | (empty) | Dependency cruiser |
| `check:exports` | api | Export validation |
| `check:exports:bundle-release-tags` | build:esnext | Release tag checks |
| `check:release-tags` | tsc, build:esnext | Release tag validation |
| `check:are-the-types-wrong` | tsc, build:esnext, api | Type checking |
| `check:format` | (empty) | `script: true` |
| `format` | (empty) | `script: true` |
| `check:biome` | (empty) | Biome formatting check |
| `check:prettier` | (empty) | Prettier check |
| `format:biome` | (empty) | Biome formatting |
| `format:prettier` | (empty) | Prettier formatting |
| `prettier` | (empty) | Prettier |
| `prettier:fix` | (empty) | Prettier fix |
| `webpack` | ^tsc, ^build:esnext | Bundling |
| `webpack:profile` | ^tsc, ^build:esnext | Bundle profiling |
| `clean` | before: * | Cleanup |
| `test:jest` | build:compile | Jest tests |
| `test:mocha` | build:test | Mocha tests |
| `test:mocha:cjs` | build:test:cjs | CJS Mocha tests |
| `test:mocha:esm` | build:test:esm | ESM Mocha tests |

#### Per-package overrides (critical for correctness)

Some packages have custom `fluidBuild.tasks` in their own `package.json` that add or modify task dependencies. **These must be checked and reflected in each package's `project.json`**, otherwise NX will run tasks with missing prerequisites.

**How to find them:** Search for `"fluidBuild"` in all package.json files:
```bash
grep -rl '"fluidBuild"' packages/*/package.json
```

**What to look for:** Per-package `fluidBuild.tasks` entries define custom `dependsOn` relationships that differ from the global `targetDefaults`. Common patterns:

1. **Custom entrypoint generation scripts** — Some packages use non-standard scripts instead of (or in addition to) `api-extractor:esnext`. For example, `@fluid-internal/client-utils` uses `build:exports:node` and `build:exports:browser` instead of `api-extractor:esnext` to generate entrypoints. These custom dependencies must be added to the package's `project.json`:

   fluid-build config in package.json:
   ```json
   "fluidBuild": {
     "tasks": {
       "check:exports:esm:node:current": ["build:exports:node"],
       "check:exports:esm:browser:current": ["build:exports:browser"]
     }
   }
   ```

   Required project.json override:
   ```json
   {
     "targets": {
       "check:exports": {
         "dependsOn": ["build:exports:node", "build:exports:browser"]
       }
     }
   }
   ```

2. **Cross-package task dependencies** — Some packages depend on specific tasks in other packages (using `pkg#task` syntax):
   ```json
   "build:test:cjs": ["...", "@fluidframework/id-compressor#build:test:cjs"]
   ```
   These translate to NX cross-project dependencies.

3. **Custom build step ordering** — Some packages override standard dependency chains (e.g., `ci:build:docs` depending on `build:esnext` directly instead of going through the standard `tsc → api-extractor → build:docs` chain).

**Validation approach:** For each package with `fluidBuild.tasks`, compare the fluid-build task dependencies against the NX `targetDefaults` in nx.json. Any dependency in `fluidBuild.tasks` that isn't already covered by `targetDefaults` needs a `project.json` override.

### Step 2: Determine Cache Inputs and Outputs for Executor Tasks

For NX caching to work, each executor task needs correct `inputs` (files that affect the result) and `outputs` (files the task produces). These are defined in `targetDefaults` in nx.json.

The source of truth for how fluid-build tracks these is in the leaf task implementations at `build-tools/packages/build-tools/src/fluidBuild/tasks/leaf/`. Each task handler class defines its own input/output file tracking. Additionally, `fluidBuild.config.cjs` at the repo root defines `declarativeTasks` with explicit `inputGlobs`/`outputGlobs` for some executables.

#### How fluid-build tracks files per task type

**TscTask** (`tscTask.ts`) — TypeScript compilation
- Inputs: Reads tsconfig.json to discover source files via `parsedCommandLine.fileNames`. Tracks tsconfig.json and *.tsbuildinfo for incremental builds. Does NOT use done-file caching — uses tsc's own incremental build info instead.
- Outputs: Determined by tsconfig `outDir` — typically `dist/` (CJS) or `lib/` (ESM).
- NX config:
  ```jsonc
  "tsc": {
    "inputs": ["production"],
    "outputs": ["{projectRoot}/dist", "{projectRoot}/lib", "{projectRoot}/*.tsbuildinfo"]
  }
  ```

**EsLintTask** (`lintTasks.ts`) — Linting (extends TscDependentTask)
- Inputs: Source files from command args, eslint config file (`.eslintrc.*`), dependent tsc build info, eslint tool version.
- Outputs: None (lint-only, no files produced).
- NX config:
  ```jsonc
  "eslint": {
    "inputs": ["source"],
    "outputs": []
  }
  ```

**ApiExtractorTask** (`apiExtractorTask.ts`) — API extraction (extends TscDependentTask)
- Inputs: `api-extractor.json` config, dependent tsc build info, api-extractor tool version.
- Outputs: API report files in `_api-extractor-temp/`, report files.
- NX config:
  ```jsonc
  "api-extractor:esnext": {
    "inputs": ["production", "{projectRoot}/api-extractor*.json"],
    "outputs": ["{projectRoot}/_api-extractor-temp"]
  }
  ```

**WebpackTask** (`webpackTask.ts`)
- Inputs: `src/**/*.*` (hardcoded), webpack config file (`webpack.config.js/cjs` or `--config` arg), webpack version.
- Outputs: Determined by webpack config (typically `dist/`).
- NX config:
  ```jsonc
  "webpack": {
    "inputs": ["source", "{projectRoot}/webpack.config.*"],
    "outputs": ["{projectRoot}/dist"]
  }
  ```

**BiomeTask** (`biomeTasks.ts`) — Formatting checks
- Inputs: Files matched by biome's `include` config, all biome config files (including `extends` chain). Uses content hashes.
- Outputs: Same files as input (formatting is in-place).
- NX config:
  ```jsonc
  "check:biome": {
    "inputs": ["source"],
    "outputs": []
  }
  ```

**PrettierTask** (`prettierTask.ts`)
- Inputs: Files from command args, `.prettierrc.json`, `.prettierignore`.
- Outputs: Same files as input (formatting is in-place).

**CopyfilesTask** (`miscTasks.ts`)
- Inputs: Source globs from command arguments.
- Outputs: Computed destination paths based on `-u` (up) flag and destination argument.

**TypeValidationTask** (`miscTasks.ts`)
- Inputs: `package.json`, prior package's `package.json`.
- Outputs: `src/test/types/**`.

**GoodFence** (`miscTasks.ts`)
- Inputs: `**/fence.json` + all `.ts` files in fenced directories.
- Outputs: None.

**DepCruiseTask** (`miscTasks.ts`)
- Inputs: Files/directories from command arguments (recursively expanded).
- Outputs: None.

**Ts2EsmTask** (`ts2EsmTask.ts`)
- Inputs: Files from tsconfig `files`/`include`.
- Outputs: Same as input (in-place transformation).

**GenVerTask** (`miscTasks.ts`)
- Inputs: `package.json` (checks name/version).
- Outputs: `src/packageVersion.ts`.
- Custom incremental check: compares package name/version against generated file content.

**GenerateEntrypointsTask** (`generateEntrypointsTask.ts`) — extends TscDependentTask
- Inputs: `package.json`, dependent tsc build info, `@fluid-tools/build-cli` tool version.
- Outputs: Generated entrypoint files.

**DeclarativeLeafTask** (`declarativeTask.ts`)
- Inputs/Outputs: Defined by `inputGlobs`/`outputGlobs` from task config (in `fluidBuild.config.cjs` `declarativeTasks` section or per-package `fluidBuild.tasks.*.files`). Uses content hashes.

#### Declarative task globs from fluidBuild.config.cjs

These are pre-configured glob patterns for specific executables:

| Executable | inputGlobs | outputGlobs |
|------------|------------|-------------|
| `oclif manifest` | `package.json`, `src/**` | `oclif.manifest.json` |
| `oclif readme` | `package.json`, `src/**` | `README.md`, `docs/**` |
| `jssm-viz` | `src/**/*.fsl` | `src/**/*.fsl.svg` |
| `syncpack lint-semver-ranges` | `syncpack.config.cjs`, `package.json`, workspace package.jsons | Same |
| `syncpack list-mismatches` | `syncpack.config.cjs`, `package.json`, workspace package.jsons | Same |

#### Mapping to NX namedInputs

Use NX `namedInputs` to create reusable input sets that mirror fluid-build's file tracking:

```jsonc
"namedInputs": {
  // Source files (matches what most fluid-build tasks track as inputs)
  "source": [
    "{projectRoot}/src/**/*.ts",
    "{projectRoot}/src/**/*.tsx",
    "{projectRoot}/src/**/*.js",
    "{projectRoot}/src/**/*.json"
  ],
  // Config files that affect builds
  "config": [
    "{projectRoot}/package.json",
    "{projectRoot}/tsconfig.json",
    "{projectRoot}/tsconfig*.json",
    "{projectRoot}/.eslintrc.*"
  ],
  // Production source (excludes test files)
  "production": [
    "source", "config",
    "!{projectRoot}/src/test/**",
    "!{projectRoot}/src/**/*.test.ts",
    "!{projectRoot}/src/**/*.spec.ts"
  ]
}
```

### Step 3: Install NX

Add NX as a dev dependency in the release group root `package.json`:

```bash
pnpm add -Dw nx
```

### Step 4: Create nx.json

Create `nx.json` at the release group root. This file defines:

- **namedInputs**: Reusable file glob sets for cache invalidation
- **targetDefaults**: Default configuration for each task name (dependencies, inputs, outputs, caching)

Translate the task graph from Step 1 into NX targetDefaults.

#### Translating fluid-build dependsOn to NX

fluid-build's `dependsOn` syntax maps directly to NX:
- `"^tsc"` → same in NX (run tsc in all dependency packages first)
- `"tsc"` → same in NX (run tsc in the same package first)
- `"..."` (inherit) → not needed in NX; targetDefaults handle inheritance automatically

#### targetDefaults structure

For **executor tasks**, define `dependsOn`, `inputs`, `outputs`, and `cache`:
```jsonc
"tsc": {
  "dependsOn": ["^tsc"],
  "inputs": ["production"],
  "outputs": ["{projectRoot}/dist", "{projectRoot}/lib", "{projectRoot}/*.tsbuildinfo"],
  "cache": true
}
```

For **orchestrator tasks**, define only `dependsOn` (no inputs/outputs/cache — they do nothing):
```jsonc
"compile": { "dependsOn": ["build:compile"] }
```

Note: Do NOT set `"executor": "nx:noop"` in targetDefaults — it will not override inferred targets from package.json scripts. The noop must come from project.json (see Step 4).

#### Example nx.json

```jsonc
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "affected": { "defaultBase": "main" },
  "namedInputs": {
    "source": [
      "{projectRoot}/src/**/*.ts",
      "{projectRoot}/src/**/*.tsx",
      "{projectRoot}/src/**/*.js",
      "{projectRoot}/src/**/*.json"
    ],
    "config": [
      "{projectRoot}/package.json",
      "{projectRoot}/tsconfig.json",
      "{projectRoot}/tsconfig*.json",
      "{projectRoot}/.eslintrc.*"
    ],
    "production": [
      "source", "config",
      "!{projectRoot}/src/test/**",
      "!{projectRoot}/src/**/*.test.ts",
      "!{projectRoot}/src/**/*.spec.ts"
    ]
  },
  "targetDefaults": {
    // --- Executor tasks (do real work) ---
    "tsc": {
      "dependsOn": ["^tsc"],
      "inputs": ["production"],
      "outputs": ["{projectRoot}/dist", "{projectRoot}/lib", "{projectRoot}/*.tsbuildinfo"],
      "cache": true
    },
    "build:esnext": {
      "dependsOn": ["^tsc", "^build:esnext"],
      "inputs": ["production"],
      "outputs": ["{projectRoot}/lib"],
      "cache": true
    },
    "build:test": {
      "dependsOn": ["tsc"],
      "inputs": ["source", "config"],
      "outputs": ["{projectRoot}/dist/test"],
      "cache": true
    },
    "eslint": {
      "dependsOn": ["compile"],
      "inputs": ["source"],
      "cache": true
    },
    "test:mocha": {
      "dependsOn": ["compile"],
      "inputs": ["source", "config"],
      "cache": true
    },
    // ... other executor tasks from the classification table

    // --- Orchestrator tasks (fan out only, noop'd via project.json) ---
    "compile": { "dependsOn": ["build:compile"] },
    "build:compile": { "dependsOn": ["tsc", "build:esnext", "build:test", "build:test:esm", "build:copy"] },
    "build": { "dependsOn": ["compile", "lint", "build:docs", "build:manifest", "build:readme"] },
    "lint": { "dependsOn": ["eslint"] },
    "build:commonjs": { "dependsOn": ["tsc", "build:test"] }
  },
  "cacheDirectory": ".nx/cache",
  "parallel": 3
}
```

### Step 5: Create project.json Files to Noop Orchestrator Tasks

**This is the critical step.** NX auto-infers targets from package.json scripts using the `nx:run-script` executor. When a package has `"build": "fluid-build --task build"`, NX will run that script — invoking fluid-build. We must override these with `nx:noop` in project.json files.

#### Why project.json (not targetDefaults)?

NX configuration merging has a strict precedence order:

1. **project.json targets** (highest priority — wins)
2. **Inferred targets from package.json scripts** (auto-created as `nx:run-script`)
3. **targetDefaults in nx.json** (lowest priority — merged into existing targets but **cannot override the executor**)

Setting `"executor": "nx:noop"` in `targetDefaults` alone **does not work** — the inferred `nx:run-script` executor takes precedence. `project.json` reliably overrides inference.

#### What goes in each project.json

For each package, create a `project.json` that noops every orchestrator task **that exists as an npm script in that package's package.json**. Only include targets that actually exist — don't noop scripts the package doesn't have.

#### Identifying which tasks need noop per package

Cross-reference the orchestrator list from Step 1 with each package's scripts. A script needs noop if:
- It is in the orchestrator list from Step 1, AND
- It exists as a script in the package's package.json

Additionally, check for scripts not in the global orchestrator list that still just delegate:
- Calls `fluid-build` (e.g., `"build": "fluid-build --task build"`)
- Just delegates to another npm script (e.g., `"lint": "npm run eslint"`)
- Chains npm scripts without adding work (e.g., `"build:commonjs": "npm run tsc && npm run build:test"`)

#### Automation approach for large release groups

For a release group with many packages, generate project.json files programmatically:

```python
import json, os, glob

# All orchestrator task names from Step 1
ORCHESTRATORS = {
    "build", "build:compile", "build:commonjs", "compile", "commonjs",
    "lint", "ci:build", "full", "build:full", "checks", "checks:fix",
    "api", "test:unit", "test:unit:cjs", "test:unit:esm",
    "test:cjs", "test:esm",
}

for pkg_json_path in sorted(glob.glob("packages/*/package.json")):
    with open(pkg_json_path) as f:
        pkg = json.load(f)

    scripts = pkg.get("scripts", {})
    noop_targets = {}

    for script_name, script_cmd in scripts.items():
        is_orchestrator = (
            script_name in ORCHESTRATORS
            or "fluid-build" in script_cmd
            or (script_cmd.startswith("npm run ") and "&&" not in script_cmd)
        )
        if is_orchestrator:
            noop_targets[script_name] = {"executor": "nx:noop"}

    if noop_targets:
        pkg_dir = os.path.dirname(pkg_json_path)
        # Calculate relative schema path
        depth = pkg_dir.count("/")
        schema_path = "../" * depth + "node_modules/nx/schemas/project-schema.json"

        project_json = {
            "$schema": schema_path,
            "targets": noop_targets,
        }
        with open(os.path.join(pkg_dir, "project.json"), "w") as f:
            json.dump(project_json, f, indent="\t")
            f.write("\n")
        print(f"Created {pkg_dir}/project.json with noops: {list(noop_targets.keys())}")
```

#### Example project.json

```json
{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "targets": {
    "build": { "executor": "nx:noop" },
    "build:compile": { "executor": "nx:noop" },
    "compile": { "executor": "nx:noop" },
    "lint": { "executor": "nx:noop" },
    "build:commonjs": { "executor": "nx:noop" }
  }
}
```

### Step 6: Add NX Convenience Scripts to Root package.json

Add scripts to the release group root `package.json` for running NX commands:

```json
{
  "scripts": {
    "nx:build": "nx run-many --target=build",
    "nx:compile": "nx run-many --target=compile",
    "nx:lint": "nx run-many --target=lint",
    "nx:tsc": "nx run-many --target=tsc",
    "nx:test": "nx run-many --target=test",
    "nx:affected:build": "nx affected --target=build",
    "nx:affected:compile": "nx affected --target=compile",
    "nx:affected:lint": "nx affected --target=lint",
    "nx:graph": "nx graph"
  }
}
```

### Step 7: Add .nx/cache to .gitignore

```
# NX
.nx/cache
```

### Step 8: Validate

#### 1. Verify no fluid-build invocations

```bash
npx nx run-many --target=build --dry-run 2>&1 | grep "fluid-build"
```

This should return **zero matches**. If any appear, identify the package and task, then add the appropriate `nx:noop` override to its `project.json`.

#### 2. Verify orchestrator tasks are noop

```bash
npx nx show project <package-name> --json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for name in ['build', 'build:compile', 'compile', 'lint']:
    t = data.get('targets', {}).get(name, {})
    executor = t.get('executor', 'NOT FOUND')
    expected = 'nx:noop'
    status = '✅' if executor == expected else '❌'
    print(f'{status} {name}: {executor}')
"
```

#### 3. Verify executor tasks still run real commands

```bash
npx nx show project <package-name> --json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for name in ['tsc', 'eslint', 'build:esnext', 'test:mocha']:
    t = data.get('targets', {}).get(name, {})
    executor = t.get('executor', 'NOT FOUND')
    expected = 'nx:run-script'
    status = '✅' if executor == expected else '❌'
    print(f'{status} {name}: {executor}')
"
```

#### 4. Verify task graph looks correct

```bash
npx nx graph
```

Open the visualization and spot-check that dependency edges match what fluid-build defines.

#### 5. Important: Reset NX cache when debugging

NX aggressively caches project graph configuration. When making changes to `nx.json` or `project.json` files, **always reset** before verifying:

```bash
npx nx reset
```

## Gotchas and Lessons Learned

1. **`targetDefaults` cannot override inferred executors.** This was the biggest surprise. Even setting `"executor": "nx:noop"` in `targetDefaults` is ignored when an npm script of the same name exists — NX infers `nx:run-script` and that takes priority. Only `project.json` reliably overrides.

2. **Always `npx nx reset` after config changes.** NX caches the project graph aggressively. Without a reset, you may be testing stale configuration and drawing wrong conclusions.

3. **Dry-run `grep "fluid-build"` is the definitive test.** Don't rely on `nx show project` alone — run the full dry-run and grep to catch any missed targets across all packages.

4. **Not all packages have the same scripts.** The noop list in each `project.json` must match only the orchestrator scripts that actually exist in that specific package's `package.json`. Generating these programmatically is essential at scale.
