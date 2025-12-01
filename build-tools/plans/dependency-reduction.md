# Dependency Reduction Plan for build-tools Workspace

This document outlines opportunities to reduce dependencies in the build-tools workspace, along with risk assessments and suggested approaches to reduce risk before implementation.

## Current State

The build-tools workspace has accumulated multiple dependencies serving similar purposes, particularly around:
- Globbing/path matching
- Compression
- Command execution
- File system operations

## Test Coverage Assessment

Understanding test coverage is critical for assessing risk:

| Package | Test Files | Coverage Level | Risk for Changes |
|---------|------------|----------------|------------------|
| version-tools | 5 | Good | Low |
| build-infrastructure | 6 | Good | Low |
| build-cli | 20+ | Moderate | Medium |
| build-tools | 2 | Low | High |
| bundle-size-tools | 0 | None | Very High |

## Completed Changes

### ✅ Compression Library Consolidation (Partial)

**Status:** Completed

**Change:** Replaced `pako` with `fflate` in bundle-size-tools

**Impact:**
- Removed `pako` and `@types/pako` dependencies
- `fflate` was already in use in build-cli
- Lockfile reduced by 8 lines

---

## Planned Opportunities

### 1. Globbing Library Consolidation

**Priority:** Medium  
**Risk Level:** Medium-High  
**Estimated Impact:** Remove 3-4 direct dependencies

#### Current State

Six libraries serve similar globbing/matching purposes:

| Package | Version | Used In | Purpose |
|---------|---------|---------|---------|
| `glob` | 7.2.3 | build-tools | `globFn()` wrapper in taskUtils.ts |
| `globby` | 11.1.0 | build-cli, build-infrastructure, build-tools | File matching with gitignore support |
| `multimatch` | 5.0.0 | build-tools | Biome config filtering |
| `micromatch` | 4.0.8 | build-infrastructure | Package filtering |
| `picomatch` | 2.3.1 | build-tools | Pattern scanning in DepCruiseTask |
| `minimatch` | 7.4.6 | build-cli | Path matching in repoConfig |

#### Recommended Consolidation

Consolidate on `tiny-globby`, which has a similar api to globby:

1. **Replace `glob` with `globby`** in build-tools/taskUtils.ts
2. **Replace `minimatch` with `micromatch`** in build-cli
3. **Replace `multimatch` with `micromatch`** in build-tools

#### Key Migration Considerations

Option name differences between `glob` and `globby`:

| glob option | globby/fast-glob equivalent |
|-------------|----------------------------|
| `nodir: true` | `onlyFiles: true` (default) |
| `follow: true` | `followSymbolicLinks: true` |
| `ignore: "pattern"` | `ignore: ["pattern"]` (array required) |

#### Risk Reduction Steps

1. **Add integration tests for glob-dependent functionality:**
   - Create test cases in `build-tools/src/test/` covering:
     - `CopyfilesTask` glob behavior with various options
     - `TypeValidationTask` output file discovery
     - `GoodFence` input file enumeration
     - `DepCruiseTask` pattern matching
   - Test edge cases: dot files, symlinks, nested directories

2. **Create a compatibility wrapper:**
   ```typescript
   // Temporary adapter that accepts old glob options and converts to globby
   export function globFn(pattern: string, options: GlobCompatOptions = {}): Promise<string[]> {
     return globby(pattern, {
       onlyFiles: options.nodir ?? true,
       followSymbolicLinks: options.follow ?? false,
       ignore: options.ignore ? [options.ignore] : [],
       cwd: options.cwd,
       absolute: options.absolute,
       dot: options.dot,
     });
   }
   ```

3. **Migrate incrementally by file:**
   - Start with files that have test coverage
   - Manually verify behavior for untested files

---

### 2. Additional Compression Consolidation

**Priority:** Low  
**Risk Level:** Low-Medium  
**Estimated Impact:** Remove 1 dependency

#### Current State

| Package | Used In | Purpose |
|---------|---------|---------|
| `fflate` | build-cli, bundle-size-tools | Gzip decompression |
| `jszip` | build-cli, bundle-size-tools | ZIP file handling |

#### Recommendation

Consider replacing `jszip` with `fflate` for ZIP handling:
- `fflate` has ZIP support via `unzipSync`/`zipSync`
- However, `jszip` provides streaming and more features

#### Risk Reduction Steps

1. Audit all `jszip` usage patterns
2. Verify `fflate` can handle all use cases
3. If not, keep both (different purposes)

---

### 3. Command Execution (execa)

**Priority:** Deferred  
**Risk Level:** High  
**Estimated Impact:** Minimal (transitive dependency reduction only)

#### Current State

`execa` v5.1.1 is used in 11+ files across:
- build-infrastructure (2 files)
- build-cli (9+ files)

#### Usage Patterns

```typescript
// Async command execution
await execa('npm', ['publish', ...args], { cwd, stdio })

// Sync command execution  
execa.sync('git', ['rev-parse', '--show-toplevel'], { cwd, stdio })
```

#### Recommendation

**Keep `execa` for now.** Reasons:
- Cross-platform compatibility is essential
- Extensively tested in the npm ecosystem
- Native `child_process` alternatives require significant boilerplate
- Risk outweighs minimal benefit

#### Future Consideration

When upgrading to execa v6+, evaluate `tinyexec` as a lighter alternative for simple use cases.

---

### 4. File System Utilities (fs-extra)

**Priority:** Low  
**Risk Level:** Low  
**Estimated Impact:** Minimal

#### Current State

`fs-extra` used in 7+ files for:
- `readJsonSync`, `writeJson`, `writeJsonSync`
- `mkdirpSync`
- `copySync`

#### Recommendation

**Keep `fs-extra`.** Reasons:
- Well-maintained with minimal footprint
- Node.js alternatives require more code
- Not a significant source of bloat

#### Gradual Migration Path (Optional)

If desired, these can be replaced with native Node.js equivalents:

| fs-extra | Native equivalent |
|----------|-------------------|
| `mkdirpSync` | `fs.mkdirSync(path, { recursive: true })` |
| `readJsonSync` | `JSON.parse(fs.readFileSync(path, 'utf8'))` |
| `writeJsonSync` | `fs.writeFileSync(path, JSON.stringify(data, null, 2))` |

---

## Implementation Roadmap

### Phase 1: Add Test Coverage (Prerequisite)
- [ ] Add glob-related tests to build-tools
- [ ] Add basic integration tests for bundle-size-tools decompression

### Phase 2: Low-Risk Changes
- [x] Replace `pako` with `fflate` in bundle-size-tools ✅

### Phase 3: Glob Consolidation
- [ ] Create compatibility wrapper for `globFn`
- [ ] Migrate build-tools from `glob` to `globby`
- [ ] Replace `minimatch` with `micromatch` in build-cli
- [ ] Replace `multimatch` with `micromatch` in build-tools
- [ ] Remove `glob`, `minimatch`, `multimatch` dependencies

### Phase 4: Evaluate and Defer
- [ ] Re-evaluate `jszip` vs `fflate` for ZIP handling
- [ ] Monitor for `execa` alternatives during future upgrades

---

## Success Metrics

- Reduce direct dependency count by 4-6
- Maintain lockfile line count reduction
- Zero regressions in build functionality
- All existing tests continue to pass

---

## References

- [globby documentation](https://github.com/sindresorhus/globby)
- [fast-glob options](https://github.com/mrmlnc/fast-glob#options-3)
- [fflate documentation](https://github.com/101arrowz/fflate)
