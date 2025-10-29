# Cache Implementation - Bug Investigation

**Date**: 2025-10-29  
**Session**: 12  
**Status**: Manual testing completed, bugs identified

## Summary

Manual testing of the shared cache feature revealed that the infrastructure is working but there are 3 critical bugs preventing the cache from functioning properly.

## Bugs Identified

### Bug 1: EISDIR Error in Atomic Write (Critical)
**Location**: `src/fluidBuild/sharedCache/sharedCacheManager.ts` - `store()` method  
**Error**: 
```
Error: EISDIR: illegal operation on a directory, rename 
'/home/tylerbu/.fluid-build-cache/v1/entries/.tmp-14d05ed6efb82a5e' -> 
'/home/tylerbu/.fluid-build-cache/v1/entries/486e88826501...'
```

**Symptom**: Cache entries are partially created but the atomic rename fails  
**Impact**: Cache writes fail, no entries are successfully stored  
**Reproduction**: Build any package with cache enabled

**Investigation Steps**:
1. Check the atomicWrite.ts implementation
2. Verify the temp directory structure being created
3. Check if the issue is with renaming a directory vs a file
4. Review the manifest write vs outputs directory handling

### Bug 2: Non-existent File Detection (High Priority)
**Location**: Task output detection - `getCacheOutputFiles()` methods  
**Error**: 
```
Failed to hash file .../lib/library/dangerfile.js: 
ENOENT: no such file or directory
```

**Symptom**: Output file detection includes files that don't exist  
**Impact**: Hash computation fails, preventing cache storage  
**Reproduction**: Build @fluid-tools/build-cli

**Investigation Steps**:
1. Check TypeScriptTask.getCacheOutputFiles() implementation
2. Verify how output files are computed from TypeScript config
3. Check if declaration maps or other optional outputs are being included incorrectly
4. Review the actual outputs vs detected outputs

### Bug 3: Statistics/Index Not Updated (Medium Priority)
**Location**: Cache metadata/statistics tracking  
**Symptom**: `--cache-stats` shows 0 entries despite files existing in cache directory  
**Impact**: Cache appears empty even when entries exist  
**Reproduction**: Store cache entries, then run `--cache-stats`

**Investigation Steps**:
1. Check statistics.ts - updateCacheSizeStats() calls
2. Verify index.json is being written
3. Check if metadata.json is being updated
4. Review the store() method to see where stats should be updated

## What's Working

✅ Cache initialization and directory structure  
✅ Cache lookup mechanism  
✅ Debug logging (very helpful!)  
✅ CLI flag parsing  
✅ File hashing for inputs  
✅ Partial file copying to cache

## Test Environment

- Cache directory: `~/.fluid-build-cache`
- Test package: `@fluid-tools/build-cli`
- Environment variable: `FLUID_BUILD_CACHE_DIR=~/.fluid-build-cache`
- Debug output saved: `/tmp/cache-test-1.log`

## Next Steps

1. **Start with Bug 1** - Fix the EISDIR error (blocking all cache writes)
2. **Then Bug 2** - Fix file detection (causing store failures)
3. **Finally Bug 3** - Fix statistics tracking (quality of life)

## Debug Commands

Enable debug logging:
```bash
export DEBUG=fluid-build:cache:*
export FLUID_BUILD_CACHE_DIR=~/.fluid-build-cache
```

Clean cache:
```bash
rm -rf ~/.fluid-build-cache/v1
```

Check cache stats:
```bash
./build-tools/packages/build-tools/bin/fluid-build --root . --cache-stats
```

Test with build-cli:
```bash
cd build-tools/packages/build-cli
rm -rf lib *.tsbuildinfo
cd /home/tylerbu/code/FluidFramework/fluid-build-cache
./build-tools/packages/build-tools/bin/fluid-build --root . @fluid-tools/build-cli
```

## Files to Review

- `src/fluidBuild/sharedCache/sharedCacheManager.ts` - store() method
- `src/fluidBuild/sharedCache/atomicWrite.ts` - atomic write implementation
- `src/fluidBuild/tasks/leaf/tscTask.ts` - getCacheOutputFiles()
- `src/fluidBuild/sharedCache/statistics.ts` - stats tracking
- `src/fluidBuild/sharedCache/cacheDirectory.ts` - directory structure

## Related Documentation

- IMPLEMENTATION_STATUS.md - Session 12 notes
- SHARED_CACHE_DESIGN.md - Architecture overview
- DEBUG_LOGGING.md - Debug trace documentation
