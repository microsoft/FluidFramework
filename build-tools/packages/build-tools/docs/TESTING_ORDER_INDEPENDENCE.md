# Testing for Glob Ordering Dependencies

## Overview

The build system uses glob patterns extensively to find input and output files. The order in which glob returns files **should not matter** for build correctness, but bugs can occur when code unintentionally depends on a specific ordering.

To catch these bugs, we've implemented **runtime order randomization** that shuffles glob results when testing.

## Quick Start

### Enable Order Randomization

Set the environment variable before running builds or tests:

```bash
FLUID_BUILD_TEST_RANDOM_ORDER=true npm run build
```

### Run Multiple Times

Since randomization is non-deterministic, run multiple times to increase confidence:

```bash
for i in {1..5}; do
  FLUID_BUILD_TEST_RANDOM_ORDER=true npm run build
done
```

If all runs succeed, your code is likely order-independent. If any fail, you've found a bug!

## How It Works

When `FLUID_BUILD_TEST_RANDOM_ORDER=true`:

1. **`globFn()`** - Shuffles results using Fisher-Yates algorithm
2. **`globWithGitignore()`** - Shuffles results using Fisher-Yates algorithm
3. **Production code unaffected** - Only shuffles when env var is explicitly set

### Example

```typescript
// Normal mode (deterministic ordering)
const files = await globFn("**/*.ts");
// Returns: ["a.ts", "b.ts", "c.ts"]

// Test mode (randomized ordering)
process.env.FLUID_BUILD_TEST_RANDOM_ORDER = "true";
const files = await globFn("**/*.ts");
// Returns: ["c.ts", "a.ts", "b.ts"] (or any other permutation)
```

## Common Order Dependencies (Anti-Patterns)

### ❌ JSON.stringify on Unsorted Arrays

```typescript
const files = await getInputFiles();
const content = JSON.stringify({ files }); // BUG: Order-dependent!
```

**Fix:**
```typescript
const files = await getInputFiles();
const content = JSON.stringify({ files: [...files].sort() }); // ✅ Sorted
```

### ❌ Building Objects from Glob Results

```typescript
const files = await globFn("src/**/*.ts");
const obj = {};
for (const file of files) {
  obj[file] = await computeHash(file); // BUG: Insertion order matters!
}
return JSON.stringify(obj); // Different JSON each run
```

**Fix:**
```typescript
const files = await globFn("src/**/*.ts");
const entries = await Promise.all(
  files.map(async (file) => [file, await computeHash(file)])
);
entries.sort((a, b) => a[0].localeCompare(b[0])); // ✅ Sorted
return JSON.stringify(Object.fromEntries(entries));
```

### ❌ Array Destructuring

```typescript
const [first, second] = await globFn("*.ts"); // BUG: Assumes order!
```

**Fix:** Don't rely on specific positions. Use explicit filtering/sorting.

## Debugging Order Dependencies

### When Tests Fail with Randomization

1. **Capture the failure:**
   ```bash
   FLUID_BUILD_TEST_RANDOM_ORDER=true npm run build 2>&1 | tee failure.log
   ```

2. **Look for common patterns:**
   - "Done file mismatch" - Check `getDoneFileContent()` implementations
   - "Hash mismatch" - Verify hashes are sorted before combining
   - Flaky test failures - Test may assume file processing order

3. **Find affected code:**
   ```bash
   # Find JSON.stringify near glob calls
   git grep -B 5 -A 5 "JSON.stringify" | grep -C 10 "glob"
   
   # Find unsorted array serialization  
   git grep "JSON.stringify.*Files" | grep -v "\.sort()"
   ```

## Best Practices

### Always Sort Before Order-Dependent Operations

```typescript
// ✅ GOOD: Explicit sorting
const files = await globFn("**/*.ts");
const sorted = [...files].sort();
return JSON.stringify({ files: sorted });

// ✅ GOOD: Sort with custom comparator
const hashes = await Promise.all(files.map(computeHash));
hashes.sort((a, b) => a.name.localeCompare(b.name));
```

### Document Order Independence

```typescript
/**
 * Computes done file content.
 * 
 * @remarks
 * This function is order-independent - file arrays are sorted before
 * serialization to ensure deterministic output regardless of glob ordering.
 */
async function getDoneFileContent(): Promise<string> {
  const files = await this.getInputFiles();
  return JSON.stringify({ files: [...files].sort() });
}
```

## References

- Implementation: `src/fluidBuild/tasks/taskUtils.ts`
- Tests: `src/test/globPatterns.test.ts`
- Full documentation: `docs/TESTING_ORDER_INDEPENDENCE.md` (this file)

---

**Remember:** Build systems should be deterministic. If changing glob ordering breaks builds, that's a bug in the build system, not the glob library!
