# Build Tools Development Guide

## Dependencies

This document tracks dependencies that cannot be upgraded to their latest major versions due to technical limitations.

### Dependencies Blocked from Major Version Upgrades

The following dependencies are pinned to older major versions because newer versions are incompatible with the current CommonJS-based codebase. Most of these packages have migrated to ESM-only in their latest versions.

#### ESM-Only Dependencies (Cannot upgrade until build-tools migrates to ESM)

1. **execa** - Pinned to `^5.x`
   - Latest: `^9.x`
   - Highest compatible: `^5.x` (v6+ is ESM-only)
   - Issue: Version 6+ is ESM-only and removed default export
   - Error: `Module has no default export` and `Module has no exported member 'command'`
   - Used in: `build-cli`, `build-infrastructure`

2. **globby** - Pinned to `^11.x`
   - Latest: `^16.x`
   - Highest compatible: `^11.x` (v12+ is ESM-only)
   - Issue: Version 12+ is ESM-only and removed default export
   - Error: `Module has no default export`
   - Used in: `build-cli`, `build-tools`

3. **glob** - Pinned to `^7.x`
   - Latest: `^11.x`
   - Issue: Version 8+ rewrote the API and is ESM-only
   - Error: `Cannot find name 'IOptions'` and `Property 'default' does not exist`
   - Used in: `build-tools`

4. **multimatch** - Pinned to `^5.x`
   - Latest: `^7.x`
   - Issue: Version 6+ is ESM-only
   - Error: `The current file is a CommonJS module... however, the referenced file is an ECMAScript module`
   - Used in: `build-tools`

5. **picospinner** - Pinned to `^2.x`
   - Latest: `^3.x`
   - Issue: Version 3 is ESM-only
   - Error: `however, the referenced file is an ECMAScript module and cannot be imported with 'require'`
   - Used in: `build-tools`

6. **read-pkg-up** - Pinned to `^7.x`
   - Latest: `^11.x`
   - Highest compatible: `^7.x` (v8+ has transitive dependency issues with type-fest)
   - Issue: Version 8+ is ESM-only, also pulls in incompatible type-fest versions
   - Error: `The requested module 'read-pkg-up' does not provide an export named 'default'`
   - Used in: `build-cli`

7. **replace-in-file** - Pinned to `^7.x`
   - Latest: `^8.x`
   - Issue: Version 8 is ESM-only
   - Error: `The requested module 'replace-in-file' does not provide an export named 'default'`
   - Used in: `build-cli`

8. **date-fns** - Upgraded to `^3.x` ✅
   - Latest: `^4.x`
   - Highest compatible: `^3.x` (v4+ is ESM-only)
   - Issue: Version 4+ is ESM-only
   - Used in: `build-cli`, `build-tools`
   - **Note**: Successfully upgraded to v3 for newer features while maintaining CommonJS compatibility

9. **@manypkg/get-packages** - Pinned to `^2.x`
   - Latest: `^3.x`
   - Issue: Version 3 is ESM-only
   - Error: `however, the referenced file is an ECMAScript module and cannot be imported with 'require'`
   - Used in: `build-infrastructure`, `build-tools`

10. **detect-indent** - Pinned to `^6.x`
    - Latest: `^7.x`
    - Issue: Version 7 is ESM-only
    - Error: `however, the referenced file is an ECMAScript module and cannot be imported with 'require'`
    - Used in: `build-infrastructure`, `build-tools`

11. **type-fest** - Pinned to `^2.x`
    - Latest: `^4.x`
    - Highest compatible: `^2.x` (v3+ is ESM-only)
    - Issue: Version 3+ is ESM-only
    - Error: `The current file is a CommonJS module... however, the referenced file is an ECMAScript module and cannot be imported with 'require'`
    - Used in: `build-cli`, `build-infrastructure`, `build-tools`
    - Note: v5+ also deprecated the `Opaque` type in favor of `Tagged`

#### Type Compatibility Issues

12. **@types/minimatch** - Pinned to `~5.1.2` for `@types/glob` dependency (via pnpm override)
    - Latest: `^6.x`
    - Issue: `@types/glob@7.x` uses `minimatch.IOptions` and `minimatch.IMinimatch` interfaces that were removed in `@types/minimatch@6.x`
    - Dependency chain: `sort-package-json@1.57.0 → globby@10.0.0 → @types/glob@7.2.0 → @types/minimatch@6.0.0`
    - Error: `Namespace has no exported member 'IOptions'` and `has no exported member named 'IMinimatch'`
    - Solution: pnpm override `@types/glob>@types/minimatch@~5.1.2` only affects the @types/glob dependency chain
    - Note: Targeted override allows rest of codebase to use modern minimatch/types while maintaining compatibility for glob types

13. **typescript** - Pinned to `~5.4.5`
    - Latest: `~5.7.x`
    - Issue: Version 5.9+ has stricter type checking that exposes issues with @octokit dependencies
    - Error: `Cannot find name 'ErrorOptions'`
    - Used in: `build-cli` (devDependency)

14. **ts-morph** - Pinned to `^22.x`
    - Latest: `^27.x`
    - Issue: Version 27+ requires newer TypeScript lib types
    - Error: `Cannot find name 'MapIterator'`
    - Used in: `build-cli`

15. **azure-devops-node-api** - Pinned to `^11.x`
    - Latest: `^15.x`
    - Issue: Version 15 has incompatible type definitions and breaks bundle size analysis tools
    - Error: `Types have separate declarations of a private property` and `Type is missing properties`
    - Used in: `build-cli`, `bundle-size-tools`
    - Note: Pinned at `^11.2.0` to maintain compatibility; upgrade blocked until type issues resolved

#### API/Structure Breaking Changes

16. **eslint** - Pinned to `~8.57.0`
    - Latest: `~9.x`
    - Issue: Version 9 uses flat config system incompatible with existing configuration
    - Error: `ESLint configuration is invalid: Unexpected top-level property "__esModule"`
    - Used in: `build-cli` (devDependency)

17. **eslint-config-oclif** - Pinned to `^5.x`
    - Latest: `^6.x`
    - Issue: Version 6 requires ESLint 9
    - Used in: `build-cli`, `version-tools` (devDependency)

18. **npm-check-updates** - Pinned to `^16.x`
    - Latest: `^19.x`
    - Highest compatible: `^16.x` (v17+ changed internal module structure)
    - Issue: Version 17+ changed internal module structure and removed exported types
    - Error: `Cannot find module 'npm-check-updates/build/src/types/IndexType.js'` and type errors
    - Used in: `build-cli`
