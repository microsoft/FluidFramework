# Build Pipeline Optimization Opportunities

Analysis date: 2026-03-01
Based on build #380671 (PR build, 49.6 min wall-clock) and build #381120 (PR build, 44 min)

## Current Critical Path

```
Build (19m) → agent gap (~25s typical, variable under contention) → Coverage tests (22m) = ~41-42 min
```

## Build Job Breakdown (~17.5 min, from build #380798)

| Step | Duration | Notes |
|------|----------|-------|
| npm run ci:build | 8.2 min | 1,510 leaf tasks via fluid-build |
| npm run webpack | 1.9 min | Runs sequentially AFTER ci:build |
| npm pack | 1.4 min | Creates tarballs for all packages |
| Setup (checkout, pnpm, node, build-tools, set-version) | 2.7 min | |
| SDL/Security (1ES template-injected) | 1.8 min | AntiMalware (76s), Component Governance (16s), Guardian (~4s) |
| Other (bundle analysis, docs, devtools, lockfile prune) | 0.9 min | |
| Artifact archiving + publishing | 0.7 min | |

## Optimization Opportunities

### 1. CJS api-extractor Checks Are Redundant on PRs (saves ~1 min wall-clock)

**Current:** 224 CJS api-extractor invocations (159 lint + 65 entrypoint generation) consume 22 min CPU time. The CJS entry point files are byte-for-byte identical to ESM.
**Fix:** Use `SKIP_CJS_CHECKS` env var in `fluidBuild.config.cjs` to conditionally exclude CJS tasks from the dependency graph on PR builds. Set in pipeline via `include-vars.yml`. Zero package.json changes.
**Impact:** ~1 min wall-clock (22 min CPU / 22.7x concurrency), plus simplifies the build graph.
**Status:** PR #26596, awaiting review.

**Files:** `fluidBuild.config.cjs`, `tools/pipelines/templates/include-vars.yml`, `tools/pipelines/templates/include-build-lint.yml`

### 2. Coverage Shard Splitting (saves ~5 min) — PR #26586

**Status:** Already implemented, awaiting review.
**Current:** Single `ci:test:mocha` coverage shard takes 17 min (now 14.8 min in latest builds).
**Fix:** Split DDS mocha tests into 5 parallel coverage shards. Reduces coverage critical path from 17m to ~8m.

### 3. eslint build:test:esm Dependency — NOT an optimization

**Original estimate:** 0.5-1 min savings by removing `build:test:esm` from eslint's dependencies.
**Actual analysis:** `build:test:esm` depends on `typetests:gen`, `build:esnext`, and `api-extractor:esnext` — all of which are already transitive dependencies of `compile` (via `compile` → `build:test` and `compile` → `build:esnext`). The explicit dependency is fully redundant but doesn't affect scheduling — fluid-build resolves the full graph either way, and eslint can't start until `compile` finishes regardless. Removing it is a code cleanup (ADO #7297), not a performance improvement.

### 6. Agent Provisioning Gap — NOT a real optimization

**Original estimate:** 2-3 min gap, based on a single unlucky build.
**Actual data across 4 builds:** The gap between the build job finishing and the first test job starting is typically **20-25 seconds** (just ADO scheduling overhead). Occasional large gaps (2.8 min in one build, 8+ min in another) are agent pool contention under load, not provisioning latency. Self-hosted or pre-warmed agents wouldn't help since the typical case is already fast.

### 7. SDL Scanning on Critical Path — NOT actionable

**Original estimate:** 1.5 min savings by moving SDL to a parallel job.
**Actual data:** SDL tasks total ~105s, dominated by AntiMalware MDE Scanner (76s) and Component Governance (15s). However, these tasks are **injected by the 1ES pipeline template** (`sdl:` config at line 164), not explicit pipeline steps. They run against the job's artifacts as part of Microsoft's mandatory security compliance framework. You can't move them to a different job without changes to the 1ES template itself (owned by the 1ES team). Not actionable at the pipeline level.

## What We Tried and Doesn't Work

### tsbuildinfo Caching (PR #26593, closed)

**Why it fails:** fluid-build's `TscTask.checkLeafIsUpToDate()` only validates source file hashes against the tsbuildinfo. When all hashes match, it skips tsc entirely — but on a fresh CI agent the build outputs (lib/, dist/, .d.ts) don't exist, causing TS2307 errors. Full build output caching is undermined by "Set Package Version" which changes packageVersion.ts in most packages, invalidating the cache.

### Docs Build Runs Twice (original estimate: 0.5-1 min)

**What it looked like:** `ci:build:docs` runs as part of `ci:build` via fluid-build, then an explicit `npm run ci:build:docs` step runs again in the pipeline. Appeared to be a redundant rebuild.
**Why it's not an issue:** The explicit step calls `fluid-build --task ci:build:docs`, which detects all outputs are already up-to-date and skips in ~5.5 seconds. The step exists as a gate before `CopyFiles@2` which copies `_api-extractor-temp` to the artifact staging directory. No actual rebuild happens.

### Webpack Inside ci:build (PR #26594, closed)

**What we tried:** Added `webpack` to `ci:build.dependsOn` in `fluidBuild.config.cjs` so fluid-build could schedule it in parallel with lint/api-reports, and removed the separate sequential `npm run webpack` step from the pipeline.
**Why it didn't help:** CI results showed no measurable improvement — build job ran in 17m 39s vs baseline range of 17m 31s – 19m 18s. fluid-build was likely already scheduling webpack optimally, or webpack remained on the critical path regardless since it depends on `^tsc` and `^build:esnext`.

### npm pack in Parallel Job (PR #26595, closed)

**What we tried:** Moved `npm pack` (~1.4 min) to a separate parallel job running alongside tests. The pack job re-ran checkout, pnpm install, set-version, and downloaded/extracted the build archive before packing.
**Why it didn't help:** Build job was only ~30s faster (17m07s vs baseline median ~17m37s — within CI variance). Overall pipeline was ~2.5 min *slower* (43m42s vs baseline ~40-41m). The Pack job spent 7m37s total — ~6 min of setup overhead for ~1.4 min of actual work — and consumed an agent slot that likely delayed test jobs.

## Summary

| Optimization | Est. Savings | Effort | Status |
|-------------|-------------|--------|--------|
| Coverage shard splitting | 5 min | Done | PR #26586, awaiting review |
| CJS api-extractor off PR path | 1 min | Low | PR #26596, awaiting review |
| npm pack in parallel | ~0 min | N/A | PR #26595, closed — no measurable improvement |
| eslint dependency cleanup | ~0 min | N/A | Redundant dep, no scheduling impact |
| Agent provisioning | ~0 min | N/A | Not a real issue (20-25s typical) |
| SDL parallel job | ~0 min | N/A | Not actionable (1ES template-injected) |
| **Total** | **~6 min** | | |

Current PR build: ~41-45 min. With all optimizations: ~35-39 min.
