# Build Cache Benchmarking Guide

This guide explains how to benchmark the Fluid Framework build cache performance using the provided scripts.

## Prerequisites

### Install hyperfine

Hyperfine is a command-line benchmarking tool that provides statistical analysis of command execution times.

**Ubuntu/Debian:**
```bash
sudo apt install hyperfine
```

**macOS:**
```bash
brew install hyperfine
```

**With Cargo (Rust):**
```bash
cargo install hyperfine
```

**From releases:**
Download from https://github.com/sharkdp/hyperfine/releases

## Quick Start

### Basic Usage

Run the benchmark on the aqueduct package (default):
```bash
./benchmark-cache.sh
```

### Custom Project

Benchmark a different package:
```bash
./benchmark-cache.sh packages/runtime/container-runtime
```

### Adjust Number of Runs

Benchmark with custom number of runs (for more statistical accuracy):
```bash
./benchmark-cache.sh packages/framework/aqueduct 10 3
# Parameters: <project-dir> <benchmark-runs> <warmup-runs>
```

## Understanding the Results

The script will generate two output files:
- `benchmark-results-<project>.md` - Markdown formatted results
- `benchmark-results-<project>.json` - JSON data for further analysis

### Example Output

```
Benchmark 1: with-cache
  Time (mean ± σ):      2.234 s ±  0.125 s    [User: 8.1 s, System: 1.2 s]
  Range (min … max):    2.105 s …  2.458 s    10 runs
 
Benchmark 2: without-cache
  Time (mean ± σ):      4.567 s ±  0.234 s    [User: 16.3 s, System: 2.1 s]
  Range (min … max):    4.289 s …  4.892 s    10 runs
 
Summary
  with-cache ran
    2.04 ± 0.15x faster than without-cache
```

## What Gets Benchmarked

The script compares:

1. **with-cache**: Build using the shared build cache
   - Reuses cached build artifacts when possible
   - Typical of incremental builds or builds after cache warming

2. **without-cache**: Build with cache disabled (`FLUID_BUILD_CACHE_DISABLED=1`)
   - Forces complete rebuild every time
   - Equivalent to clean builds

## Advanced Scenarios

### Testing Different Build Tasks

Edit the `BUILD_CMD` variable in the script to test different tasks:

```bash
# Test full build (default is compile)
BUILD_CMD="pnpm fluid-build --task build --root ${PROJECT_DIR}"

# Test just TypeScript compilation
BUILD_CMD="pnpm fluid-build --task tsc --root ${PROJECT_DIR}"

# Test with linting
BUILD_CMD="pnpm fluid-build --task lint --root ${PROJECT_DIR}"
```

### Testing Multiple Projects

Create a loop to test multiple projects:

```bash
for project in packages/framework/aqueduct packages/runtime/container-runtime packages/dds/tree; do
    echo "Benchmarking $project..."
    ./benchmark-cache.sh "$project" 5 2
done
```

### Comparing Cold vs Warm Cache

To test cold cache (first time) vs warm cache (subsequent builds):

```bash
# First, prime the cache
pnpm fluid-build --task compile --root packages/framework/aqueduct

# Then run benchmark (cache will be warm)
./benchmark-cache.sh packages/framework/aqueduct
```

## Tips for Accurate Benchmarking

1. **Close other applications**: Minimize background processes that might affect CPU/disk usage
2. **Run multiple iterations**: Use at least 5-10 runs for statistical significance
3. **Consider warmup runs**: 2-3 warmup runs help stabilize the results
4. **Test on consistent hardware**: Same machine, power settings, etc.
5. **Check disk state**: SSD vs HDD, available space, fragmentation
6. **Monitor system load**: Ensure system isn't under heavy load during benchmarks

## Interpreting Cache Performance

Good cache performance indicators:
- **2-5x speedup** for incremental builds
- **Consistent timings** across runs (low standard deviation)
- **Minimal variance** in warm cache runs

Potential issues if:
- Cache builds are slower than non-cache builds
- High variance in cached build times
- Cache hit rate is very low

## Environment Variables

The benchmark script respects these environment variables:

- `FLUID_BUILD_CACHE_DISABLED=1` - Disables the build cache
- `FLUID_BUILD_CACHE_PATH` - Custom cache location (if supported)

## Troubleshooting

### hyperfine not found
Install hyperfine using one of the methods in Prerequisites.

### Project directory not found
Ensure you're running from the repository root and the path is correct.

### Inconsistent results
- Run more iterations
- Check for background processes
- Ensure disk has sufficient space
- Try with different projects

### Cache not being used
- Check if cache directory exists and has content
- Verify no environment variables are disabling cache
- Check build tool configuration

## Examples for Different Scenarios

### Benchmark after clean install
```bash
# Clean everything
pnpm clean
rm -rf node_modules

# Install
pnpm install

# Benchmark
./benchmark-cache.sh packages/framework/aqueduct 10 3
```

### Compare cache effectiveness across packages
```bash
#!/bin/bash
packages=(
    "packages/framework/aqueduct"
    "packages/runtime/container-runtime"
    "packages/dds/tree"
    "packages/loader/container-loader"
)

for pkg in "${packages[@]}"; do
    echo "=== Benchmarking $pkg ==="
    ./benchmark-cache.sh "$pkg" 5 2
    echo ""
done
```

## Further Analysis

The JSON output can be analyzed using tools like:
- Python with pandas/matplotlib for visualization
- R for statistical analysis
- Excel/Google Sheets for charts

Example Python analysis:
```python
import json
import matplotlib.pyplot as plt

with open('benchmark-results-aqueduct.json') as f:
    data = json.load(f)

times = [result['mean'] for result in data['results']]
names = [result['command'] for result in data['results']]

plt.bar(names, times)
plt.ylabel('Time (s)')
plt.title('Build Performance Comparison')
plt.show()
```
