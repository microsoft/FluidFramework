# Shared Cache Implementation Plan (Enhanced)

This enhanced version addresses gaps and provides additional implementation detail for the shared cache feature.

## Critical Additions to Original Plan

### Pre-Phase: Feasibility Validation (2 hours)

#### Task 0.1: Performance Baseline Measurement (1 hour)

**Goal**: Establish baseline metrics for comparison.

**Deliverables**:
- Script to measure current build times for various scenarios
- Baseline metrics for:
  - Clean build time
  - Incremental build time
  - Memory usage during build
  - Disk I/O patterns

**Implementation**:
```bash
#!/bin/bash
# baseline-metrics.sh
time fluid-build --clean --verbose > clean-build.log 2>&1
time fluid-build --verbose > incremental-build.log 2>&1
```

#### Task 0.2: Prototype Cache Key Stability (1 hour)

**Goal**: Validate cache key computation is truly deterministic.

**Deliverables**:
- Test script that computes cache keys on different machines
- Validation that Node.js version differences are handled correctly
- Cross-platform verification (Windows/Linux/Mac)

---

## Enhanced Phase 1: Core Infrastructure

### Task 1.7: Atomic Write Operations (1.5 hours) [NEW]

**Goal**: Ensure cache writes are atomic to prevent corruption.

**Dependencies**: Tasks 1.3, 1.4

**Deliverables**:
- Create `packages/build-tools/src/fluidBuild/sharedCache/atomicWrite.ts`
- Implement:
  ```typescript
  export async function atomicWrite(
    targetPath: string,
    writeOperation: (tempPath: string) => Promise<void>
  ): Promise<void> {
    const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
    try {
      await writeOperation(tempPath);
      await rename(tempPath, targetPath);
    } catch (error) {
      await rm(tempPath, { recursive: true, force: true });
      throw error;
    }
  }
  ```

**Testing**:
- Simulate process crash during write
- Verify no partial files left behind
- Test concurrent writes to same location

### Task 1.8: Cache Statistics Tracking (1 hour) [NEW]

**Goal**: Track cache usage metrics for monitoring.

**Dependencies**: Task 1.1

**Deliverables**:
- Add to `types.ts`:
  ```typescript
  interface CacheStatistics {
    totalEntries: number;
    totalSize: number;
    hitCount: number;
    missCount: number;
    avgRestoreTime: number;
    avgStoreTime: number;
    lastPruned?: string;
  }
  ```
- Implement statistics collection and persistence

---

## Enhanced Phase 2: Cache Operations

### Task 2.5: Output Detection Strategy (1.5 hours) [NEW]

**Goal**: Reliably detect all task output files.

**Dependencies**: Task 2.3

**Deliverables**:
- Implement multiple detection strategies:
  ```typescript
  interface OutputDetectionStrategy {
    beforeExecution(): Promise<Set<string>>;
    afterExecution(): Promise<Set<string>>;
    getNewFiles(): string[];
  }

  class FileSystemSnapshotStrategy implements OutputDetectionStrategy {
    // Snapshot filesystem before/after execution
  }

  class GlobPatternStrategy implements OutputDetectionStrategy {
    // Use task-defined glob patterns
  }
  ```

**Testing**:
- Test with tasks that generate dynamic filenames
- Verify detection of nested directory creation
- Handle symbolic links correctly

### Task 2.6: Binary File Handling (1 hour) [NEW]

**Goal**: Efficiently handle binary outputs.

**Dependencies**: Task 1.5

**Deliverables**:
- Detect binary vs text files
- Stream-based copying for large files
- Optional compression for binary artifacts

---

## Enhanced Phase 3: Task Integration

### Task 3.7: Output Capture Enhancement (1.5 hours) [MODIFIED]

**Goal**: Properly capture stdout/stderr during execution.

**Dependencies**: Task 3.6

**Deliverables**:
- Modify execution wrapper:
  ```typescript
  interface ExecutionResult {
    code: number;
    stdout: string;
    stderr: string;
    duration: number;
  }

  async function executeWithCapture(
    command: string,
    args: string[]
  ): Promise<ExecutionResult> {
    const chunks = { stdout: [], stderr: [] };
    const child = spawn(command, args);

    child.stdout.on('data', (chunk) => {
      chunks.stdout.push(chunk);
      process.stdout.write(chunk); // Still show output
    });

    child.stderr.on('data', (chunk) => {
      chunks.stderr.push(chunk);
      process.stderr.write(chunk);
    });

    // ... handle completion
  }
  ```

### Task 3.8: Task-Specific Output Collection (2 hours) [NEW]

**Goal**: Handle different task types' output patterns.

**Dependencies**: Task 3.3

**Deliverables**:
- Task-specific output collectors:
  ```typescript
  class TscOutputCollector {
    getOutputGlobs(): string[] {
      return ['**/*.js', '**/*.d.ts', '**/*.js.map', '**/*.tsbuildinfo'];
    }
  }

  class EslintOutputCollector {
    getOutputGlobs(): string[] {
      return []; // ESLint doesn't produce outputs
    }
  }

  class WebpackOutputCollector {
    getOutputGlobs(): string[] {
      // Read from webpack config
    }
  }
  ```

---

## Enhanced Phase 4: CLI and Configuration

### Task 4.5: Cache Management Commands (1.5 hours) [NEW]

**Goal**: Add cache management utilities.

**Dependencies**: Task 4.1

**Deliverables**:
- Add CLI commands:
  ```bash
  fluid-build --cache-stats        # Show cache statistics
  fluid-build --cache-clean        # Clear entire cache
  fluid-build --cache-prune <size> # Prune to specified size
  fluid-build --cache-verify       # Verify cache integrity
  ```

### Task 4.6: Configuration File Support (1 hour) [NEW]

**Goal**: Support cache configuration via file.

**Dependencies**: Task 4.1

**Deliverables**:
- Support `.fluid-build-cache.json`:
  ```json
  {
    "cacheDir": "/path/to/cache",
    "maxSize": "10GB",
    "maxAge": "30d",
    "verifyIntegrity": false,
    "excludePackages": ["@internal/test-*"]
  }
  ```

---

## Enhanced Phase 5: Testing and Validation

### Task 5.6: Concurrent Access Testing (1.5 hours) [NEW]

**Goal**: Verify cache handles concurrent access safely.

**Dependencies**: Task 5.1

**Deliverables**:
- Test scenarios:
  ```typescript
  it('should handle concurrent writes to same cache key', async () => {
    const promises = Array(10).fill(0).map(() =>
      sharedCache.store(keyInputs, outputs)
    );

    await Promise.all(promises);
    // Verify only one entry exists and is valid
  });

  it('should handle read during write', async () => {
    const writePromise = sharedCache.store(keyInputs, largeOutputs);
    await sleep(10); // Start write

    const readResult = await sharedCache.lookup(keyInputs);
    expect(readResult).toBeUndefined(); // Not available until write completes
  });
  ```

### Task 5.7: Cross-Platform Testing (1 hour) [NEW]

**Goal**: Verify cache works across different operating systems.

**Dependencies**: Task 5.1

**Deliverables**:
- Platform-specific test cases:
  - Path separator handling
  - Case sensitivity differences
  - Permission model variations
  - Symbolic link behavior

### Task 5.8: Performance Regression Testing (1 hour) [NEW]

**Goal**: Detect performance regressions.

**Dependencies**: Task 5.2

**Deliverables**:
- Automated performance tests:
  ```typescript
  describe('Performance Benchmarks', () => {
    it('cache lookup should be < 50ms', async () => {
      const start = performance.now();
      await sharedCache.lookup(keyInputs);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
    });

    it('cache restore should be faster than compilation', async () => {
      const compileTime = await measureCompilation();
      const restoreTime = await measureRestore();
      expect(restoreTime).toBeLessThan(compileTime * 0.5);
    });
  });
  ```

---

## Implementation Risks and Mitigations

### High-Risk Areas

1. **Cache Corruption**
   - Risk: Partial writes could corrupt cache
   - Mitigation: Atomic writes, manifest validation, automatic recovery

2. **Performance Degradation**
   - Risk: Cache overhead exceeds benefit
   - Mitigation: Benchmark-driven development, early performance testing

3. **Cross-Platform Incompatibility**
   - Risk: Works on Linux but fails on Windows
   - Mitigation: CI testing on all platforms, path normalization

4. **Storage Exhaustion**
   - Risk: Cache grows unbounded
   - Mitigation: Size limits, age-based pruning, monitoring

---

## Success Metrics (Updated)

### Performance Targets
- Cache lookup: < 50ms (p99)
- Cache hit rate: > 80% for identical inputs
- Restore time: < 50% of task execution time
- Storage efficiency: < 2x original file size (including metadata)

### Quality Metrics
- Zero data corruption incidents
- < 1% cache-related build failures
- 100% atomic write success rate
- Cross-platform compatibility: 100%

---

## Validation Checklist

Before considering implementation complete:

- [ ] All unit tests pass on Linux, Windows, macOS
- [ ] Integration tests cover all task types
- [ ] Performance benchmarks meet targets
- [ ] Concurrent access is safe (tested with 10+ parallel builds)
- [ ] Cache corruption recovery works
- [ ] Documentation includes troubleshooting guide
- [ ] Telemetry/metrics collection functional
- [ ] Backward compatibility maintained
- [ ] Memory usage acceptable (< 10% increase)
- [ ] Error messages are helpful and actionable

---

## Total Estimated Time

**Original phases**: 18-22 hours
**Additional tasks**: 11.5 hours
**Total with enhancements**: 29.5-33.5 hours

**With parallelization (5 agents)**: 18-20 hours

---

**Document Version**: 1.1 (Enhanced)
**Last Updated**: 2025-10-28
**Status**: Ready for implementation with improvements