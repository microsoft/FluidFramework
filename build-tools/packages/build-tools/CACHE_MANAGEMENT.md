# Cache Management Commands

This document describes the cache management commands available in fluid-build.

## Prerequisites

All cache management commands require the `--cache-dir` flag to specify the cache directory:

```bash
fluid-build --cache-dir /path/to/cache <command>
```

Or set the `FLUID_BUILD_CACHE_DIR` environment variable:

```bash
export FLUID_BUILD_CACHE_DIR=/path/to/cache
fluid-build <command>
```

## Commands

### Display Statistics

Show current cache statistics including hit/miss counts, cache size, and performance metrics.

```bash
fluid-build --cache-dir /path/to/cache --cache-stats
```

**Output Example:**
```
Cache Statistics:
  Total Entries: 142
  Total Size: 1456.32 MB
  Hit Count: 89 (72.4% hit rate)
  Miss Count: 34
  Average Restore Time: 124.5ms
  Average Store Time: 287.3ms
  Last Pruned: 10/28/2025, 3:45:22 PM
```

### Clean Cache

Remove all cache entries while preserving the cache directory structure. This resets statistics to zero.

```bash
fluid-build --cache-dir /path/to/cache --cache-clean
```

**Use Cases:**
- Clear cache after major dependency updates
- Free up disk space completely
- Reset cache state for troubleshooting

**Warning:** This operation is irreversible. All cached build outputs will be deleted.

### Prune Cache

Remove least recently used (LRU) cache entries based on size and age thresholds.

```bash
# Use defaults (5000 MB max size, 30 days max age)
fluid-build --cache-dir /path/to/cache --cache-prune

# Custom thresholds
fluid-build --cache-dir /path/to/cache --cache-prune --cache-prune-size 2000 --cache-prune-age 14
```

**Options:**
- `--cache-prune-size <MB>`: Maximum cache size in megabytes (default: 5000)
- `--cache-prune-age <days>`: Maximum age of entries in days (default: 30)

**Behavior:**
1. Sorts all entries by last access time (oldest first)
2. Removes entries older than the age threshold
3. If cache still exceeds size limit, removes oldest entries until under limit
4. Updates statistics after pruning

**Output Example:**
```
Pruning cache...
  Max size: 5000 MB
  Max age: 30 days
  Pruned old entry: a3f2e8d1c4b7... (35.2 days old)
  Pruned old entry: 9c1a5f3e2d8b... (32.7 days old)
  ✓ Pruned 2 entries
  ✓ Cache size after pruning: 4876.45 MB
```

**Recommended Usage:**
- Run periodically (e.g., weekly) to maintain cache health
- Adjust thresholds based on available disk space
- Use in CI/CD pipelines to prevent cache bloat

### Verify Cache Integrity

Check that all cached files exist and have correct hashes. Optionally remove corrupted entries.

```bash
# Verify only (report issues)
fluid-build --cache-dir /path/to/cache --cache-verify

# Verify and fix (remove corrupted entries)
fluid-build --cache-dir /path/to/cache --cache-verify-fix
```

**Output Example:**
```
Verifying cache integrity...
  ✗ f4e2a1c3d5b7... - 2 file(s) corrupted
  ✗ 8b6d3f1e9c2a... - Invalid manifest

Verification complete:
  Total entries: 142
  Valid: 140
  Corrupted: 2
  Fixed: 2
```

**Use Cases:**
- Diagnose cache-related build failures
- Recovery after system crashes or disk errors
- Periodic health checks
- Migration or backup verification

## Integration with CI/CD

### Automated Pruning

Add to your CI pipeline to maintain cache health:

```yaml
# Example: GitHub Actions
- name: Prune build cache
  run: |
    fluid-build --cache-dir ${{ env.CACHE_DIR }} \
      --cache-prune \
      --cache-prune-size 3000 \
      --cache-prune-age 14
```

### Cache Statistics Reporting

Track cache performance over time:

```bash
# Capture statistics as JSON (future enhancement)
fluid-build --cache-stats > cache-stats.json
```

## Performance Recommendations

### Cache Size Guidelines

- **Development workstations**: 5-10 GB (default 5 GB)
- **CI build servers**: 10-20 GB (high throughput)
- **Shared network cache**: 50+ GB (many developers)

### Pruning Strategy

| Environment | Size Limit | Age Limit | Frequency |
|-------------|-----------|-----------|-----------|
| Local Dev | 5000 MB | 30 days | Monthly |
| CI Server | 10000 MB | 14 days | Weekly |
| Shared Cache | 50000 MB | 7 days | Daily |

### When to Clean vs Prune

**Clean (--cache-clean):**
- Major version upgrades
- Build system changes
- Troubleshooting cache corruption
- Complete reset needed

**Prune (--cache-prune):**
- Regular maintenance
- Disk space management
- Performance optimization
- Normal operations

## Troubleshooting

### Cache Not Found

```
Error: Cache management commands require --cache-dir to be specified
```

**Solution:** Provide `--cache-dir` flag or set `FLUID_BUILD_CACHE_DIR` environment variable.

### Permission Errors

```
Error cleaning cache: EACCES: permission denied
```

**Solution:** Check directory permissions or run with appropriate privileges.

### Disk Space Issues

If cache operations fail due to disk space:

1. Check available space: `df -h /path/to/cache`
2. Run aggressive pruning: `--cache-prune-size 1000 --cache-prune-age 7`
3. If still failing, use `--cache-clean` to start fresh

### Corrupted Statistics

If statistics appear incorrect:

```bash
# Clean cache to reset statistics
fluid-build --cache-dir /path/to/cache --cache-clean
```

The cache automatically recalculates statistics during operations.

## Advanced Usage

### Combining with Build Operations

Cache management commands exit immediately and don't perform builds. To manage cache before building:

```bash
# Prune, then build
fluid-build --cache-dir /path/to/cache --cache-prune
fluid-build --cache-dir /path/to/cache
```

### Scripting

Create maintenance scripts for automated cache management:

```bash
#!/bin/bash
# weekly-cache-maintenance.sh

CACHE_DIR="${FLUID_BUILD_CACHE_DIR:-$HOME/.fluid-build-cache}"

echo "Starting weekly cache maintenance..."

# Display current stats
fluid-build --cache-dir "$CACHE_DIR" --cache-stats

# Verify and fix any issues
fluid-build --cache-dir "$CACHE_DIR" --cache-verify-fix

# Prune old entries
fluid-build --cache-dir "$CACHE_DIR" --cache-prune --cache-prune-age 14

echo "Maintenance complete!"
```

## See Also

- [DEBUG_LOGGING.md](./DEBUG_LOGGING.md) - Debug cache operations
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Implementation details
- [SHARED_CACHE_DESIGN.md](./SHARED_CACHE_DESIGN.md) - Cache design and architecture
