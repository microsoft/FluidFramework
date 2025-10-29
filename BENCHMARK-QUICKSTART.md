# Build Cache Benchmark - Quick Start

## TL;DR

```bash
# 1. Install hyperfine
sudo apt install hyperfine  # or: brew install hyperfine

# 2. Run benchmark
./benchmark-cache.sh

# 3. View results
cat benchmark-results-aqueduct.md
```

## One-Liners

```bash
# Simple benchmark (default project)
./benchmark-cache.sh

# Benchmark specific project
./benchmark-cache.sh packages/runtime/container-runtime

# More accurate (10 runs)
./benchmark-cache.sh packages/framework/aqueduct 10

# Test multiple scenarios
./benchmark-cache-advanced.sh -m incremental -r 10

# Benchmark all projects
./benchmark-cache-batch.sh 5
```

## What Gets Tested

✅ **with-cache** - Build using shared cache (fast)  
✅ **without-cache** - Build without cache (slow)  
✅ **Speedup ratio** - How much faster cache makes builds

## Expected Results

Good cache performance: **2-5x faster** with cache enabled

```
Summary
  with-cache ran 2.04 ± 0.15x faster than without-cache
```

## All Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `benchmark-cache.sh` | Simple benchmark | `./benchmark-cache.sh [project]` |
| `benchmark-cache-advanced.sh` | Advanced options | `./benchmark-cache-advanced.sh -h` |
| `benchmark-cache-batch.sh` | Multiple projects | `./benchmark-cache-batch.sh [runs]` |

## Common Tasks

**Test cache effectiveness:**
```bash
./benchmark-cache.sh packages/framework/aqueduct 10
```

**Compare multiple projects:**
```bash
./benchmark-cache-batch.sh
```

**Test incremental builds:**
```bash
./benchmark-cache-advanced.sh -m incremental
```

## Need Help?

- `./benchmark-cache-advanced.sh --help` - Show all options
- `BENCHMARK-README.md` - Full documentation
- `BENCHMARK-GUIDE.md` - Detailed guide and tips
