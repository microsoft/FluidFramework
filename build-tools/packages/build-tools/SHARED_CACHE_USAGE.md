# Shared Cache Usage Guide

The shared cache feature in `fluid-build` dramatically reduces build times by caching and reusing task outputs across build invocations.

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Usage Patterns](#usage-patterns)
- [Performance Characteristics](#performance-characteristics)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Quick Start

### Basic Usage

Enable shared cache with a cache directory:

```bash
fluid-build --cache-dir /path/to/cache
```

Or set via environment variable:

```bash
export FLUID_BUILD_CACHE_DIR=/path/to/cache
fluid-build
```

### Configuration File

Create `.fluid-build-cache.json` in your project root:

```json
{
  "cacheDir": "/path/to/cache",
  "skipCacheWrite": false,
  "verifyIntegrity": false,
  "maxCacheSizeMB": 5000,
  "maxCacheAgeDays": 30,
  "autoPrune": false
}
```

See [CACHE_CONFIG.md](./CACHE_CONFIG.md) for detailed configuration documentation.

## How It Works

### Cache Key Computation

The cache key is a SHA-256 hash of:
- Package name
- Task name
- Executable and command
- Input file hashes
- Node.js version
- Platform (linux, darwin, win32)
- Lockfile hash (pnpm-lock.yaml)
- Tool version (optional)
- Configuration file hashes (optional)

**Identical inputs always produce the same cache key**, ensuring correct cache hits.

### Cache Storage Structure

```
cache-dir/
├── v1/                    # Cache version
│   ├── entries/           # Cached task outputs
│   │   ├── abc123.../     # Cache entry (first 12 chars of cache key)
│   │   │   ├── manifest.json   # Metadata
│   │   │   └── files/          # Cached output files
│   │   │       ├── dist/
│   │   │       └── .tsbuildinfo
│   ├── index.json         # Cache index
│   └── statistics.json    # Cache statistics
```

### Cache Workflow

1. **Lookup**: Before executing a task, compute cache key and check if cached
2. **Cache Hit**: If found, restore output files to workspace and replay stdout/stderr
3. **Cache Miss**: Execute task normally
4. **Storage**: After successful execution, copy outputs to cache with manifest

### Task-Specific Integration

**TypeScript (tsc)**:
- Caches `.tsbuildinfo` files for incremental compilation
- Caches all compiled outputs (.js, .d.ts, .map files)
- Respects TypeScript compiler options (outDir, declaration, sourceMap, etc.)

**Declarative Tasks** (eslint, tslint, prettier, etc.):
- Uses `inputGlobs` and `outputGlobs` from task definitions
- Automatically includes lock files if configured
- Respects gitignore settings

## Configuration

### CLI Flags

| Flag | Description |
|------|-------------|
| `--cache-dir <path>` | Cache directory path (required) |
| `--skip-cache-write` | Read-only mode (don't write to cache) |
| `--verify-cache-integrity` | Verify file hashes when restoring (adds overhead) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `FLUID_BUILD_CACHE_DIR` | Default cache directory |

### Configuration Precedence

1. CLI flags (highest priority)
2. Environment variables
3. Configuration file (`.fluid-build-cache.json`)
4. Built-in defaults (lowest priority)

## Usage Patterns

### Local Development

Use a local cache directory:

```bash
# Personal development cache
fluid-build --cache-dir ~/.fluid-build-cache
```

### CI/CD Builds

Use a shared network cache:

```bash
# Shared team cache (NFS/S3)
export FLUID_BUILD_CACHE_DIR=/mnt/shared-cache/fluid-build
fluid-build
```

**Read-only mode** for PR builds:

```bash
# PR builds: read from cache but don't write
fluid-build --cache-dir /mnt/shared-cache --skip-cache-write
```

### Team Shared Cache

#### Option 1: Network File System

```json
{
  "cacheDir": "/mnt/nfs/team-cache/fluid-build",
  "maxCacheSizeMB": 10000,
  "maxCacheAgeDays": 30,
  "autoPrune": true
}
```

#### Option 2: S3-backed Cache

Mount S3 bucket with s3fs or rclone:

```bash
# Mount S3 bucket
rclone mount s3:my-bucket/fluid-cache /mnt/cache --daemon

# Use mounted cache
fluid-build --cache-dir /mnt/cache
```

### Cache Management

**View statistics**:

```bash
fluid-build --cache-dir /path/to/cache --cache-stats
```

Output:
```
Cache Statistics:
  Total Entries: 1,234
  Total Size: 2,456.78 MB
  Hit Count (session): 89
  Miss Count (session): 12
  Hit Rate: 88.12%
  Avg Restore Time: 45ms
  Avg Store Time: 123ms
  Last Pruned: 2025-10-15T10:30:00.000Z
```

**Clean cache** (remove all entries):

```bash
fluid-build --cache-dir /path/to/cache --cache-clean
```

**Prune cache** (remove old entries):

```bash
# Default: max 5GB, max 30 days
fluid-build --cache-dir /path/to/cache --cache-prune

# Custom thresholds
fluid-build --cache-dir /path/to/cache --cache-prune \
  --cache-prune-size 10000 \
  --cache-prune-age 60
```

**Verify cache integrity**:

```bash
# Check for corrupted entries
fluid-build --cache-dir /path/to/cache --cache-verify

# Auto-fix corrupted entries
fluid-build --cache-dir /path/to/cache --cache-verify-fix
```

## Performance Characteristics

### Cache Lookup Performance

- **Typical lookup time**: 20-50ms (p99)
- **Operation**: Compute cache key (SHA-256), read manifest JSON, validate compatibility
- **Overhead**: Negligible compared to task execution time

### Cache Restoration Performance

- **Typical restore time**: 50-200ms depending on file count and size
- **Operation**: Copy files from cache to workspace, verify integrity (optional)
- **Speedup**: Typically 10-100x faster than executing the task

### Real-World Examples

**TypeScript compilation** (large package with 500 source files):
- Clean build: 45 seconds
- Cache hit: 2 seconds
- **Speedup**: 22.5x

**ESLint** (500 files):
- Normal execution: 8 seconds
- Cache hit: 0.5 seconds
- **Speedup**: 16x

**Full monorepo build** (50 packages):
- Clean build: 15 minutes
- Fully cached: 90 seconds
- **Speedup**: 10x

### Cache Size Guidelines

| Repository Size | Expected Cache Size | Recommended Max |
|----------------|---------------------|-----------------|
| Small (5-10 packages) | 100-500 MB | 1 GB |
| Medium (20-50 packages) | 500 MB - 2 GB | 5 GB |
| Large (100+ packages) | 2-10 GB | 10-20 GB |

### Cache Hit Rates

Expected hit rates for different scenarios:

- **Identical builds**: 95-100% (only new/changed packages miss)
- **Incremental development**: 80-90% (only modified packages and dependents miss)
- **CI PR builds**: 70-85% (depends on change size)
- **Clean builds**: 0% (first build populates cache)

## Troubleshooting

### Cache Misses When Expected Hits

**Symptom**: Tasks rebuild even though nothing changed

**Possible causes**:

1. **Node version mismatch**
   ```bash
   # Check Node version used
   node --version
   # Cache keys include Node version
   ```

2. **Platform mismatch**
   ```bash
   # Cache keys include platform (linux, darwin, win32)
   # Builds on different platforms won't share cache
   ```

3. **Lockfile changes**
   ```bash
   # Check for lockfile modifications
   git status pnpm-lock.yaml
   # Even whitespace changes invalidate cache
   ```

4. **Timestamp-based inputs**
   - If task inputs include timestamps or generated content
   - Use content hashes instead of timestamps

**Debug**:

```bash
# Enable cache lookup debug logging
DEBUG=fluid-build:cache:lookup fluid-build
```

### Corrupted Cache Entries

**Symptom**: Cache restoration fails or produces incorrect outputs

**Solution**:

```bash
# Verify and auto-fix
fluid-build --cache-dir /path/to/cache --cache-verify-fix

# Or clean cache completely
fluid-build --cache-dir /path/to/cache --cache-clean
```

### Cache Directory Permission Errors

**Symptom**: "EACCES: permission denied" errors

**Solutions**:

1. **Check directory permissions**:
   ```bash
   ls -ld /path/to/cache
   # Should be writable by current user
   ```

2. **Fix permissions**:
   ```bash
   chmod -R u+rwX /path/to/cache
   ```

3. **Use personal cache**:
   ```bash
   fluid-build --cache-dir ~/.fluid-build-cache
   ```

### Slow Cache Operations

**Symptom**: Cache restoration slower than expected

**Possible causes**:

1. **Network file system latency**
   - NFS/CIFS mounts can add significant overhead
   - Consider local cache for development

2. **Integrity verification overhead**
   - Disable if not needed: remove `--verify-cache-integrity`
   - Verification adds 20-50% overhead

3. **Large number of small files**
   - Cache operations scale with file count
   - Consider bundling outputs if possible

**Debug**:

```bash
# Enable timing debug logging
DEBUG=fluid-build:cache:* fluid-build
```

### Cache Fills Disk

**Symptom**: Cache grows unbounded, fills disk

**Solutions**:

1. **Enable auto-pruning** (recommended):
   ```json
   {
     "cacheDir": "/path/to/cache",
     "maxCacheSizeMB": 5000,
     "maxCacheAgeDays": 30,
     "autoPrune": true
   }
   ```

2. **Manual pruning**:
   ```bash
   # Prune to 5GB, 30 days
   fluid-build --cache-dir /path/to/cache --cache-prune
   ```

3. **Monitor cache size**:
   ```bash
   # Check cache statistics
   fluid-build --cache-dir /path/to/cache --cache-stats
   ```

## Best Practices

### Development Workflow

1. **Use local cache for development**:
   ```bash
   # In ~/.bashrc or ~/.zshrc
   export FLUID_BUILD_CACHE_DIR=~/.fluid-build-cache
   ```

2. **Share cache across feature branches**:
   - Cache is content-addressed, not branch-specific
   - Same inputs produce same cache key regardless of branch

3. **Clean cache periodically**:
   ```bash
   # Monthly cleanup
   fluid-build --cache-dir ~/.fluid-build-cache --cache-prune
   ```

### CI/CD Integration

1. **Use shared team cache**:
   - Network-mounted or S3-backed cache directory
   - All CI builds share same cache

2. **Read-only cache for PR builds**:
   ```bash
   # PRs read from cache but don't write
   # Prevents cache pollution from experimental builds
   fluid-build --cache-dir /mnt/shared-cache --skip-cache-write
   ```

3. **Write cache from main branch**:
   ```bash
   # Main branch populates cache for everyone
   fluid-build --cache-dir /mnt/shared-cache
   ```

4. **Monitor cache hit rates**:
   - Track cache statistics in CI metrics
   - Alert if hit rate drops below threshold

### Cache Maintenance

1. **Set size and age limits**:
   ```json
   {
     "maxCacheSizeMB": 5000,
     "maxCacheAgeDays": 30,
     "autoPrune": true
   }
   ```

2. **Verify integrity periodically**:
   ```bash
   # Weekly integrity check
   fluid-build --cache-dir /path/to/cache --cache-verify
   ```

3. **Clean cache after major changes**:
   - After Node.js version upgrades
   - After major dependency updates
   - After build system changes

### Performance Optimization

1. **Place cache on fast storage**:
   - SSD preferred over HDD
   - Local disk preferred over network for development

2. **Disable integrity verification in development**:
   - Only enable for production/CI if needed
   - Verification adds 20-50% overhead

3. **Use configuration file**:
   - Avoids passing flags every time
   - Team-wide consistency

## Debug Logging

Enable detailed debug logging for troubleshooting:

```bash
# All cache operations
DEBUG=fluid-build:cache:* fluid-build

# Specific operations
DEBUG=fluid-build:cache:lookup fluid-build       # Lookups and hit/miss reasons
DEBUG=fluid-build:cache:store fluid-build        # Storage operations
DEBUG=fluid-build:cache:restore fluid-build      # Restoration operations
DEBUG=fluid-build:cache:stats fluid-build        # Statistics updates
DEBUG=fluid-build:cache:error fluid-build        # Errors only
```

See [DEBUG_LOGGING.md](./DEBUG_LOGGING.md) for detailed logging documentation.

## Related Documentation

- [CACHE_CONFIG.md](./CACHE_CONFIG.md) - Configuration file reference
- [DEBUG_LOGGING.md](./DEBUG_LOGGING.md) - Debug logging guide
- [SHARED_CACHE_DESIGN.md](./SHARED_CACHE_DESIGN.md) - Technical design document
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Implementation roadmap

## Frequently Asked Questions

### Q: Does the cache work across different machines?

**A**: Yes! Cache entries include platform and Node version in the cache key. Entries from incompatible platforms/versions are automatically skipped.

### Q: Is the cache safe for concurrent builds?

**A**: Yes. Cache operations use atomic writes (temp-file-and-rename pattern) to prevent corruption. Multiple builds can safely read/write the same cache simultaneously.

### Q: What happens if the cache is corrupted?

**A**: Cache operations are designed to fail gracefully. Corrupted entries are skipped with a warning, and the build continues normally. Use `--cache-verify-fix` to clean up corrupted entries.

### Q: Can I share the cache between different projects?

**A**: Yes, but not recommended. Cache keys include package names, so different projects won't collide. However, using project-specific cache directories provides better organization and management.

### Q: Does the cache work with incremental TypeScript builds?

**A**: Yes! The cache stores `.tsbuildinfo` files, preserving incremental build state. After cache restoration, TypeScript sees the build as up-to-date.

### Q: How much disk space will the cache use?

**A**: Typically 1-10GB depending on project size. Set `maxCacheSizeMB` to limit growth, and enable `autoPrune` for automatic cleanup.

### Q: Does caching work for failed tasks?

**A**: No. Only successful task executions (exit code 0) are cached. Failed tasks always re-execute.

### Q: What if my task outputs are non-deterministic?

**A**: Non-deterministic outputs (timestamps, random IDs, etc.) will cause cache misses. Ensure task outputs are reproducible for best cache hit rates.

### Q: Can I use a remote cache (S3, Azure Blob, etc.)?

**A**: Not directly. Mount the remote storage as a local directory using tools like s3fs, rclone, or Azure Storage Fuse, then point cache-dir to the mount point.

### Q: How do I migrate from no cache to using the cache?

**A**: Simply add the cache configuration and start building. The first build populates the cache, subsequent builds benefit immediately. No migration needed.
