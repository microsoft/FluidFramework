# Migration Plan: fluid-build → Nx (Shadow Build System)

## Problem Statement

The FluidFramework monorepo (~205 packages across 14 release groups) uses a custom build orchestrator called **fluid-build** (`@fluidframework/build-tools`). While fluid-build is well-integrated, it is a bespoke tool that requires ongoing maintenance and lacks the broader ecosystem, plugin support, caching infrastructure, and community tooling of established build systems.

The goal is to migrate to **Nx** as the primary build orchestrator. Because fluid-build is deeply embedded in CI/CD, developer workflows, and package scripts, this must be done incrementally via a **shadow build system** — Nx runs alongside fluid-build, proving equivalence before fluid-build is removed.

## Current State Analysis

### fluid-build Architecture
- **Source**: `build-tools/packages/build-tools/src/fluidBuild/`
- **Entry point**: `bin/fluid-build` → `fluidBuild.ts`
- **Core concepts**:
  - `BuildGraph` — constructs a DAG of tasks across packages
  - `FluidRepoBuild` — discovers packages via pnpm workspaces
  - `TaskFactory` — creates leaf tasks (tsc, webpack, eslint, api-extractor, biome, prettier, etc.)
  - `fluidBuild.config.cjs` — defines task dependency graph (similar to Nx's `targetDefaults`)
  - `^task` prefix — cross-package dependency (equivalent to Nx `dependsOn: [{ projects: "dependencies" }]`)
  - `script: false` — virtual/aggregate tasks (equivalent to Nx composite targets)
  - Incremental builds via file hash caching (`FileHashCache`)
  - Worker pool for parallel execution

### Task Graph (from `fluidBuild.config.cjs`)
```
build → compile, lint, build:api-reports, build:docs, build:manifest, build:readme, check:format
compile → commonjs, build:esnext, build:test, build:copy
commonjs → tsc, build:test
tsc → ^tsc, ^api, build:genver, ts2esm
lint → eslint, good-fences, depcruise, check:exports, check:release-tags
```

### Related Tool: flub (build-cli)
- **Source**: `build-tools/packages/build-cli/`
- CLI tool for release management, code generation, policy checks
- Shares config with fluid-build (`fluidBuild.config.cjs`)
- Not a build orchestrator — handles entrypoint generation, version bumping, changeset management

### Repo Structure
- **Package manager**: pnpm with workspaces
- **Workspaces**: client (root), build-tools, server/routerlicious, server/gitrest, server/historian, plus ~9 independent packages
- **CI/CD**: GitHub Actions (PR validation) + Azure Pipelines (builds/releases)
- **Package scripts**: All packages use `fluid-build . --task <name>` or `fluid-build --task <name>` as their build entry point

### Key fluid-build Features to Map to Nx

| fluid-build Feature | Nx Equivalent |
|---|---|
| `fluidBuild.config.cjs` tasks | `nx.json` `targetDefaults` |
| `^task` (cross-package dep) | `dependsOn: [{ projects: "dependencies", target: "..." }]` |
| `script: false` (virtual task) | Composite target or `nx:noop` executor |
| `FileHashCache` (incremental) | Nx computation cache (local + remote) |
| `--worker` (parallel exec) | Nx parallel execution (built-in) |
| Package filtering (`--match`) | `nx run-many --projects=...` or `nx affected` |
| `declarativeTasks` (glob-based) | Nx `inputs`/`outputs` configuration |
| Release groups | Nx project groups or tags |
| Layer enforcement | Nx module boundary rules (`@nx/enforce-module-boundaries`) |

---

## Migration Strategy: Shadow Build System

### Guiding Principles

1. **Zero disruption** — fluid-build continues to be the primary build system until Nx is proven equivalent
2. **Incremental adoption** — Nx configuration is added alongside existing configs; no removal of fluid-build until ready
3. **Pilot-first** — start with the `build-tools` workspace (6 packages) as a proving ground before expanding to the larger `client` workspace (~150 packages)
4. **Parity verification** — automated checks confirm Nx produces identical build outputs
5. **Developer opt-in** — developers can choose to use Nx commands early, but aren't required to until cutover
6. **CI dual-run period** — CI runs both systems in parallel during verification phase
7. **Run-commands executor** — use `nx:run-commands` to call existing npm scripts rather than Nx-native executors, minimizing disruption during the shadow period
8. **Local caching only** — start with Nx local file cache; Nx Cloud / remote caching is a future evaluation

### Phase 0: Foundation — Nx Bootstrap (build-tools Pilot)

**Goal**: Install Nx and set up a shadow build system targeting the `build-tools` workspace (6 packages) as the initial pilot.

The `build-tools` workspace is ideal because:
- Only 6 packages (manageable scope)
- Packages are well-understood by the team (they build the build tools themselves)
- Has its own `pnpm-workspace.yaml` and independent release group
- Uses the same patterns (tsc, eslint, biome) as the larger client workspace

#### Tasks:

1. **Install Nx core packages** in the `build-tools/` workspace:
   - `nx` (core)
   - `@nx/js` (TypeScript/JavaScript support)
   - `@nx/workspace` (workspace utilities)
   - Add as `devDependencies` in `build-tools/package.json`
   - Note: install in the pilot workspace only, not the repo root, to isolate the experiment

2. **Create `build-tools/nx.json`** with:
   - `targetDefaults` — translate the relevant subset of `fluidBuild.config.cjs` task graph for the build-tools packages:
     ```json
     {
       "$schema": "./node_modules/nx/schemas/nx-schema.json",
       "affected": { "defaultBase": "main" },
       "namedInputs": {
         "source": ["{projectRoot}/src/**/*.ts", "{projectRoot}/tsconfig.json"],
         "config": ["{projectRoot}/package.json", "{projectRoot}/tsconfig*.json"],
         "all": ["source", "config"]
       },
       "targetDefaults": {
         "tsc": {
           "dependsOn": ["^tsc"],
           "inputs": ["source"],
           "outputs": ["{projectRoot}/dist", "{projectRoot}/lib"],
           "cache": true
         },
         "build:compile": {
           "dependsOn": ["tsc"]
         },
         "compile": {
           "dependsOn": ["build:compile"]
         },
         "build": {
           "dependsOn": ["compile", "lint"]
         },
         "lint": {
           "dependsOn": ["eslint"]
         },
         "eslint": {
           "dependsOn": ["compile"],
           "inputs": ["source"],
           "cache": true
         },
         "test": {
           "dependsOn": ["compile"],
           "inputs": ["source", "{projectRoot}/src/test/**"],
           "cache": true
         }
       },
       "cacheDirectory": ".nx/cache"
     }
     ```
   - `namedInputs` for common file patterns
   - Enable `nx affected` with `defaultBase: "main"`

3. **Auto-detect projects** — Nx natively supports pnpm workspaces. The 6 build-tools packages will be auto-discovered. Verify with `npx nx show projects`.

4. **Create `build-tools/.nxignore`** to exclude non-project directories.

5. **Add shadow scripts** to `build-tools/package.json`:
   ```json
   {
     "nx:build": "nx run-many --target=build",
     "nx:compile": "nx run-many --target=compile",
     "nx:lint": "nx run-many --target=lint",
     "nx:affected:build": "nx affected --target=build"
   }
   ```

6. **Add `.nx/` to `build-tools/.gitignore`**.

7. **Validate**: Run `npx nx graph` inside `build-tools/` to visualize the dependency graph. Compare to fluid-build's graph for the same packages.

#### Deliverables:
- `build-tools/nx.json` with target defaults for build-tools packages
- `build-tools/.nxignore`
- Shadow npm scripts in `build-tools/package.json`
- `.gitignore` update for `.nx/`

---

### Phase 1: Parity Verification (build-tools Pilot)

**Goal**: Prove that Nx produces identical build results to fluid-build for the 6 build-tools packages.

#### Tasks:

1. **Write a parity test script** (`build-tools/scripts/nx-parity-check.js`):
   - Runs `fluid-build --task build --printOnly` to get the fluid-build task execution order
   - Runs `nx run-many --target=build --dry-run` for the Nx equivalent
   - Compares the two graphs for:
     - Same set of tasks per package
     - Same dependency ordering
     - No missing or extra tasks

2. **Handle virtual/aggregate tasks**:
   - fluid-build's `script: false` tasks (like `compile`, `build`, `lint`) are logical groupings
   - In Nx, model these as targets with only `dependsOn` and no executor (or use `nx:noop`)
   - Verify that packages without a given script still get handled correctly

3. **Verify build output parity**:
   - Run full build with fluid-build, capture file hashes of all outputs
   - Clean, run full build with Nx, capture file hashes
   - Diff the output hashes — they should be identical
   - Automate this comparison

4. **Verify cache correctness**:
   - Run Nx build twice, confirm second run is fully cached (instant)
   - Modify a single file in one package, confirm only affected packages rebuild
   - Compare outputs after cached vs uncached builds

5. **Capture timing metrics**:
   - Cold build time: fluid-build vs Nx
   - Warm/cached build time: fluid-build vs Nx
   - Single-package rebuild time

#### Deliverables:
- Parity test script
- Build output comparison report
- Cache verification results
- Timing comparison

---

### Phase 2: Expand to Client Workspace

**Goal**: Apply the proven Nx configuration pattern to the main `client` workspace (~150 packages).

#### Tasks:

1. **Move Nx installation to repo root**:
   - Add `nx`, `@nx/js`, `@nx/workspace` as devDependencies in root `package.json`
   - Create root `nx.json` with the full `fluidBuild.config.cjs` task graph translated to `targetDefaults`
   - Configure to discover all pnpm workspace packages

2. **Translate the full task graph**:
   - Map ALL tasks from `fluidBuild.config.cjs` to `nx.json` `targetDefaults`:
     - `tsc` → `dependsOn: ["^tsc", "^api", "build:genver", "ts2esm"]`
     - `build:esnext` → `dependsOn: ["^tsc", "^api", "build:genver", "ts2esm", "^build:esnext"]`
     - `compile` → `dependsOn: ["commonjs", "build:esnext", "build:test", "build:copy"]`
     - `build` → `dependsOn: ["check:format", "compile", "lint", "build:api-reports", "build:docs", "build:manifest", "build:readme"]`
     - `lint` → `dependsOn: ["eslint", "good-fences", "depcruise", "check:exports", "check:release-tags"]`
     - All other tasks from the config
   - Handle `^task` prefix → Nx `{ projects: "dependencies", target: "..." }` syntax

3. **Map `declarativeTasks`** to Nx `inputs`/`outputs`:
   - fluid-build's `declarativeTasks` define input/output globs for custom commands (e.g., `jssm-viz`, `markdown-magic`, `flub check buildversion`)
   - Translate these to Nx target `inputs` and `outputs` arrays for proper caching

4. **Release group tagging**:
   - Add Nx project tags matching release groups: `"tags": ["release-group:client"]`, `"release-group:build-tools"`, etc.
   - Enable filtering: `nx run-many --target=build --projects=tag:release-group:client`

5. **Handle the `before` directive** (`clean: { before: ["*"] }`):
   - Model `clean` as a separate explicit target, not an automatic dependency

6. **Create `project.json` files only where needed**:
   - Start with Nx's `package.json` inference (zero project.json files)
   - Add `project.json` only for packages that need custom inputs/outputs or special configuration

7. **Run parity verification** at full repo scale:
   - Adapt the parity script from Phase 1 to cover all ~205 packages
   - Compare task graphs and build outputs

8. **Add root shadow scripts**:
   ```json
   {
     "nx:build": "nx run-many --target=build",
     "nx:compile": "nx run-many --target=compile",
     "nx:lint": "nx run-many --target=lint",
     "nx:affected:build": "nx affected --target=build"
   }
   ```

#### Deliverables:
- Root `nx.json` with complete target defaults
- Root `.nxignore`
- Root shadow scripts
- Full parity verification report
- Any required `project.json` overrides

---

### Phase 3: CI Integration — Shadow Pipeline

**Goal**: Run Nx alongside fluid-build in CI to validate parity under real conditions.

#### Tasks:

1. **Add Nx shadow step to PR validation**:
   - After the existing fluid-build CI step, add a step that runs the same build via Nx
   - Compare exit codes and build outputs
   - Initially: allow Nx failures (non-blocking)
   - Over time: promote to required check

2. **Use `nx affected`** for PR builds:
   - Configure `defaultBase` to compare against the PR target branch
   - Run `nx affected --target=build` to build only changed packages
   - Compare against fluid-build's equivalent filtering

3. **Capture metrics**:
   - Build time (fluid-build vs Nx)
   - Cache hit rates
   - Number of tasks executed
   - Memory usage

4. **Establish a dashboard** or CI artifact comparing the two systems over time.

#### Deliverables:
- CI workflow additions (GitHub Actions or Azure Pipelines)
- Metrics collection
- Non-blocking Nx validation step

---

### Phase 4: Developer Experience — Nx Commands for Daily Use

**Goal**: Give developers Nx commands they can use for faster local builds.

#### Tasks:

1. **Documentation** — developer guide (`docs/nx-migration.md`):
   - `npx nx build <package>` — build a single package
   - `npx nx affected --target=build` — build only what changed
   - `npx nx graph` — visualize dependencies
   - `npx nx run-many --target=test --projects=tag:release-group:client`

2. **VS Code integration**:
   - Recommend Nx Console extension
   - Ensure `project.json` / `nx.json` are properly detected

3. **Layer enforcement migration** (optional at this phase):
   - Translate `layerInfo.json` rules to `@nx/enforce-module-boundaries`
   - This can coexist with the existing `flub check layers` command

#### Deliverables:
- Developer documentation
- VS Code recommendations
- Module boundary rules (optional)

---

### Phase 5: Cutover — Replace fluid-build with Nx

**Goal**: Once parity is proven and Nx is stable, remove fluid-build as the primary orchestrator.

#### Tasks:

1. **Update all package scripts**:
   - Replace `fluid-build . --task <name>` with direct script calls (tsc, eslint, etc.) since Nx orchestrates them
   - Root scripts switch from `fluid-build --task <name>` to `nx run-many --target=<name>`

2. **Update CI pipelines**:
   - Replace fluid-build invocations with Nx
   - Evaluate remote caching (Nx Cloud or self-hosted) at this point

3. **Deprecate fluid-build orchestrator**:
   - Mark `@fluidframework/build-tools` fluid-build binary as deprecated
   - Keep `flub` (build-cli) — it handles release management, not build orchestration
   - Migrate task definitions from `fluidBuild.config.cjs` to `nx.json` (or keep both if flub still reads them)
   - Keep `_buildProject.config.cjs` (used by flub for release groups)

4. **Clean up**:
   - Remove shadow scripts (`nx:*` prefixed)
   - Rename Nx scripts to primary names
   - Remove parity test script
   - Update all developer documentation

#### Deliverables:
- All packages orchestrated by Nx
- fluid-build removed from build path
- CI fully on Nx
- Updated documentation

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Nx task graph doesn't match fluid-build | Parity test script catches discrepancies; both systems run in CI |
| Nx caching produces stale results | Conservative `inputs` configuration; cache verification tests |
| flub depends on fluid-build internals | flub uses shared config types but doesn't use fluid-build's orchestration — verify independence |
| Developer confusion with two systems | Clear documentation; shadow commands use `nx:` prefix; no forced migration until cutover |
| Performance regression | Metrics comparison in CI; Nx generally faster due to caching |
| Breaking existing CI pipelines | Shadow pipeline is non-blocking initially; cutover only after sustained parity |

## Key Technical Decisions

1. **Pilot workspace**: Start with `build-tools` (6 packages) to prove the approach before expanding to the full `client` workspace (~150 packages). This limits blast radius and allows rapid iteration.

2. **Project inference vs explicit `project.json`**: Start with Nx's automatic pnpm workspace inference. Only add `project.json` files for packages needing custom configuration.

3. **Task executor strategy**: Use `nx:run-commands` executor (calls existing npm scripts) rather than specialized executors (like `@nx/js:tsc`). This minimizes change and maintains compatibility with fluid-build during the shadow period.

4. **Workspace layout**: Nx will initially cover only `build-tools`, then expand to the entire repo. Release group scoping is handled via tags and project filters.

5. **flub compatibility**: flub continues to use `_buildProject.config.cjs` and `fluidBuild.config.cjs` for release group and policy information. The task definitions in `fluidBuild.config.cjs` can be kept even after Nx takes over orchestration, or they can be migrated to `nx.json` with flub updated to read from there.

6. **Caching**: Local caching only (`cacheDirectory: ".nx/cache"`). Nx Cloud / remote caching is a future evaluation after local caching is proven.

## Files to Create/Modify

### Phase 0-1 (build-tools pilot)

| File | Action | Purpose |
|---|---|---|
| `build-tools/nx.json` | Create | Nx workspace config for pilot |
| `build-tools/.nxignore` | Create | Exclude non-project directories |
| `build-tools/package.json` | Modify | Add Nx devDependencies + shadow scripts |
| `build-tools/.gitignore` | Modify | Add `.nx/` cache directory |
| `build-tools/scripts/nx-parity-check.js` | Create | Task graph comparison script |

### Phase 2+ (full repo expansion)

| File | Action | Purpose |
|---|---|---|
| `nx.json` | Create | Root Nx workspace configuration |
| `.nxignore` | Create | Exclude non-project directories |
| `package.json` (root) | Modify | Add Nx devDependencies + shadow scripts |
| `.gitignore` | Modify | Add `.nx/` cache directory |
| `scripts/nx-parity-check.js` | Create | Full task graph comparison script |
| `docs/nx-migration.md` | Create | Developer documentation |
| Per-package `project.json` | Create (as needed) | Custom Nx target config |

## Out of Scope

- Migrating flub (build-cli) to use Nx APIs — flub handles release management, not build orchestration
- Changing individual package build tools (tsc, webpack, eslint) — Nx orchestrates these, doesn't replace them
- Nx Cloud setup — evaluate after local caching is proven
- Changing the pnpm workspace structure or release groups
