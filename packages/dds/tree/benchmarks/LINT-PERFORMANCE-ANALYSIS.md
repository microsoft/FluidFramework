# Lint Performance Analysis

This document summarizes the performance impact of adding Biome linting to the `@fluidframework/tree` package.

## Benchmark Environment

- **Machine**: Apple Silicon Mac
- **Date**: January 2025
- **Tool**: [hyperfine](https://github.com/sharkdp/hyperfine)
- **Methodology**: 5 runs with 1 warmup run

## Results

| Command | Mean Time | Min | Max | Relative to Baseline |
|:--------|----------:|----:|----:|---------------------:|
| ESLint (main branch) | 28.6s | 28.3s | 28.7s | 1.00x (baseline) |
| ESLint (strictBiome config) | 26.3s | 24.4s | 27.6s | 0.92x (8% faster) |
| Biome lint only | 5.7s | 5.5s | 5.8s | 0.20x (5x faster) |
| ESLint + Biome (sequential) | 32.2s | 31.8s | 32.5s | 1.13x (13% slower) |

## Key Findings

### 1. Biome is significantly faster than ESLint

Biome completes linting in ~5.7 seconds compared to ESLint's ~26-28 seconds. This represents a **~5x speedup** for the linting operations that Biome handles.

### 2. strictBiome config improves ESLint performance

By using the `strictBiome` ESLint configuration (which disables rules that Biome now handles), ESLint runs **~8% faster** (28.6s → 26.3s). This is because ESLint no longer needs to check rules that are delegated to Biome.

### 3. Total lint time increases modestly

Adding Biome to the lint pipeline increases total lint time by **~13%** (28.6s → 32.2s). This is a modest increase considering:

- You get additional lint coverage from Biome's unique rules
- Biome catches different categories of issues than ESLint
- The strictBiome config partially offsets the addition by making ESLint faster

### 4. Biome adds ~5.7 seconds to lint time

The overhead of running Biome in addition to ESLint is approximately 5.7 seconds per lint run.

## Recommendations

1. **For CI pipelines**: The 13% increase in lint time is acceptable given the additional coverage. Consider running ESLint and Biome in parallel if your CI system supports it.

2. **For local development**: Use `pnpm lint:biome` for quick feedback during development (5.7s), and run the full lint before committing.

3. **Future optimization**: As more ESLint rules are migrated to Biome, the ESLint portion will become faster, potentially resulting in net time savings.

## Running the Benchmark

To reproduce these results:

```bash
cd packages/dds/tree
./benchmarks/lint-benchmark.sh
```

Requirements:
- hyperfine (`brew install hyperfine`)
- Node.js and pnpm
