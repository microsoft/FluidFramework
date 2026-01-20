# Guidance for FluidFramework maintainers and contributors

## Dependencies

This document tracks dependencies that cannot be upgraded to their latest major versions due to technical limitations.

### Pinned

The following dependencies are pinned to older major versions because newer versions are incompatible with the current codebase.

#### ESM-only dependencies (Cannot upgrade while shipping CJS)

1. **uuid** - Pinned to `^11.x`
   - Latest: `^13.x`
   - Issue: Version 12+ removed CommonJS support entirely
   - Impact: FluidFramework packages ship dual ESM/CJS builds. When consumers `require()` our packages, the CJS output would fail to `require('uuid')` since uuid v12+ is ESM-only.
   - Used in: Many packages across the repo (telemetry-utils, container-loader, odsp-driver, etc.)

## ESLint and typescript-eslint

### projectService vs explicit project arrays

The shared ESLint config uses `parserOptions.projectService: true` by default for TypeScript files. This is the recommended approach as of typescript-eslint v8. However, some packages require explicit `parserOptions.project` arrays due to non-standard tsconfig structures.

#### Why projectService is preferred

`projectService: true` uses TypeScript's Language Service API (the same API VS Code uses), which correctly handles advanced type features like `asserts this is` type narrowing. The explicit `project` array approach creates separate TypeScript Program instances that don't handle type narrowing across statements as well.

#### CLI vs VS Code discrepancies

If you see ESLint errors in the CLI that don't appear in VS Code (or vice versa), the cause is likely a mismatch in projectService settings:

- **VS Code's ESLint extension** may default to `projectService: true`
- **CLI** uses whatever is configured in `eslint.config.mts`

When these differ, the same code can produce different type information, causing false positives or missed errors. For example, `asserts this is` type narrowing may work correctly with projectService but fail with explicit project arrays.

**To diagnose:**
1. Check if the package's `eslint.config.mts` has `projectService: false` with an explicit `project` array
2. If so, VS Code may be using projectService while CLI uses the explicit array
3. Ensure VS Code's ESLint settings match the CLI configuration, or update the package to use projectService if possible

#### When projectService works

projectService works when all TypeScript files are covered by tsconfigs that are **discoverable**. A tsconfig is discoverable if:
1. It is named `tsconfig.json` and exists in the directory ancestry of the source file, OR
2. It is referenced (directly or transitively) via project references from a discoverable `tsconfig.json`

For example:
- `./tsconfig.json` references `./tsconfig.main.json` → both are discoverable
- `./tsconfig.json` references `./src/test/tsconfig.json` → test config is discoverable
- `./tsconfig.jest.json` with no reference from any `tsconfig.json` → NOT discoverable

#### When explicit project arrays are required

Explicit `parserOptions.project` arrays are needed when files exist that are **not covered** by any discoverable tsconfig.

Common scenarios requiring explicit arrays:
- **Standalone non-standard tsconfig naming** - e.g., `tsconfig.jest.json` or `tsconfig.cjs.lint.json` that is NOT referenced by any `tsconfig.json`
- **Files intentionally excluded from the main tsconfig graph** - e.g., test files compiled separately to test different compiler options like `exactOptionalPropertyTypes`, where referencing them from the main tsconfig would cause double-compilation
- **Test-only packages without root tsconfig.json** - no entry point for projectService to discover

These packages have comments in their `eslint.config.mts` explaining why explicit project arrays are needed.

#### Key limitation: projectService only recognizes `tsconfig.json`

The projectService **only looks for files named `tsconfig.json`**. It does not recognize `tsconfig.eslint.json`, `tsconfig.jest.json`, `tsconfig.test.json`, or any other naming convention. This is intentional - the typescript-eslint team made this choice to ensure consistency between editor type information and linting.

This means:
- Non-standard tsconfig naming requires falling back to explicit `project` arrays
- Files excluded from one `tsconfig.json` but needing a different tsconfig cannot use projectService

#### Why `allowDefaultProject` doesn't help

`allowDefaultProject` is designed for a **small number of out-of-project files** (like `eslint.config.js` or `vitest.config.ts`):
- Default limit of 8 files
- Cannot use `**` glob patterns
- Significant performance overhead per file
- Not suitable for test directories or large numbers of files

#### Potential restructuring to enable projectService

To maximize projectService usage, packages could be restructured to follow typescript-eslint's recommendations:

1. **Use `tsconfig.json` as the "lint" config** (what editors see)
2. **Use `tsconfig.build.json` for build-specific settings** (inverts the common pattern of `tsconfig.eslint.json`)
3. **Ensure every directory with TypeScript files has a `tsconfig.json`** that includes those files
4. **Use project references** to connect all tsconfigs

For example, a test-only package without a root tsconfig could add one:

```json
// root tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./src/test" }
  ]
}
```

However, some scenarios are fundamentally incompatible with projectService:
- **Files that cannot be referenced from the main tsconfig graph** - For example, test files that need different compiler options (like `exactOptionalPropertyTypes: false`) and would cause double-compilation if referenced. These files are intentionally excluded from the main tsconfig and use a separate tsconfig that cannot be added as a project reference.
- **Files needing different compiler settings than projectService would provide** - projectService uses the nearest discoverable `tsconfig.json`. If files need settings from a different tsconfig that isn't in their directory ancestry and can't be referenced, explicit arrays are required.

For these cases, use flat config overrides targeting specific file patterns:

```typescript
{
  files: ['**/*.cjs.ts'],
  languageOptions: {
    parserOptions: {
      projectService: false,
      project: ['./tsconfig.cjs.lint.json'],
    },
  },
}
```

#### References

- [Typed Linting with Project Service](https://typescript-eslint.io/blog/project-service/) - Official blog post
- [@typescript-eslint/parser documentation](https://typescript-eslint.io/packages/parser/) - Parser options reference
- [Monorepo Configuration](https://typescript-eslint.io/troubleshooting/typed-linting/monorepos/) - Monorepo-specific guidance
- [GitHub Issue #7383](https://github.com/typescript-eslint/typescript-eslint/issues/7383) - Custom tsconfig names (closed as not planned)
