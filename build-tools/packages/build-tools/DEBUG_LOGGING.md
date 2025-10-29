# Debug Logging for Shared Cache

The shared cache implementation includes comprehensive debug logging using the `debug` package. This allows you to trace cache operations in detail during development and troubleshooting.

## Available Debug Traces

The cache uses the following debug namespaces:

### Cache Initialization
```bash
DEBUG=fluid-build:cache:init fluid-build
```
Shows:
- Cache directory initialization
- Configuration validation
- Statistics loading
- Initialization timing

### Cache Lookups
```bash
DEBUG=fluid-build:cache:lookup fluid-build
```
Shows:
- Cache key lookups
- Hit/miss results with reasons (entry not found, platform mismatch, Node version mismatch, lockfile mismatch)
- Lookup timing
- Number of files in cache entries

### Cache Storage
```bash
DEBUG=fluid-build:cache:store fluid-build
```
Shows:
- Cache entry storage operations
- File hashing timing
- File copying timing
- Entry size and total timing
- Reasons for skipping storage (disabled, failed task, already exists)

### Cache Restoration
```bash
DEBUG=fluid-build:cache:restore fluid-build
```
Shows:
- Cache restoration operations
- Integrity verification timing (when enabled)
- File copying timing
- Restoration timing and bytes restored

### Cache Statistics
```bash
DEBUG=fluid-build:cache:stats fluid-build
```
Shows:
- Hit/miss counts after each operation
- Total entries and cache size
- Average restore/store times

### Cache Errors
```bash
DEBUG=fluid-build:cache:error fluid-build
```
Shows:
- All cache-related errors with context
- Validation failures
- Integrity check failures

## Usage Examples

### View All Cache Operations
```bash
DEBUG=fluid-build:cache:* fluid-build --cache-dir /tmp/my-cache
```

### Focus on Performance
```bash
DEBUG=fluid-build:cache:lookup,fluid-build:cache:restore,fluid-build:cache:store fluid-build
```

### Debug Cache Misses
```bash
DEBUG=fluid-build:cache:lookup,fluid-build:cache:error fluid-build
```

### Combine with Existing Build Traces
```bash
DEBUG=fluid-build:* fluid-build
```
This enables all fluid-build debug traces including cache operations.

## Example Output

### Cache Initialization
```
fluid-build:cache:init Initializing cache at /tmp/my-cache +0ms
fluid-build:cache:init Cache directory structure initialized +15ms
fluid-build:cache:init Cache initialized in 18ms (42 entries, 156.32 MB) +3ms
fluid-build:cache:stats Stats: 42 entries, 156.32 MB +0ms
```

### Cache Hit
```
fluid-build:cache:lookup Looking up cache entry for key a1b2c3d4e5f6... (task: tsc) +0ms
fluid-build:cache:lookup HIT: Found valid cache entry a1b2c3d4e5f6 with 145 files (23ms) +23ms
fluid-build:cache:stats Cache stats: 1 hits, 0 misses +0ms
fluid-build:cache:restore Restoring cache entry a1b2c3d4e5f6 (145 files) +1ms
fluid-build:cache:restore Copied 145 files in 89ms +89ms
fluid-build:cache:restore Successfully restored cache entry a1b2c3d4e5f6 (2345.67 KB, 92ms total) +3ms
fluid-build:cache:stats Avg restore time: 92.0ms +0ms
```

### Cache Miss
```
fluid-build:cache:lookup Looking up cache entry for key a1b2c3d4e5f6... (task: tsc) +0ms
fluid-build:cache:lookup MISS: Entry not found for a1b2c3d4e5f6 (5ms) +5ms
fluid-build:cache:stats Cache stats: 1 hits, 1 misses +0ms
```

### Cache Store
```
fluid-build:cache:store Storing cache entry a1b2c3d4e5f6 for @fluidframework/build-tools#tsc (145 files) +0ms
fluid-build:cache:store Hashed 145 output files in 156ms +156ms
fluid-build:cache:store Copied 145 files to cache in 234ms +234ms
fluid-build:cache:store Stored cache entry a1b2c3d4e5f6 successfully (2345.67 KB, 395ms total) +5ms
fluid-build:cache:stats Cache stats: 43 entries, 158.67 MB total +0ms
```

### Platform Mismatch
```
fluid-build:cache:lookup Looking up cache entry for key a1b2c3d4e5f6... (task: tsc) +0ms
fluid-build:cache:lookup MISS: Platform mismatch for a1b2c3d4e5f6 (cached: win32, current: linux) (12ms) +12ms
fluid-build:cache:stats Cache stats: 1 hits, 1 misses +0ms
```

## Performance Analysis

The debug logs include timing information for all operations:

- **Lookup timing**: Should typically be < 50ms (target for p99)
- **Restore timing**: Depends on number and size of files, should be < 50% of original execution time
- **Store timing**: Includes hashing and copying, varies by file count/size
- **Hash timing**: Shows how long file integrity hashing takes
- **Copy timing**: Shows file copy performance

Use these metrics to identify performance bottlenecks and validate that cache operations are meeting performance targets.

## Troubleshooting

### Cache is Always Missing
Enable `fluid-build:cache:lookup` to see why:
- "Entry not found" - First time building, expected
- "Platform mismatch" - Cache from different OS
- "Node version mismatch" - Different Node.js version
- "Lockfile hash mismatch" - Dependencies changed

### Cache is Slow
Enable `fluid-build:cache:restore` and `fluid-build:cache:store` to see timing breakdowns:
- Check hash timing - should be fast for normal file counts
- Check copy timing - may be slow for large files or many files
- Compare restore time to original execution time

### Cache Errors
Enable `fluid-build:cache:error` to see detailed error messages:
- Validation errors show configuration issues
- Integrity failures show corrupted cache entries
- I/O errors show permission or disk space problems
