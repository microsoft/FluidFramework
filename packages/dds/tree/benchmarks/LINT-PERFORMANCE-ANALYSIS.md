# Lint Performance Analysis

This document summarizes the performance impact of adding Biome linting to the `@fluidframework/tree` package.

## Benchmark Environment

- **Machine**: Apple Silicon Mac
- **Date**: February 2025
- **Tool**: [hyperfine](https://github.com/sharkdp/hyperfine)
- **Methodology**: 5 runs with 1 warmup run

## Results

| Command | Mean Time | Min | Max | Relative |
|:--------|----------:|----:|----:|:---------|
| ESLint only | 26.7s | 26.4s | 27.0s | baseline |
| Biome lint only | 0.58s | 0.53s | 0.65s | 46x faster than ESLint |
| ESLint + Biome (parallel) | 26.5s | 26.2s | 26.9s | ~0.3s faster than sequential |
| ESLint + Biome (sequential) | 26.8s | 26.5s | 27.2s | +0.6s over ESLint alone |

## Key Findings

### 1. Biome is significantly faster than ESLint

Biome completes linting in **~0.6 seconds** compared to ESLint's **~27 seconds**. This represents a **~46x speedup** for the linting operations that Biome handles.

### 2. Parallel execution provides marginal benefit

Running ESLint and Biome in parallel saves only **~0.3 seconds** compared to sequential execution. This is because:
- ESLint dominates the runtime at ~27s
- Biome's ~0.6s runs "hidden" under ESLint's execution time
- The theoretical maximum speedup is limited to the shorter task's duration

### 3. Total lint time increases minimally

Adding Biome to the lint pipeline increases total lint time by only **~2%** (0.6s / 27.3s). This is negligible considering the additional coverage Biome provides.

### 4. fluid-build task orchestration

With the configuration:
```javascript
// In fluidBuild.config.cjs
"lint:biome": ["^eslint"],  // Depends on upstream packages' eslint only
"lint": {
    dependsOn: ["eslint", "lint:biome", ...],  // Both tasks in lint
    script: false,
}
```

fluid-build will run `eslint` and `lint:biome` in parallel for each package because:
- `lint:biome` only waits for `^eslint` (upstream packages), not the local `eslint`
- Both tasks are listed in `lint.dependsOn`, so fluid-build schedules them together
- The dependency graph allows parallel execution within the same package

## Performance Summary

| Metric | Value |
|:-------|------:|
| ESLint time | 26.7s |
| Biome time | 0.58s |
| Parallel execution time | 26.5s |
| Sequential execution time | 27.3s |
| Time saved by parallelization | 0.3s (~1%) |
| Overhead of adding Biome | 0.6s (~2%) |

## Recommendations

1. **Keep Biome lint enabled**: The ~2% overhead is negligible for the additional lint coverage.

2. **Use parallel execution**: While the benefit is small for this package, it adds up across many packages in the monorepo.

3. **For local development**: Use `pnpm lint:biome` for quick feedback (0.6s), then run full lint before committing.

4. **Future optimization**: As more ESLint rules migrate to Biome, ESLint's runtime will decrease, and Biome's speed advantage will provide greater overall benefit.

## Running the Benchmark

To reproduce these results:

```bash
cd packages/dds/tree
./benchmarks/lint-benchmark.sh
```

Requirements:
- hyperfine (`brew install hyperfine`)
- Node.js and pnpm
- Package must be built (`pnpm build:compile`)
