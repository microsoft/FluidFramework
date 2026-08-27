# Oxlint Migration Implementation Plan

**Goal:** Replace ESLint with type-aware Oxlint across Fluid Framework without losing enforced diagnostics, clean-build correctness, package-level incremental behavior, or developer and CI workflows.

**Architecture:** Introduce Oxlint as a package-scoped Fluid Build task that reuses the current type-aware lint prerequisite graph and runs `oxlint-tsgolint` once per package. Operate Oxlint and a deliberately shrinking ESLint compatibility pass in parallel until every enabled rule is mapped, tested, migrated, or explicitly retained; remove ESLint only after behavioral, performance, editor, CI, and independent-workspace gates pass.

**Tech Stack:** pnpm workspaces, Fluid Build, Oxlint, `oxlint-tsgolint`, ESLint 9 compatibility fallback, TypeScript/TypeScript-Go, JSON/JSONC Oxlint configuration, Node.js, Mocha, Azure Pipelines, GitHub Actions.

---

## Testing Plan

Testing must establish observable lint behavior rather than merely checking generated configuration objects.

1. Add black-box integration fixtures to `common/build/eslint-config-fluid` that run ESLint and Oxlint against real TypeScript files and compare normalized diagnostics for each migrated rule family. Fixtures must include valid and invalid code, production and test globs, JavaScript files, declaration files, CommonJS files, React files, ignored files, warning-only rules, and type-aware failures such as floating promises and unsafe `any` flows.
2. Add a type-awareness integration test that proves syntax-only Oxlint accepts a floating promise while `oxlint --type-aware` reports `typescript/no-floating-promises`. The test must also fail clearly when `oxlint-tsgolint` cannot be resolved.
3. Add Fluid Build integration tests for a new `OxlintTask`. Tests must execute a real temporary package and verify prerequisite ordering, config and tool-version invalidation, done-file creation only after success, `clean`/`--force` behavior, and `--nolint`/`--lintonly` classification.
4. Add a clean-tree Tree integration scenario: run `pnpm clean`, invoke the package-scoped Oxlint task, and confirm there are no unresolved workspace modules or missing generated declarations. This validates the graph boundary that the standalone benchmark initially missed.
5. Add a regression test for `packages/common/core-interfaces/src/test/opaqueJson.spec.ts` with a bounded timeout. The test must not silently disable rules: it should either prove the relevant tsgolint rules complete or prove that the ESLint compatibility pass still enforces them.
6. Add diagnostic-parity tests for every Fluid custom rule. Candidate JS-plugin rules must run through Oxlint's JS-plugin bridge against their existing valid/invalid cases; semantic rules must remain covered by ESLint until an equivalent implementation passes the same fixtures.
7. Add CI smoke tests for supported Linux, Windows, and macOS developer environments, verifying native package installation and sibling `tsgolint` executable discovery.
8. Add repeatable performance tests that run three non-incremental measurements after `pnpm clean`, report all raw values and medians, and separately report prerequisite time, lint-engine time, and end-to-end Fluid Build time.

Each test must exercise CLI-visible behavior, real diagnostics, real files, or real Fluid Build cache behavior. Tests must not assert only an internal data structure, generated type, mocked command invocation, or implementation-specific method call.

NOTE: I will write *all* tests before I add any implementation behavior.

## Current State and Constraints

### Repository footprint

- The repository has approximately 197 package-level `eslint.config.mts` files.
- Approximately 167 configs directly consume `@fluidframework/eslint-config-fluid`; another 28 inherit through build-tools or server base configs.
- ESLint scripts or dependencies appear in approximately 207 `package.json` files.
- Production code is split across the root client workspace and independent pnpm workspaces with their own manifests and lockfiles, including:
  - `build-tools/`
  - `server/routerlicious/`
  - `server/gitrest/`
  - `server/historian/`
  - `common/build/eslint-config-fluid/`
  - `common/build/build-common/`
  - `common/lib/common-utils/`
  - `common/lib/protocol-definitions/`
  - `tools/api-markdown-documenter/`
  - `tools/benchmark/`
  - `tools/test-tools/`
  - `tools/getkeys/`
  - `website/`
  - `docs/`
- Root catalog and lockfile changes do not update these independent workspaces.

### Measured baseline

The corrected experiment used Oxlint 1.80.0 and `oxlint-tsgolint` 7.0.2001:

| Scope | Current ESLint | Type-aware Oxlint | Interpretation |
| --- | ---: | ---: | --- |
| Tree lint engine | 29.364s median | 2.368s median | Approximately 12.4x upper-bound engine speedup after identical prerequisites |
| Root client lint phase | 230.065s `pnpm eslint` median | 17.241s median | Approximately 13.3x upper-bound observed ratio; ESLint time includes Fluid Build prerequisites |

The original sub-second result was invalid because it omitted `oxlint-tsgolint`, did not enable type-aware linting, used only default correctness rules, and ran after cleaning required workspace declarations.

The corrected benchmark:

- proved semantic operation with `typescript/no-floating-promises`;
- enabled the 32 tsgolint rules that overlap enabled Fluid type-aware rules, plus typed correctness rules;
- emitted 21,000 type-aware diagnostics in the client workspace;
- ran the exact 164 client package targets package-by-package;
- found that a single monolithic multi-project invocation can hang;
- found a pathological file/rule combination in `opaqueJson.spec.ts`.

These figures are not parity benchmarks. The Oxlint configuration covered a meaningful type-aware subset but did not reproduce every ESLint plugin, option, override, warning, or diagnostic. Use the numbers only as evidence that further work is worthwhile; Phase 7 must produce parity-configured, concurrency-matched measurements before any replacement claim.

### Migration blockers discovered by the experiment

1. `oxlint-tsgolint` is a peer dependency and its executable must be discoverable on `PATH`.
2. Type-aware linting immediately after `pnpm clean` sees unresolved workspace modules unless current Fluid Build prerequisites run first.
3. A monolithic repository invocation does not scale reliably; package batching is required.
4. `packages/common/core-interfaces/src/test/opaqueJson.spec.ts` hangs these tsgolint rules:
   - `no-confusing-void-expression`
   - `no-deprecated`
   - `no-floating-promises`
   - `no-misused-promises`
   - `no-unsafe-argument`
   - `no-unsafe-assignment`
   - `strict-boolean-expressions`
   - `strict-void-return`
5. Five of those rules are currently enforced by Fluid ESLint, so permanently suppressing them would be a coverage regression.
6. The benchmark's single root Oxlint config produced 25,290 diagnostics because it did not reproduce all package-specific options and overrides. Config translation and diagnostic parity are major work items, not cleanup.
7. Tsgolint uses TypeScript-Go 7 while this checkout uses TypeScript 6.0.3. Semantic disagreements must be classified before adoption.
8. Oxlint's JS-plugin support is alpha and not covered by semantic versioning.

## Goals

- Preserve or deliberately improve every currently enforced error-level diagnostic.
- Preserve warning-versus-error behavior, especially package test overrides combined with `--quiet`.
- Preserve package-specific ignore patterns, resolver behavior, globals, environments, and rule options.
- Preserve Fluid Build prerequisite ordering and incremental done-file behavior.
- Keep type-aware execution package-scoped.
- Provide a narrow, visible ESLint compatibility pass for unsupported rules.
- Produce meaningful end-to-end performance measurements before changing the default CI path.
- Migrate independent workspaces explicitly rather than assuming root catalog propagation.
- Keep rollback possible at each rollout phase.

## Non-goals

- Do not migrate formatting from Biome or Prettier.
- Do not fix all newly reported Oxlint diagnostics as part of infrastructure setup.
- Do not rewrite custom semantic rules while native or upstream alternatives are still being evaluated.
- Do not remove the published ESLint configuration exports before downstream compatibility is understood.
- Do not use a repository-wide tsgolint process.
- Do not accept permanent rule suppressions solely to reach a target runtime.

## Required Go/No-Go Gates

Do not advance a rollout phase unless all applicable gates pass.

1. **Type graph:** zero unresolved workspace imports after `pnpm clean` plus the new Fluid Build task.
2. **Rule inventory:** every enabled ESLint rule is classified as native Oxlint, native tsgolint, compatible JS plugin, intentional behavior change, or ESLint fallback.
3. **Diagnostic behavior:** all existing error-level behavior has an automated fixture or an approved exception.
4. **No hangs:** every package finishes within a documented timeout; `opaqueJson.spec.ts` is fixed upstream or protected by an equivalent ESLint fallback.
5. **Config parity:** package globs, ignores, environments, options, and severities are represented and tested.
   This includes packages using explicit projects, `projectService: false`, alternate tsconfig files, or multiple compiler-option views of the same sources.
6. **Operational behavior:** clean, forced, incremental, fix, package-scoped, and root-scoped commands work.
7. **Performance:** three clean-start runs show a material end-to-end improvement, not merely a fast standalone binary.
8. **Platform support:** supported development and CI platforms install and execute both native binaries.
9. **Rollback:** the previous ESLint path remains selectable until the next phase is proven.
10. **Approved behavior changes:** any intentional diagnostic difference has an explicit owner and approval recorded in the rule matrix; an unowned "intentional difference" cannot pass the gate.

## Phase 0: Freeze the Baseline and Open Upstream Issues

### Task 0.1: Record reproducible benchmark artifacts

Create a checked-in benchmark description under the existing lint configuration workspace, for example:

- `common/build/eslint-config-fluid/docs/oxlint-benchmark.md`
- `common/build/eslint-config-fluid/scripts/benchmark-oxlint.mjs`

The script must:

- verify exact `oxlint`, `oxlint-tsgolint`, ESLint, and TypeScript versions;
- require `pnpm clean` before each measured sequence;
- invoke package-scoped tasks, not `oxlint .`;
- separate prerequisite, engine, and end-to-end time;
- run three times and report raw values plus median;
- omit Oxlint's optional cache;
- fail if any backend process crashes or cannot resolve the sidecar.
- identify the current measurements as upper bounds until it can run a parity configuration;
- match effective file selection, package concurrency, tool-local thread settings, warning visibility, and diagnostic scope when comparing tools.

Do not check in raw machine-specific timing logs.

### Task 0.2: File a minimal tsgolint issue for the pathological rules

Reduce `packages/common/core-interfaces/src/test/opaqueJson.spec.ts` to the smallest independently runnable reproduction. File an upstream issue against `oxc-project/tsgolint` that includes:

- Oxlint and tsgolint versions;
- the minimized generic type pattern;
- each hanging rule;
- expected versus observed completion;
- platform and Node version;
- bounded reproduction command.

Keep the original rules enforced by ESLint until an upstream release passes the regression test.

### Task 0.3: Decide TypeScript-Go compatibility policy

Document whether TypeScript-Go 7 diagnostics are:

- authoritative immediately;
- accepted only when TypeScript 7 is adopted by the repository;
- or limited to rules proven equivalent to TypeScript 6 behavior.

This decision controls whether thousands of unsafe-flow and strict-boolean diagnostics are migration bugs, existing-code remediation, or expected semantic changes.

## Phase 1: Build a Complete Rule and Configuration Inventory

### Task 1.1: Generate the rule matrix

Extend:

- `common/build/eslint-config-fluid/scripts/print-configs.ts`
- `common/build/eslint-config-fluid/printed-configs/*.json`

Add a generated rule matrix that records for every effective rule:

- source config (`base`, `recommended`, `strict`, server, React, test, package override);
- ESLint namespace and full options;
- files/ignores to which it applies;
- severity;
- native Oxlint equivalent and supported options;
- tsgolint equivalent;
- JS-plugin candidate;
- required ESLint fallback;
- known diagnostic differences.
- the approving owner for any intentional behavior change;
- package-specific severity for all eight rules known to hang on `opaqueJson.spec.ts`.

Use `@oxlint/migrate` as an inventory aid only. Do not accept generated configuration without reviewing rule options, ignores, overrides, settings, processors, and plugin behavior.

### Task 1.2: Inventory package config shapes

Group the 197 configs by shared shape:

- client `base`, `recommended`, `strict`, and `strictBiome`;
- package-specific client overrides;
- examples shared data config;
- build-tools base;
- server base;
- React packages;
- explicit-project packages;
- legacy `.eslintrc` packages;
- website/MDX and specialized plugin packages.

Create one migration template per shape. Do not translate 197 configs independently by hand.

Config path depth is separate from config shape. If package configs use JSON `extends`, the generator/template must compute a path relative to each package rather than assuming one fixed depth.

### Task 1.3: Establish diagnostic normalization

Add a comparison utility under:

- `common/build/eslint-config-fluid/scripts/compare-lint-diagnostics.mjs`

It should consume ESLint JSON and Oxlint JSON, normalize paths, positions, severities, and mapped rule names, then report:

- exact matches;
- equivalent-rule location differences;
- ESLint-only diagnostics;
- Oxlint-only diagnostics;
- unsupported rules;
- config/load failures.

Diagnostic snapshots must be used as a review aid, not blindly accepted as baselines.

## Phase 2: Add Shared Oxlint Dependencies and Configuration

### Task 2.1: Pin compatible tool versions

Update the root client workspace:

- `pnpm-workspace.yaml`
- `package.json`
- `pnpm-lock.yaml`
- `.syncpackrc.yml`

Add a lint catalog containing compatible, exact or tilde-pinned versions of:

- `oxlint`
- `oxlint-tsgolint`

The sidecar version must satisfy Oxlint's peer dependency and be updated atomically with Oxlint.

Every migrated package must declare both `oxlint` and `oxlint-tsgolint` as dev dependencies through the catalog unless a tested workspace-level resolution policy proves that package-local `.bin` contains both executables. Add Syncpack and policy enforcement that treats the pair as inseparable. Do not depend on an unfulfilled peer being linked into each package's `.bin`.

Repeat dependency and lockfile changes only when each independent workspace reaches its migration phase. Do not bulk-edit unrelated lockfiles up front.

### Task 2.2: Add Oxlint config exports without breaking ESLint consumers

During the hybrid period, extend the existing independently published package:

- `common/build/eslint-config-fluid/package.json`
- `common/build/eslint-config-fluid/index.mts`
- `common/build/eslint-config-fluid/oxlint/base.json`
- `common/build/eslint-config-fluid/oxlint/recommended.json`
- `common/build/eslint-config-fluid/oxlint/strict.json`
- `common/build/eslint-config-fluid/oxlint/server.json`

Keep all existing ESLint exports and dependencies until external and internal consumers migrate.

Add explicit package exports for the Oxlint config subtree, for example `./oxlint/*`; creating files without exporting them is insufficient for consumers and for a possible `oxlint.config.ts` fallback.

Prefer JSON/JSONC Oxlint configs because they run in every supported runtime. Oxlint supports `extends` with paths resolved relative to the containing config. Before adopting this pattern, add an integration test proving that a package-local config can extend the shared JSON through pnpm's symlink layout in:

- the root client workspace;
- build-tools' linked-config setup;
- a server workspace;
- an independent single-package workspace.

If package-path extension is not reliable:

1. prefer a small config generator that writes package-local JSON from shared source data;
2. otherwise use `oxlint.config.ts` imports only after accepting Oxlint's experimental JS/TS-config execution risk;
3. do not copy shared rule maps manually into every package.

### Task 2.3: Preserve config invalidation inputs

Resolve and track the complete Oxlint `extends` chain inside `OxlintTask.taskSpecificConfigFiles`. Do not add a task-definition `files.additionalConfigFiles` block as the first implementation: `TaskFactory` currently routes any task with `files` to `DeclarativeLeafTask`, bypassing the dedicated `OxlintTask`.

If generic `additionalConfigFiles` support is desired, first change and test `TaskFactory` so a task containing only additional config inputs still uses its executable-specific handler. Changes to any shared config, package-local config, Oxlint version, or tsgolint version must invalidate package done files.

## Phase 3: Integrate Oxlint into Fluid Build

### Task 3.1: Share type-aware lint prerequisites

Update:

- `fluidBuild.config.cjs`

Rename `eslintDependsOn` to a tool-neutral name such as `typeAwareLintDependsOn`. Attach the same dependency list to:

- `eslint`
- `eslint:fix`
- new `oxlint`
- new `oxlint:fix`

Add the new tasks to the code-lint aggregate in `fluidBuild.config.cjs`. During hybrid operation:

- keep the existing `eslint` task name and prerequisites;
- add `oxlint` alongside it;
- do not rename the package task to `eslint:compat` unless the same change adds explicit `eslint:compat` and `eslint:compat:fix` global definitions using `typeAwareLintDependsOn`;
- update `lint` and `lint:fix` dependencies deliberately so CI actually schedules the desired tasks.

Shadow mode cannot be represented as a failing task inside the normal blocking `lint.dependsOn`. Introduce a separate `oxlint:shadow` target or CI step that captures the real exit code and diagnostic artifact while the CI wrapper alone decides not to fail. Do not hide errors inside the package script. Promotion to blocking means moving `oxlint` into the normal aggregate and removing the non-blocking CI wrapper.

This must retain generation and dependency build edges including `^build:package:esm`, `build:genver`, `typetests:gen`, legacy build tasks, and API tasks.

Do not allow Oxlint to run on a clean tree before these prerequisites.

### Task 3.2: Implement `OxlintTask`

Update:

- `build-tools/packages/build-tools/src/fluidBuild/tasks/leaf/lintTasks.ts`
- `build-tools/packages/build-tools/src/fluidBuild/tasks/taskFactory.ts`
- `build-tools/packages/build-tools/src/fluidBuild/tasks/taskUtils.ts`
- `build-tools/packages/build-tools/src/fluidBuild/tasks/leaf/leafTask.ts`

Add `OxlintTask extends TscDependentTask`.

Required behavior:

- recognize executable `oxlint`;
- discover `oxlint.config.*` and `.oxlintrc.*` files in documented precedence;
- include both `oxlint` and `oxlint-tsgolint` versions in incremental state;
- include package and shared configs in incremental state;
- classify Oxlint as lint for `--nolint` and `--lintonly`;
- use ordinary external process execution so package `node_modules/.bin` and inherited workspace `PATH` resolve both executables;
- do not add a worker-thread adapter initially;
- create `oxlint-<command-hash>.done.build.log`;
- write the done file only after successful completion.
- enforce a configurable package-invocation timeout;
- terminate the complete Oxlint/tsgolint child process tree on timeout;
- surface timeout as a failed task with package, duration, and command context;
- never write a done file after timeout or termination.

Do not add a declarative `files` task definition that bypasses the dedicated task handler.

### Task 3.3: Add task tests

Add:

- `build-tools/packages/build-tools/src/test/tasks/leaf/oxlintTask.tests.ts`

Cover:

- config discovery and precedence;
- missing sidecar failure;
- paired-version invalidation;
- local and shared config invalidation;
- TypeScript build-info invalidation;
- clean and forced execution;
- failed/hung process not producing a done file;
- timeout process-tree termination;
- lint-only filtering.

Use real temporary commands and files where feasible; do not only mock the task class.

### Task 3.4: Preserve command compatibility

During transition, use explicit scripts while preserving each package's existing warning behavior and targets:

```json
{
	"oxlint": "oxlint --type-aware --quiet src",
	"oxlint:fix": "oxlint --type-aware --quiet --fix src",
	"eslint": "eslint --quiet --format stylish src",
	"eslint:fix": "eslint --quiet --format stylish src --fix --fix-type problem,suggestion,layout"
}
```

The example is not a bulk replacement template. Derive `--quiet` and positional targets from each package's current script. Packages that currently show warnings must continue to show them; packages linting `index.js`, `test`, `bin/*`, or other targets must retain those targets.

Do not assume Oxlint's fix safety classes match ESLint's `--fix-type`. Review `--fix`, `--fix-suggestions`, and `--fix-dangerously` separately; the default fix command must not apply behavior-changing suggestions.

Keep root `pnpm eslint` as a documented compatibility alias until CI, scripts, and external developer workflows have migrated. Add a new unambiguous entry point such as `pnpm lint:code` for the aggregate code-lint task.

Root `pnpm lint` currently resolves to the root `checks` aggregate and does not run package ESLint tasks. Do not use it as the code-lint benchmark or silently change its meaning. Benchmark `fluid-build --task eslint`, `fluid-build --task oxlint`, and the explicit `lint:code` aggregate; report root `pnpm lint` only as the separate repository-check target.

## Phase 4: Migrate `packages/dds/tree` as the Pilot

### Task 4.1: Add the Tree config

Update:

- `packages/dds/tree/package.json`
- `packages/dds/tree/.oxlintrc.json`
- `packages/dds/tree/eslint.config.mts`

The Oxlint config must:

- extend the shared recommended config;
- enable type-aware mode;
- ignore `src/entrypoints/**`;
- disable unsafe argument and assignment checks as the current package does;
- preserve warning severity for expensive test-only promise and strict-boolean rules;
- disable `no-unsafe-member-access` in tests as today;
- preserve `unbound-method` and other rule options where Oxlint supports them;
- document every option mismatch.

Initially keep full ESLint enabled and run Oxlint as a non-blocking shadow check.

Add both `oxlint` and `oxlint-tsgolint` to Tree's dev dependencies through the shared catalog so the package-local task can resolve both executables.

### Task 4.2: Prove clean-tree correctness

Run:

```bash
pnpm clean
pnpm --dir packages/dds/tree oxlint
```

The command must execute through Fluid Build, not directly through the package binary. Confirm:

- required generated declarations are present before lint starts;
- no unresolved workspace modules;
- no sidecar resolution errors;
- type-aware proof fixture reports;
- package task finishes within its timeout.

### Task 4.3: Reach Tree diagnostic parity

Compare current ESLint and Oxlint diagnostics over the identical Tree file set.

For every difference:

- translate a missing option or override;
- classify a known semantic difference;
- fix a genuine newly discovered issue in a separate change;
- or retain the rule in the ESLint compatibility pass.

In the initial hybrid, implement the compatibility pass by narrowing the existing `eslint` task's effective config. Renaming that task to `eslint:compat` is optional and must not occur until global prerequisite definitions and all call sites are updated together.

Do not suppress large diagnostic classes in the migration PR.

### Task 4.4: Narrow Tree's fallback

Only after parity:

- remove native-migrated rules from Tree's effective ESLint compatibility config;
- keep custom, unsupported, and behaviorally different rules;
- make both `oxlint` and the existing narrowed `eslint` task blocking;
- measure each task and the full Tree `lint` target.

Tree exit criteria:

- no lost error-level diagnostics;
- clean and incremental tasks pass;
- type-aware Oxlint median remains within an agreed threshold, initially 5 seconds;
- full Tree lint improves materially from the approximately 102-second baseline;
- editor diagnostics match CI for supported rules.

## Phase 5: Handle Fluid Custom Rules and Unsupported Plugins

### Task 5.1: Evaluate custom JS rules

The internal plugin is registered at:

- `common/build/eslint-config-fluid/src/rules/index.cjs`

Evaluate these syntax/comment rules through Oxlint's alpha JS-plugin bridge:

- `no-file-path-links-in-jsdoc`
- `no-hyphen-after-jsdoc-tag`
- `no-markdown-links-in-jsdoc`
- `no-member-release-tags`

Reuse their existing test cases. Verify comment ranges, TypeScript ESTree node names, `SourceCode` methods, TSDoc parsing, reports, and fixes.

Do not rely on the JS-plugin bridge in required CI until:

- all behavior fixtures pass;
- performance impact is measured;
- Node runtime requirements are documented;
- an Oxlint upgrade does not silently break the alpha interface.

### Task 5.2: Retain semantic custom rules in ESLint

Keep these in the narrowed ESLint compatibility pass unless equivalent semantic APIs become available:

- `no-unchecked-record-access`
- `no-restricted-tags-imports` where enabled

`no-unchecked-record-access` depends on ESLint parser services, ESTree-to-TypeScript node maps, and the TypeScript checker. It cannot be preserved by a syntax-only JS bridge.

### Task 5.3: Classify remaining plugins

Explicitly test or retain fallback for:

- JSDoc and TSDoc rules;
- Rushstack rules;
- `eslint-comments`;
- `eslint-plugin-depend`;
- `import-x` resolver-sensitive rules;
- React and React Hooks options;
- no-only-tests;
- unused-imports;
- website MDX and Docusaurus rules;
- Chai-specific tool rules.

Native rule name similarity is not sufficient; options, resolver semantics, processors, fixes, and file handling must match.

## Phase 6: Resolve the `opaqueJson.spec.ts` Blocker

Do not merge a permanent eight-rule suppression.

The current effective ESLint severities for that file, resolved with `eslint --print-config`, are:

| Rule | Current severity |
| --- | --- |
| `@typescript-eslint/no-confusing-void-expression` | off / unconfigured |
| `@typescript-eslint/no-deprecated` | off / unconfigured |
| `@typescript-eslint/no-floating-promises` | error |
| `@typescript-eslint/no-misused-promises` | error |
| `@typescript-eslint/no-unsafe-argument` | error |
| `@typescript-eslint/no-unsafe-assignment` | error |
| `@typescript-eslint/strict-boolean-expressions` | error |
| `@typescript-eslint/strict-void-return` | off / unconfigured |

Only the five error-level rules are current parity requirements. Keep all eight in the regression because any of them can reveal a tsgolint scalability defect if enabled later.

Acceptable resolutions, in priority order:

1. upgrade to an upstream tsgolint release that passes the timeout regression;
2. reduce or restructure the pathological types without weakening public/type-test intent;
3. exclude only that file from the affected Oxlint rules while running the five currently enabled rules through the narrowed `eslint` task;
4. postpone the affected package's migration.

The fallback must remain visible in the rule matrix and have an owner/removal condition.

Before accepting option 3, prove with a timeout regression that disabling those rules prevents the hang. Do not assume rule severity suppression avoids work during tsgolint program construction.

## Phase 7: Roll Out Across the Client Workspace

### Task 7.1: Define migration waves

Migrate packages in small waves:

1. leaf packages with standard `src` targets and minimal overrides;
2. common/core packages;
3. DDS and runtime packages;
4. React packages and devtools;
5. examples and specialized command shapes;
6. experimental packages;
7. Azure packages and non-`src` targets.

Each package must retain its package-level Fluid Build leaf. Never replace this with one root tsgolint process.

### Task 7.2: Preserve target shapes

Current client scripts include at least:

- `src`
- `index.js`
- `src test`
- `src "bin/*"`
- package-local concurrency options

Translate each target explicitly. Use `--debug=files` during review to prove that Oxlint selects the intended file set and ignores generated output.

### Task 7.3: Use shadow CI before enforcement

For each wave:

1. run Oxlint in CI without failing the build;
2. publish normalized diagnostic artifacts;
3. triage config gaps and new diagnostics;
4. make Oxlint blocking;
5. narrow ESLint fallback;
6. remove full ESLint only after at least one stable CI period.

Do not hide failures behind a success-shaped wrapper once Oxlint becomes blocking.

The non-blocking shadow step must still preserve and publish the actual process exit code. It may be marked non-fatal only at the CI step boundary. When a wave becomes blocking, add `oxlint` to the actual Fluid Build `lint` dependency graph for those packages or to the tool-neutral code-lint aggregate.

### Task 7.4: Measure the integrated task

After enough packages migrate, run three clean-start measurements of:

- prerequisites only;
- package Oxlint leaves;
- package ESLint compatibility leaves;
- full `pnpm lint:code`;
- root `pnpm lint` separately as the existing non-code repository checks target.

The parity benchmark must use equivalent file sets, warnings, migrated rule/options, and comparable concurrency. Record Oxlint thread count and Fluid Build concurrency. Do not compare the current upper-bound benchmark configuration to the full ESLint policy.

This is the decision point for whether the migration produces enough end-to-end value to continue.

## Phase 8: Update Policy, CI, and Developer Tooling

### Task 8.1: Policy checks

Update:

- `build-tools/packages/build-cli/src/library/repoPolicyCheck/npmPackages.ts`
- `build-tools/packages/build-cli/src/library/repoPolicyCheck/fluidBuildTasks.ts`
- `build-tools/packages/build-cli/src/test/library/repoPolicyCheck/fluidBuildTasks.test.ts`
- `fluidBuild.config.cjs`
- root and build-tools Syncpack configuration

Add executable-to-dependency mapping for `oxlint`.

Keep ESLint dependency enforcement while any compatibility script remains.

Add policy validation that every package with an Oxlint script declares both `oxlint` and `oxlint-tsgolint` at compatible catalog versions.

Do not attempt to infer Oxlint type prerequisites from ESLint's runtime API. Prefer the shared global prerequisite definition unless a new Oxlint-specific policy handler can read all extended configs reliably.

### Task 8.2: Azure and GitHub CI

Review:

- `tools/pipelines/templates/include-build-lint.yml`
- `tools/pipelines/templates/build-npm-package.yml`
- `tools/pipelines/templates/build-npm-client-package.yml`
- `tools/pipelines/templates/build-docker-service.yml`
- `tools/pipelines/build-client.yml`
- `tools/pipelines/build-build-tools.yml`
- server pipeline YAML files
- `.github/workflows/website-validation.yml`
- `tools/pipelines/deploy-website.yml`

Most templates call abstract `lint` scripts and should require no immediate change. Explicit ESLint surfaces must be migrated:

- `taskLintName: ci:eslint`;
- the Azure `ESLint@1` website task;
- task names, artifact names, and conditions containing `eslint`.

Keep CI output machine-readable where supported, but preserve developer-friendly local output.

### Task 8.3: Editor and devcontainer integration

Update:

- `.vscode/extensions.json`
- `.vscode/settings.json`
- `.devcontainer/devcontainer.json`
- `.devcontainer/standard/devcontainer.json`

Add the official `oxc.oxc-vscode` extension and configure workspace/package discovery. Keep `dbaeumer.vscode-eslint` recommended while compatibility rules remain.

Verify that editor type-aware diagnostics use the same configs and project roots as CLI tasks.

## Phase 9: Migrate Independent Workspaces

Migrate one lockfile boundary at a time after the client pattern is stable.

Recommended order:

1. `common/build/eslint-config-fluid/`
2. `build-tools/`
3. `common/build/build-common/`
4. `common/lib/common-utils/`
5. `common/lib/protocol-definitions/`
6. `tools/test-tools/`
7. `tools/api-markdown-documenter/`
8. `tools/benchmark/`
9. `tools/getkeys/`
10. `server/routerlicious/`
11. `server/gitrest/`
12. `server/historian/`
13. `website/`

For each workspace:

- install pinned Oxlint and tsgolint versions in that workspace;
- update its lockfile;
- preserve workspace-local config bases;
- run clean-start type graph checks;
- migrate specialized plugins or retain fallback;
- update its pipeline;
- add changesets/changelog entries required by that workspace;
- validate Docker or container execution where applicable.

Execution models differ by workspace. Client and build-tools packages may use Fluid Build task leaves, while server workspaces currently use `pnpm -r ... eslint`. For each independent workspace, document whether lint runs through Fluid Build or recursive pnpm and explicitly provide:

- prerequisite generation/type-build ordering;
- package batching;
- timeout enforcement;
- cache/incremental semantics;
- rollback command.

Do not assume `OxlintTask` supplies these guarantees to recursive-pnpm server commands.

Schedule packages using explicit projects, `projectService: false`, nonstandard tsconfig names, or alternate compiler options in a late migration wave. Require a fixture proving tsgolint analyzes the intended project view before they become blocking.

Do not modify compatibility/test fixture lockfiles unless their expected behavior explicitly includes lint tooling.

## Phase 10: Documentation and Release Management

Update:

- `docs/content/Contributing/ESLint.md`, renaming or replacing it with tool-neutral lint guidance;
- `DEV.md`;
- `common/build/eslint-config-fluid/README.md`;
- `common/build/eslint-config-fluid/DEV.md`;
- `build-tools/DEV.md`;
- `docs/content/Guidelines/Coding-Guidelines.md`;
- dependency-management guidance;
- shared-config changelog.

Document:

- package and root commands;
- type-aware sidecar requirements;
- config inheritance;
- adding and testing rules;
- unsupported-rule fallback;
- clean/full benchmarks;
- editor setup;
- troubleshooting missing `tsgolint`;
- package timeout behavior.

Because `@fluidframework/eslint-config-fluid` is independently versioned and published, preserve its existing exports through at least one compatibility release. Decide separately whether to:

- keep the historical package name;
- publish `@fluidframework/oxlint-config-fluid`;
- or publish a tool-neutral lint configuration package.

Do not rename the package in the same change that first introduces Oxlint.

## Phase 11: Make Oxlint the Default and Remove ESLint

ESLint removal may begin only when the rule matrix contains no unapproved fallback.

### Task 11.1: Switch defaults

- make `lint:code` depend on Oxlint plus any approved residual checker;
- update root/package scripts and CI task names;
- retain a temporary compatibility alias for `pnpm eslint`;
- announce the deprecation and removal date.

### Task 11.2: Remove dependencies and configs by workspace

For each workspace:

- remove ESLint, typescript-eslint, migrated plugins, and compatibility config dependencies;
- remove obsolete `eslint.config.*` or `.eslintrc.*`;
- remove ESLint-specific policy mappings;
- remove ESLint worker code only after no task uses it;
- regenerate lockfiles;
- run policy and Syncpack checks.

Do not remove a plugin merely because its direct rule names moved; the shared config or JS-plugin bridge may still load it.

### Task 11.3: Remove compatibility infrastructure

After all workspaces migrate:

- remove `EsLintTask`, ESLint worker dispatch, and ESLint config discovery from Fluid Build;
- remove ESLint editor recommendations/settings;
- remove the Azure ESLint task;
- remove compatibility aliases;
- archive the final parity matrix with the migration version.

### Task 11.4: Final acceptance

Run:

- targeted task/config tests;
- build-tools tests;
- shared lint-config tests;
- root policy check;
- Syncpack checks;
- Tree clean-start lint;
- root client clean-start lint;
- each independent workspace lint;
- CI on supported platforms;
- three-run performance benchmark.

Require zero unexplained diagnostic losses and zero backend hangs.

## Backward Compatibility and Rollback

- Keep ESLint exports in the published shared package during hybrid operation.
- Keep package `eslint` scripts or a root alias until external scripts and developer workflows migrate.
- Keep ESLint editor support while compatibility rules remain.
- Use separate named Fluid Build tasks so Oxlint can be disabled without changing ESLint cache state.
- Do not combine Oxlint and ESLint with `&&` inside one opaque task; separate done files and failures are required.
- Roll back a package by removing its Oxlint task dependency and restoring full ESLint config; package-local migration makes this bounded.
- Pin Oxlint/tsgolint upgrades and rerun parity fixtures before each version change.
- Failed or timed-out Oxlint tasks must never create a done file.
- Preserve warning behavior; do not turn warning-only test rules into build errors during rollback or migration.

## Caveats and Pitfalls

1. **Fast does not mean equivalent.** Default Oxlint correctness rules are not comparable to Fluid's current config.
2. **Type-aware mode is external.** Installing `oxlint` alone is insufficient; the compatible tsgolint sidecar and executable path are required.
3. **Clean trees need generated declarations.** Running the binary outside Fluid Build can silently degrade imported types to `any`.
4. **Monolithic execution is unsafe.** Package batching is an architectural requirement based on observed hangs.
5. **Rule options differ.** Identical names do not guarantee identical options, diagnostics, or fixes.
6. **Warnings matter.** Current `--quiet` behavior combines with intentional warning-level test rules.
7. **Config paths are rooted.** Oxlint `extends`, overrides, and ignores resolve relative to config locations; external benchmark configs can accidentally miss package globs.
8. **JS plugins are alpha.** They may break without a semver-major release.
9. **Semantic versions differ.** TypeScript-Go 7 may disagree with TypeScript 6 on complex types.
10. **Fixes can change behavior.** Do not map ESLint `--fix-type` blindly to Oxlint's dangerous suggestions.
11. **Native binaries affect platforms.** Validate package-manager resolution, architecture, libc, container, and offline-install behavior.
12. **Two concurrency layers can oversubscribe CPUs.** Fluid Build package concurrency and tool-local threading must be tuned together.
13. **Incremental caches can falsify benchmarks.** Use Fluid Build force/clean semantics and omit Oxlint's own cache for full-run comparisons.
14. **Independent workspaces drift.** Each lockfile and shared-config version must be migrated and tested independently.
15. **The published config is public tooling.** Removing exports or dependencies can affect consumers outside this repository.
16. **Large diagnostic baselines hide regressions.** Never accept thousands of new diagnostics wholesale.
17. **Specialized file processors may be missing.** MDX, Docusaurus, and plugin-defined languages need explicit handling.
18. **No silent fallback.** Missing sidecars, invalid configs, and unsupported rules must fail visibly.

## Open Decisions

1. Is complete ESLint removal required, or is a small long-term compatibility pass acceptable for semantic custom rules?
2. Must TypeScript-Go diagnostics match the repository's current TypeScript version before enforcement?
3. What timeout and performance thresholds should block a package migration?
4. Should the existing published config package eventually be renamed, or remain backward-compatible under its historical name?
5. Is the alpha JS-plugin bridge acceptable in required CI, or should all non-native plugin rules remain in ESLint?
6. How long must shadow CI remain stable before a migration wave becomes blocking?
7. Which team owns upstream tsgolint issues and removal of temporary fallback entries?

**Testing Details** Add real CLI and Fluid Build integration tests that verify diagnostic behavior, semantic analysis, project resolution, cache invalidation, timeouts, platform installation, and clean-start performance; fixtures exercise public tool boundaries rather than mocked internals.

**Implementation Details**

- Preserve package-scoped execution and current type-lint prerequisites.
- Add `OxlintTask extends TscDependentTask`.
- Track Oxlint, tsgolint, local config, shared config, and TypeScript build information in done-file state.
- Introduce Oxlint first as a shadow task.
- Maintain a visible, shrinking ESLint compatibility pass; keep the task named `eslint` until prerequisite-bearing compatibility task definitions exist.
- Translate shared config shapes rather than 197 configs independently.
- Block permanent suppression of the `opaqueJson.spec.ts` rules.
- Roll out the client workspace before independent workspaces.
- Measure integrated end-to-end lint, not only binary runtime.
- Remove ESLint only after the parity matrix has no unapproved gaps.

**Question** The main implementation decision is whether the acceptable end state requires zero ESLint execution. The current evidence supports a hybrid migration immediately, but complete removal depends on tsgolint resolving the pathological semantic rules and on an equivalent implementation for Fluid's custom type-aware rules.

---