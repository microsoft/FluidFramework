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

## pnpm Supply Chain Security Settings

All workspace `.npmrc` files include security-hardening settings to protect against supply chain attacks. This section documents these settings and their rationale.

### Settings Overview

| Setting | Value | Purpose |
|---------|-------|---------|
| `minimum-release-age` | 1440 | Block packages published less than 24 hours ago |
| `resolution-mode` | highest | Use highest matching version (see explanation below) |
| `block-exotic-subdeps` | true | Block transitive deps from using git/tarball sources |
| `trust-policy` | no-downgrade | Fail if package trust/verification level decreases |
| `strict-dep-builds` | true | Require explicit approval for dependency build scripts |

### Why `resolution-mode=highest` instead of `time-based`

We would prefer to use `resolution-mode=time-based` to avoid pulling in the newest packages from npm. This delays ingestion of newly published packages, which helps avoid supply chain attacks.

However, with `resolution-mode=time-based`, the "anchor" time for a transitive dependency is the time at which the depending package was released. For example:

1. We depend on PackageA, which depends on `PackageB@^1.0.0`
2. At the time PackageA was published (t0), PackageB was at 1.0.0
3. PackageB releases 1.1.0 two weeks later
4. Version 1.1.0 matches PackageA's dependency range, but it was released outside the t0 + 24 hours window established by PackageA's release, so pnpm blocks it

This behavior is desired. However, pnpm does NOT attempt downward resolution to find a version that works (e.g., 1.0.0). Instead, it throws an error with no automatic fallback.

With `resolution-mode=highest`, we still get protection from `minimum-release-age=1440`, which blocks any package published within the last 24 hours. This provides supply chain protection without the transitive dependency resolution issues.

### Build Script Approval (`strict-dep-builds`)

When `strict-dep-builds=true`, pnpm requires explicit approval before running build scripts from dependencies. Approved packages are listed in:

- **Root workspace**: `pnpm.onlyBuiltDependencies` in `/package.json`
- **Sub-workspaces with own lockfiles**: Both `pnpm.onlyBuiltDependencies` in the workspace's `package.json` AND `onlyBuiltDependencies` in the workspace's `pnpm-workspace.yaml` (due to [pnpm bug #9082](https://github.com/pnpm/pnpm/issues/9082))

To approve a new package's build scripts, add it to the appropriate `onlyBuiltDependencies` list(s).
