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

Consolidate on `tinyglobby` for file system globbing and `picomatch` for pattern matching:

1. **Replace `glob` with `tinyglobby`** in build-tools/taskUtils.ts
2. **Replace `minimatch` with `picomatch`** in build-cli/repoConfig.ts
3. **Replace `multimatch` with `picomatch`** in build-tools/biomeConfig.ts

Note: `picomatch` is already used in `miscTasks.ts` for pattern scanning, so consolidating on it reduces total dependencies rather than adding new ones.

#### API Migration Patterns

| Original | Replacement |
|----------|-------------|
| `minimatch(path, pattern)` returns boolean | `picomatch(pattern)(path)` returns boolean |
| `multimatch(paths, patterns)` returns filtered array | `paths.filter(picomatch(patterns))` |
| `glob(pattern, options, callback)` | `tinyglobby.glob(pattern, options)` returns Promise |

#### Key Migration Considerations

Option name differences between `glob` and `tinyglobby`:

| glob option | tinyglobby/fast-glob equivalent | Used in |
|-------------|----------------------------|---------|
| `nodir: true` | `onlyFiles: true` (default) | miscTasks.ts, ts2EsmTask.ts |
| `follow: true` | `followSymbolicLinks: true` | miscTasks.ts (CopyfilesTask) |
| `ignore: "pattern"` | `ignore: ["pattern"]` (array required) | fluidRepoBuild.ts |
| `cwd` | `cwd` (same) | prettierTask.ts, ts2EsmTask.ts |
| `absolute: true` | `absolute: true` (same) | ts2EsmTask.ts |
| `dot: true` | `dot: true` (same) | miscTasks.ts (CopyfilesTask) |

#### Risk Reduction Steps

1. **Add integration tests for glob-dependent functionality:**
   - Create test cases in `build-tools/src/test/` covering:
     - `CopyfilesTask` glob behavior with various options (`dot`, `follow`, `ignore`)
     - `TypeValidationTask` output file discovery
     - `GoodFence` input file enumeration
     - `DepCruiseTask` pattern matching
   - Test edge cases: dot files, symlinks, nested directories, ignore patterns

2. **Add tests for pattern matching:**
   - Test `repoConfig.ts` branch pattern matching with various branch names
   - Test `biomeConfig.ts` include/ignore filtering with multiple patterns

3. **Create a compatibility wrapper:**
   ```typescript
   // Temporary adapter that accepts old glob options and converts to tinyglobby
   export function globFn(pattern: string, options: GlobCompatOptions = {}): Promise<string[]> {
     return glob(pattern, {
       onlyFiles: options.nodir ?? true,
       followSymbolicLinks: options.follow ?? false,
       ignore: Array.isArray(options.ignore) ? options.ignore : options.ignore ? [options.ignore] : [],
       cwd: options.cwd,
       absolute: options.absolute,
       dot: options.dot,
     });
   }
   ```

4. **Migrate incrementally by file:**
   - Start with files that have test coverage
   - Manually verify behavior for untested files

5. **Migration code for minimatch → picomatch** (in repoConfig.ts):
   ```typescript
   // Before
   import { minimatch } from "minimatch";
   if (minimatch(branch, branchPattern) === true) { ... }

   // After
   import picomatch from "picomatch";
   const isMatch = picomatch(branchPattern);
   if (isMatch(branch)) { ... }
   ```

6. **Migration code for multimatch → picomatch** (in biomeConfig.ts):
   ```typescript
   // Before
   import multimatch from "multimatch";
   const includedPaths = multimatch([...gitLsFiles], prefixedIncludes);

   // After
   import picomatch from "picomatch";
   const isMatch = picomatch(prefixedIncludes);
   const includedPaths = [...gitLsFiles].filter(isMatch);
   ```

7. **Gitignore support with tinyglobby:**
   
   Unlike `globby`, `tinyglobby` does not have built-in gitignore support. If gitignore filtering is needed, use this pattern (from [e18e.dev](https://e18e.dev/docs/replacements/globby.html)):
   
   ```typescript
   import { execSync } from 'node:child_process';
   import { escapePath, glob } from 'tinyglobby';

   async function globWithGitignore(patterns, options = {}) {
     const { cwd = process.cwd(), ...restOptions } = options;

     try {
       const gitIgnored = execSync(
         'git ls-files --others --ignored --exclude-standard --directory',
         { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
       )
       .split('\n')
       .filter(Boolean)
       .map(p => escapePath(p));

       return glob(patterns, {
         ...restOptions,
         cwd,
         ignore: [...(restOptions.ignore || []), ...gitIgnored]
       });
     } catch {
       return glob(patterns, options);
     }
   }
   ```
   
   Note: The current `globFn` usage in build-tools does not appear to rely on gitignore support, so this may not be needed for the initial migration.

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
- [ ] Migrate build-tools from `glob` to `tinyglobby`
- [ ] Replace `minimatch` with `picomatch` in build-cli
- [ ] Replace `multimatch` with `picomatch` in build-tools
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

- [tinyglobby documentation](https://github.com/SuperchupuDev/tinyglobby)
- [picomatch documentation](https://github.com/micromatch/picomatch)
- [fast-glob options](https://github.com/mrmlnc/fast-glob#options-3)
- [fflate documentation](https://github.com/101arrowz/fflate)
