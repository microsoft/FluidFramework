# Shared Cache Design for fluid-build

## Executive Summary

This document describes the design and implementation plan for adding a shared cache capability to the `fluid-build` task scheduler. The shared cache will enable multiple build invocations on the same machine to share build artifacts, dramatically reducing build times for repeated builds.

**MVP Goal**: Enable read-write local disk caching that speeds up multiple builds on the same machine.

**Future Goal**: Support networked/cloud storage for team-wide cache sharing.

## Background

### Current State

The `fluid-build` task scheduler currently implements **session-local incremental builds**:

- **Done Files**: Each task writes a `.done.build.log` file containing input/output file hashes or stats
- **Per-Session Cache**: `FileHashCache` stores file hashes in memory for the current build only
- **Up-to-Date Checking**: Tasks compare current state against done files to determine if execution is needed
- **TypeScript Integration**: Special handling for `.tsbuildinfo` files for tsc incremental compilation

**Limitations**:
- Cache is cleared between build sessions
- No sharing of artifacts across different build invocations
- Clean builds must recompute everything
- CI builds cannot benefit from local development builds

### Key Architecture Points

**Task Execution Flow** (from `leafTask.ts`):
```typescript
1. checkLeafIsUpToDate() → Check if task needs to run
2. exec() → Execute task if needed
3. markExecDone() → Record completion state
```

**Incremental Detection** (from `leafTask.ts:502-540`):
- Read done file JSON
- Compute expected content (input/output hashes)
- Compare strings
- If match → skip task
- Otherwise → run and write new done file

**Output Tracking** (from `fluidTaskDefinitions.ts:50-91`):
```typescript
interface TaskFileDependencies {
  inputGlobs: readonly string[];
  outputGlobs: readonly string[];
  gitignore?: ("input" | "output")[];
  includeLockFiles?: boolean;
}
```

## Design Goals

### Functional Requirements

1. **Cache Hit Detection**: Determine if a task's outputs are already cached based on inputs
2. **Cache Storage**: Persist task outputs (files + terminal output) to disk
3. **Cache Restoration**: Copy cached outputs back to the workspace when cache hits occur
4. **Cache Invalidation**: Automatically invalidate when tool versions, Node version, or dependencies change
5. **Incremental Adoption**: Opt-in initially, with path to opt-out in the future

### Non-Functional Requirements

1. **Performance**: Cache lookups must be faster than task execution (< 100ms overhead per task)
2. **Reliability**: Cache misses are acceptable; cache corruption must never break builds
3. **Transparency**: Developers should understand when/why cache is used via debug output
4. **Compatibility**: Must work alongside existing incremental build system
5. **Portability**: Architecture must support future networked cache backends

### Explicit Non-Goals (MVP)

- ❌ Remote/networked cache storage
- ❌ Cache priming from CI builds
- ❌ Cache statistics dashboard
- ❌ Distributed cache coordination
- ❌ Cache compression

## Architecture

### Cache Directory Structure

```
{cacheRoot}/
├── index.json                    # Global metadata and version
├── v1/                           # Versioned cache format
│   ├── metadata.json             # Schema version, creation time
│   └── entries/
│       └── {cacheKey}/           # One directory per cache entry
│           ├── manifest.json     # Entry metadata
│           ├── outputs/          # Cached output files (mirrored structure)
│           │   ├── dist/
│           │   │   └── index.js
│           │   └── lib/
│           │       └── types.d.ts
│           ├── stdout.log        # Command stdout
│           └── stderr.log        # Command stderr
```

**Location Priority**:
1. `--cache-dir` CLI flag
2. `FLUID_BUILD_CACHE_DIR` environment variable
3. Disabled (no cache) if neither is set

### Cache Key Computation

The cache key uniquely identifies a task execution context. It is a SHA-256 hash of:

```typescript
interface CacheKeyInputs {
  // Task identity
  packageName: string;           // e.g., "@fluidframework/build-tools"
  taskName: string;              // e.g., "compile"
  executable: string;            // e.g., "tsc"
  command: string;               // Full command line

  // Input files
  inputHashes: Array<{
    path: string;                // Relative to package root
    hash: string;                // SHA-256
  }>;

  // Environment
  nodeVersion: string;           // process.version (e.g., "v20.15.1")
  platform: string;              // process.platform (e.g., "linux")

  // Dependencies
  lockfileHash: string;          // Hash of pnpm-lock.yaml

  // Tool configuration
  toolVersion?: string;          // For tsc, eslint, etc. (if available)
  configHashes?: Record<string, string>; // tsconfig.json, .eslintrc, etc.
}
```

**Key Properties**:
- Deterministic: Same inputs always produce same key
- Collision-resistant: Different inputs produce different keys with high probability
- Portable: Keys are consistent across machines (but cache might not be, due to node/platform)

**Computation**:
```typescript
const keyData = JSON.stringify(inputs, Object.keys(inputs).sort());
const cacheKey = createHash('sha256').update(keyData).digest('hex');
```

### Cache Entry Format

**manifest.json**:
```typescript
interface CacheManifest {
  version: 1;
  cacheKey: string;
  packageName: string;
  taskName: string;

  // Execution metadata
  executable: string;
  command: string;
  exitCode: 0;                    // Only successful executions cached
  executionTimeMs: number;

  // Environment snapshot
  nodeVersion: string;
  platform: string;
  lockfileHash: string;

  // Input tracking
  inputFiles: Array<{
    path: string;                 // Relative to package root
    hash: string;
  }>;

  // Output tracking
  outputFiles: Array<{
    path: string;                 // Relative to package root
    hash: string;                 // For integrity verification
    size: number;
  }>;

  // Timestamps
  createdAt: string;              // ISO-8601
  lastAccessedAt: string;         // For LRU pruning (future)
}
```

### Integration Points

#### 1. BuildContext Extension

Extend `BuildGraphContext` to include cache manager:

```typescript
// packages/build-tools/src/fluidBuild/buildGraphContext.ts
class BuildGraphContext implements BuildContext {
  public readonly fileHashCache: FileHashCache;
  public readonly sharedCache?: SharedCacheManager;  // NEW
  // ...
}
```

#### 2. SharedCacheManager Class

Central cache management interface:

```typescript
// packages/build-tools/src/fluidBuild/sharedCache/sharedCacheManager.ts
export class SharedCacheManager {
  constructor(
    private readonly cacheDir: string,
    private readonly repoRoot: string,
    private readonly lockfileHash: string,
  ) {}

  async lookup(
    keyInputs: CacheKeyInputs,
  ): Promise<CacheEntry | undefined>;

  async store(
    keyInputs: CacheKeyInputs,
    outputs: TaskOutputs,
  ): Promise<void>;

  async restore(
    entry: CacheEntry,
    targetDir: string,
  ): Promise<RestoreResult>;

  // Future: prune, stats, etc.
}
```

#### 3. LeafTask Modifications

Modify task execution flow in `leafTask.ts`:

**Before (current)**:
```typescript
async exec(): Promise<TaskExecResult> {
  const upToDate = await this.checkLeafIsUpToDate();
  if (upToDate) return TaskExecResult.UpToDate;

  // Run task
  const result = await this.execCore();
  await this.markExecDone();
  return result;
}
```

**After (with shared cache)**:
```typescript
async exec(): Promise<TaskExecResult> {
  // 1. Check local incremental state (fast)
  const upToDate = await this.checkLeafIsUpToDate();
  if (upToDate) return TaskExecResult.UpToDate;

  // 2. Check shared cache (if enabled)
  if (this.context.sharedCache) {
    const cached = await this.checkSharedCache();
    if (cached) {
      await this.restoreFromCache(cached);
      return TaskExecResult.CachedSuccess;  // NEW result type
    }
  }

  // 3. Execute task
  const result = await this.execCore();

  // 4. Write to local state AND shared cache
  await this.markExecDone();
  if (this.context.sharedCache && result === TaskExecResult.Success) {
    await this.writeToCache();
  }

  return result;
}
```

#### 4. CLI Integration

**Command-line flag**:
```bash
fluid-build --cache-dir /path/to/cache
```

**Environment variable**:
```bash
export FLUID_BUILD_CACHE_DIR=/tmp/fluid-build-cache
fluid-build
```

**Configuration** (in `packages/build-tools/src/fluidBuild/fluidBuild.ts`):
```typescript
interface FluidBuildOptions {
  // ... existing options
  cacheDir?: string;              // From CLI or env var
  skipCacheWrite?: boolean;       // Read-only mode (future)
  verifyCacheIntegrity?: boolean; // Optional hash verification
}
```

## Cache Operations

### Cache Lookup Flow

```
1. Compute cache key from task inputs
2. Check if cache directory exists: {cacheRoot}/v1/entries/{cacheKey}/
3. If not exists → Cache miss
4. Read manifest.json
5. Validate manifest (version, node version, platform)
6. If invalid → Cache miss
7. Return CacheEntry object → Cache hit
```

**Performance**: O(1) filesystem operations, ~1-5ms

### Cache Restoration Flow

```
1. Verify all output files exist in cache
2. For each output file:
   a. Copy from cache to target location
   b. Preserve directory structure
   c. Set appropriate permissions
3. Optional: Verify file hashes match manifest
4. Write done file (for incremental build compatibility)
5. Log cache hit to console (if verbose)
```

**Performance**: Depends on file size, typically faster than compilation

### Cache Storage Flow

```
1. Capture task outputs (from execution result)
2. Compute cache key
3. Create cache entry directory
4. Copy output files to cache (maintaining structure)
5. Hash each output file
6. Write stdout.log and stderr.log
7. Write manifest.json with metadata
8. Atomic operation: Write to temp dir, then rename
```

**Performance**: Same as file copies, happens in background

### Cache Invalidation

**Automatic invalidation occurs when**:
- Input files change (different hashes)
- Node version changes
- Platform changes (cross-platform incompatible)
- Lockfile changes (dependencies updated)
- Tool version changes (tsc, eslint, etc.)
- Configuration files change (tsconfig.json, .eslintrc, etc.)

**Manual invalidation**:
```bash
# Clear entire cache
rm -rf /path/to/cache

# Clear specific package cache
rm -rf /path/to/cache/v1/entries/
```

**Future**: Add `fluid-build --clear-cache` command

## Error Handling

### Cache Miss Scenarios

1. **No cache directory**: Silently skip cache, run task normally
2. **Cache key not found**: Expected behavior, run task and populate cache
3. **Manifest parse error**: Log warning, treat as cache miss
4. **Missing output files**: Log warning, treat as cache miss
5. **Hash mismatch** (if verification enabled): Log warning, treat as cache miss, optionally delete corrupted entry

### Cache Write Failures

1. **Disk full**: Log error, continue build (cache write is best-effort)
2. **Permission denied**: Log error, disable cache for session
3. **File copy failure**: Log warning, don't write manifest (incomplete cache entry)

### Graceful Degradation

- Cache failures never break builds
- Always fall back to task execution
- Log warnings for debugging but don't fail
- Increment error counters for telemetry (future)

## Compatibility

### Relationship to Existing Incremental Builds

**Done files remain authoritative** for session-local incremental builds:
- Fast path: Check done file first (in-memory stat, no I/O)
- Slow path: Check shared cache second (I/O required)
- Cache writes still update done files (for next local build)

**Rationale**:
- Done files are faster (local, small)
- Shared cache is broader (cross-session, cross-machine in future)
- Both can coexist without conflict

### TypeScript Incremental Builds

**TscTask continues to use `.tsbuildinfo`**:
- tsc itself manages incremental state
- Shared cache stores both `.js` outputs AND `.tsbuildinfo` files
- On cache hit, restore both code and build info
- tsc sees "up-to-date" state and skips recompilation

**Integration**:
- `TscTask.outputGlobs` must include `*.tsbuildinfo` files
- Cache manifest records these as outputs
- Restoration copies them back

### Tool-Specific Tasks

**Declarative tasks** (eslint, tslint, api-extractor):
- Already track tool versions in done files
- Cache key includes tool version
- Natural cache invalidation when tools upgrade

**Script tasks**:
- Generic tasks that run arbitrary commands
- Cache key uses command string
- May have false sharing if commands are not deterministic

## Implementation Phases

See **IMPLEMENTATION_PLAN.md** for detailed task breakdown.

### Phase 1: Core Infrastructure (6-8 hours)

1. Cache key computation and hashing
2. Cache directory structure and manifest format
3. SharedCacheManager class with lookup/store/restore
4. Unit tests for cache operations

### Phase 2: Task Integration (4-6 hours)

5. Extend BuildContext with cache manager
6. Modify LeafTask execution flow
7. Add cache hooks to task lifecycle
8. Integration tests for cache hit/miss

### Phase 3: CLI and Configuration (2-3 hours)

9. Add CLI flags and environment variable support
10. Configuration validation and error handling
11. Debug output and logging

### Phase 4: Testing and Documentation (3-4 hours)

12. End-to-end testing with real builds
13. Performance benchmarking
14. Documentation and examples

## Testing Strategy

### Unit Tests

- Cache key computation (determinism, collision resistance)
- Manifest serialization/deserialization
- File operations (copy, hash, verify)
- Error handling (missing files, corrupted manifests)

### Integration Tests

- Full task execution with cache hit/miss
- Multi-task builds with dependencies
- Cache invalidation scenarios
- Concurrent cache access (future)

### Performance Tests

- Cache lookup overhead (< 100ms target)
- Cache restoration speed vs task execution
- Large file handling
- Cache directory size growth

### Manual Testing

- Real builds on local machines
- Cross-session cache reuse
- Clean builds with/without cache
- Error scenarios (disk full, permissions)

## Monitoring and Observability

### Debug Output

Extend existing debug traces:
```bash
DEBUG=fluid-build:cache:* fluid-build --cache-dir /tmp/cache
```

**Trace categories**:
- `fluid-build:cache:lookup` - Cache key computation and lookups
- `fluid-build:cache:hit` - Cache hits with timing
- `fluid-build:cache:miss` - Cache misses with reasons
- `fluid-build:cache:store` - Cache writes with sizes
- `fluid-build:cache:error` - Cache errors and warnings

### Build Output

**Cache hit** (verbose mode):
```
[cache] build-tools#compile: Cache hit (restored 42 files, 1.2MB in 45ms)
```

**Cache miss** (debug mode):
```
[cache] build-tools#compile: Cache miss (input hash changed: src/index.ts)
```

### Statistics (Future)

Track cache effectiveness:
- Hit rate (hits / total tasks)
- Space savings (cached files size)
- Time savings (execution time - restore time)
- Error rate (failed operations)

## Future Enhancements

### Remote Cache Support

**Architecture changes needed**:
- Abstract cache backend interface (`ICacheBackend`)
- Implement `LocalDiskCache` and `RemoteBlobCache`
- Add authentication and authorization
- Handle network failures gracefully

**Potential backends**:
- AWS S3
- Azure Blob Storage
- Google Cloud Storage
- HTTP server with REST API

### Cache Priming

**From CI builds**:
- CI uploads cache entries after successful builds
- Local builds download and use CI cache
- Reduces "first build" time for developers

### Content-Addressable Storage

**Deduplication**:
- Store files by content hash (e.g., `{hash}.bin`)
- Manifests reference files by hash
- Reduces storage for identical files across packages

### Distributed Cache Coordination

**Lock-free coordination**:
- Multiple machines write to same cache
- Optimistic concurrency (last write wins)
- Atomic manifest writes prevent corruption

### Cache Analytics

**Dashboard**:
- Cache hit rates over time
- Top cache consumers (packages)
- Storage usage and trends
- Recommendations for improvement

## Security Considerations

### Cache Poisoning

**Risk**: Malicious actor places corrupted files in cache

**Mitigations**:
- Cache directory permissions (owner-only by default)
- Optional hash verification on restore
- Tamper-evident manifests (future: signatures)

### Sensitive Data Leakage

**Risk**: Build outputs contain secrets that leak via cache

**Mitigations**:
- Document that cache should not be shared across trust boundaries
- Add `--no-cache` flag for sensitive builds
- Future: Support for excluding sensitive files from cache

### Disk Exhaustion

**Risk**: Cache grows unbounded and fills disk

**Mitigations**:
- Document cache location and growth
- Future: Implement LRU pruning based on size/age
- Future: Add `--max-cache-size` configuration

## Open Questions

### Done File Relationship

**Question**: Should shared cache **replace** done files or **complement** them?

**Option A: Complement (Recommended)**:
- ✅ Maintains existing incremental build performance
- ✅ Minimal changes to current code
- ✅ Gradual rollout possible
- ❌ Two sources of truth

**Option B: Replace**:
- ✅ Single source of truth
- ✅ Simplified mental model
- ❌ Always requires I/O (slower for local incremental)
- ❌ Larger breaking change

**Recommendation**: Start with Option A (complement), consider Option B for future major version.

### Cache Key Stability

**Question**: How strictly should cache keys be computed?

**Conservative** (fewer false hits, more cache misses):
- Include all config files
- Include environment variables
- Include exact Node version (not just major)

**Aggressive** (more false hits, fewer cache misses):
- Skip minor config changes
- Ignore some environment variables
- Use Node major version only

**Recommendation**: Start conservative, add configuration to tune later.

### Concurrent Access

**Question**: How to handle multiple `fluid-build` processes accessing same cache?

**Options**:
1. **No coordination** (simple, risk of corruption)
2. **File locking** (complex, platform-dependent)
3. **Atomic writes only** (recommended: write to temp dir, atomic rename)

**Recommendation**: Use atomic writes (option 3) for MVP, add locking if needed.

## Success Metrics

### MVP Success Criteria

1. ✅ Cache hit rate > 80% for repeated builds (same inputs)
2. ✅ Cache overhead < 100ms per task
3. ✅ Restoration faster than execution for 90% of tasks
4. ✅ Zero build failures due to cache bugs
5. ✅ Positive developer feedback

### Performance Targets

- **Clean build with warm cache**: 50-70% faster than no cache
- **Incremental build with cache**: Same speed as current incremental
- **Cache lookup overhead**: < 5% of total build time

## Appendix

### Relevant Code Locations

| Component | File Path | Lines |
|-----------|-----------|-------|
| Task execution | `packages/build-tools/src/fluidBuild/tasks/leaf/leafTask.ts` | 177-213 |
| Up-to-date checking | `packages/build-tools/src/fluidBuild/tasks/leaf/leafTask.ts` | 502-540 |
| Done file format | `packages/build-tools/src/fluidBuild/tasks/leaf/leafTask.ts` | 457-540 |
| File hash cache | `packages/build-tools/src/fluidBuild/fileHashCache.ts` | 1-37 |
| Build context | `packages/build-tools/src/fluidBuild/buildGraphContext.ts` | 41-65 |
| Task definitions | `packages/build-tools/src/fluidBuild/fluidTaskDefinitions.ts` | 50-91 |
| Command execution | `packages/build-tools/src/common/utils.ts` | 44-59 |

### References

- [TypeScript Incremental Builds](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Bazel Remote Caching](https://bazel.build/remote/caching)
- [Turborepo Cache](https://turbo.build/repo/docs/core-concepts/caching)
- [Nx Cache](https://nx.dev/concepts/how-caching-works)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-28
**Author**: Design collaboration with Claude Code
**Status**: Ready for implementation
