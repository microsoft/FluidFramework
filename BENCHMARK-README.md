# Build Cache Benchmark Scripts

This directory contains scripts for benchmarking the Fluid Framework build cache performance using [hyperfine](https://github.com/sharkdp/hyperfine).

## Available Scripts

### 1. `benchmark-cache.sh` - Simple Benchmark
Basic script that compares build performance with and without cache.

**Usage:**
```bash
./benchmark-cache.sh [project-dir] [runs] [warmup-runs]
```

**Examples:**
```bash
# Default: benchmark aqueduct with 5 runs
./benchmark-cache.sh

# Custom project
./benchmark-cache.sh packages/runtime/container-runtime

# More runs for accuracy
./benchmark-cache.sh packages/framework/aqueduct 10 3
```

### 2. `benchmark-cache-advanced.sh` - Advanced Benchmark
Feature-rich script with multiple comparison modes and configuration options.

**Usage:**
```bash
./benchmark-cache-advanced.sh [options]
```

**Options:**
- `-p, --project DIR` - Project directory to benchmark
- `-r, --runs NUM` - Number of benchmark runs (default: 5)
- `-w, --warmup NUM` - Number of warmup runs (default: 2)
- `-t, --task TASK` - Build task (compile, build, tsc, lint)
- `-m, --mode MODE` - Comparison mode:
  - `standard` - Compare with/without cache (default)
  - `cold-warm` - Compare cold vs warm cache
  - `incremental` - Test incremental builds
- `-o, --output DIR` - Output directory (default: benchmark-results)

**Examples:**
```bash
# Standard benchmark with more runs
./benchmark-cache-advanced.sh -p packages/framework/aqueduct -r 10

# Test cold vs warm cache
./benchmark-cache-advanced.sh -m cold-warm

# Test incremental build performance
./benchmark-cache-advanced.sh -m incremental -r 8

# Custom task
./benchmark-cache-advanced.sh -t build -r 10
```

### 3. `benchmark-cache-batch.sh` - Batch Benchmark
Benchmarks multiple projects in one run, useful for comprehensive testing.

**Usage:**
```bash
./benchmark-cache-batch.sh [runs-per-project]
```

**Examples:**
```bash
# Benchmark all projects with default settings
./benchmark-cache-batch.sh

# More runs per project
./benchmark-cache-batch.sh 10
```

**Default projects:**
- packages/framework/aqueduct
- packages/runtime/container-runtime
- packages/dds/tree
- packages/loader/container-loader
- packages/dds/map

Edit the script to customize the project list.

## Prerequisites

Install hyperfine:

**Ubuntu/Debian:**
```bash
sudo apt install hyperfine
```

**macOS:**
```bash
brew install hyperfine
```

**Cargo:**
```bash
cargo install hyperfine
```

## Output Files

All scripts generate:
- **Markdown reports** (`.md`) - Human-readable results
- **JSON data** (`.json`) - Machine-readable data for analysis

Results are saved to `benchmark-results/` directory by default.

## Quick Start

1. Install hyperfine:
   ```bash
   sudo apt install hyperfine  # or brew install hyperfine on macOS
   ```

2. Run a simple benchmark:
   ```bash
   ./benchmark-cache.sh
   ```

3. View results:
   ```bash
   cat benchmark-results-aqueduct.md
   ```

## Understanding Results

**Good cache performance:**
- 2-5x speedup with cache enabled
- Low standard deviation
- Consistent timings

**Example output:**
```
Benchmark 1: with-cache
  Time (mean ± σ):      2.234 s ±  0.125 s
 
Benchmark 2: without-cache
  Time (mean ± σ):      4.567 s ±  0.234 s
 
Summary
  with-cache ran 2.04 ± 0.15x faster than without-cache
```

## Tips

1. **Close background apps** during benchmarking
2. **Use 5-10 runs** for statistical significance
3. **Test on consistent hardware** (same power mode, no thermal throttling)
4. **Check disk space** and system load before benchmarking

## Environment Variables

- `FLUID_BUILD_CACHE_DISABLED=1` - Disables the build cache
- `FLUID_BUILD_CACHE_PATH` - Custom cache location

## Further Documentation

See `BENCHMARK-GUIDE.md` for detailed documentation, including:
- Advanced usage scenarios
- Interpreting results
- Troubleshooting
- Analysis techniques
- Python scripts for visualization

## Common Use Cases

**Test cache effectiveness:**
```bash
./benchmark-cache.sh packages/framework/aqueduct 10
```

**Compare across multiple projects:**
```bash
./benchmark-cache-batch.sh 5
```

**Test incremental builds:**
```bash
./benchmark-cache-advanced.sh -m incremental -r 10
```

**Verify cache warming:**
```bash
./benchmark-cache-advanced.sh -m cold-warm
```

## Troubleshooting

**"hyperfine not found"**
- Install hyperfine using instructions above

**"Project directory not found"**
- Check you're in the repository root
- Verify the project path is correct

**Inconsistent results**
- Increase number of runs (`-r` option)
- Check for background processes
- Ensure sufficient disk space

## Example Workflow

```bash
# 1. Install hyperfine
sudo apt install hyperfine

# 2. Run simple benchmark
./benchmark-cache.sh

# 3. Run comprehensive test
./benchmark-cache-advanced.sh -r 10 -m standard

# 4. Test multiple projects
./benchmark-cache-batch.sh 5

# 5. View results
ls -l benchmark-results/
cat benchmark-results/*.md
```

## Contributing

To add more projects to batch benchmark, edit `benchmark-cache-batch.sh` and update the `PROJECTS` array:

```bash
declare -a PROJECTS=(
    "packages/framework/aqueduct"
    "packages/your/custom-package"
    # Add more...
)
```
