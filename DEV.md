# Guidance for FluidFramework maintainers and contributors

## Git Hooks (hk)

This repo uses [hk](https://hk.jdx.dev/) to manage git hooks. Hooks are configured in `hk.pkl` at the repo root. Currently, a pre-commit hook runs `biome format` on staged files and auto-stages the formatted results.

Git hooks are **opt-in**. To install them locally:

```shell
hk install
```

This sets up the hooks defined in `hk.pkl` to run automatically on commit. You can also run checks manually:

```shell
hk check  # verify formatting without modifying files
hk fix    # auto-format files in place
```

hk requires the [pkl](https://pkl-lang.org/) CLI. Both hk and pkl can be installed via [mise](https://mise.jdx.dev/).

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

## pnpm Supply Chain Security Settings

All workspace `pnpm-workspace.yaml` files include security-hardening settings to protect against supply chain attacks. This section documents these settings and their rationale.

### Settings Overview

| Setting | Value | Purpose |
|---------|-------|---------|
| `minimumReleaseAge` | 1440 | Block packages published less than 24 hours ago |
| `resolutionMode` | highest | Use highest matching version (see explanation below) |
| `blockExoticSubdeps` | true | Block transitive deps from using git/tarball sources |
| `trustPolicy` | no-downgrade | Fail if package trust/verification level decreases |
| `trustPolicyExclude` | [] | Packages excluded from `trustPolicy` enforcement (see note below) |
| `strictDepBuilds` | true | Require explicit approval for dependency build scripts |

### Why `resolutionMode: highest` instead of `time-based`

We would prefer to use `resolutionMode: time-based` to avoid pulling in the newest packages from npm. This delays ingestion of newly published packages, which helps avoid supply chain attacks.

However, with `resolutionMode: time-based`, the "anchor" time for a transitive dependency is the time at which the depending package was released. For example:

1. We depend on PackageA, which depends on `PackageB@^1.0.0`
2. At the time PackageA was published (t0), PackageB was at 1.0.0
3. PackageB releases 1.1.0 two weeks later
4. Version 1.1.0 matches PackageA's dependency range, but it was released outside the t0 + 24 hours window established by PackageA's release, so pnpm blocks it

This behavior is desired. However, pnpm does NOT attempt downward resolution to find a version that works (e.g., 1.0.0). Instead, it throws an error with no automatic fallback.

With `resolutionMode: highest`, we still get protection from `minimumReleaseAge: 1440`, which blocks any package published within the last 24 hours. This provides supply chain protection without the transitive dependency resolution issues.

### Trust Policy Exclusions (`trustPolicyExclude`)

`trustPolicyExclude` lists packages that are exempt from `trustPolicy: no-downgrade` enforcement. This is needed for packages that are known to be safe but were published at a date after another version of the same package (including later major versions) that had better provenance information — causing pnpm to incorrectly treat the newer version as a trust downgrade.

**This list must be reviewed carefully before adding any entry.** Only add a package here after confirming it is safe and understanding why its publication order triggers the policy.

### Build Script Approval (`strictDepBuilds`)

When `strictDepBuilds: true`, pnpm requires explicit approval before running build scripts from dependencies. Approved packages are listed in:

- **Root workspace**: `pnpm.onlyBuiltDependencies` in `/package.json`
- **Sub-workspaces with own lockfiles**: Both `pnpm.onlyBuiltDependencies` in the workspace's `package.json` AND `onlyBuiltDependencies` in the workspace's `pnpm-workspace.yaml` (due to [pnpm bug #9082](https://github.com/pnpm/pnpm/issues/9082))

To approve a new package's build scripts, add it to the appropriate `onlyBuiltDependencies` list(s).

## Claude Sandboxing Configuration

The default configuration of the codespace Docker container is not compatible with [Claude sandboxing](https://code.claude.com/docs/en/sandboxing).
There are multiple settings that need to be tweaked in both the container and Claude.

### Container security flags ([`devcontainer.json`](.devcontainer/ai-agent/devcontainer.json) `runArgs`)

Claude's sandbox uses [bubblewrap (bwrap)](https://github.com/containers/bubblewrap) to isolate processes in a user namespace with restricted mount/filesystem access. bwrap requires three capabilities that Docker containers don't grant by default:

| Flag | Why bwrap needs it |
|------|--------------------|
| `--security-opt apparmor=unconfined` | Docker's default AppArmor profile blocks `mount` and `pivot_root` syscalls that bwrap uses to build its mount namespace. |
| `--cap-add SYS_ADMIN` | bwrap needs `CAP_SYS_ADMIN` to create new mount namespaces and perform bind mounts inside them. |
| `--security-opt seccomp=unconfined` | Docker's default seccomp profile blocks `unshare`, `pivot_root`, and some `mount` calls. bwrap needs all three. |

### Root mount propagation ([`postStartCommand`](.devcontainer/ai-agent/devcontainer.json))

bwrap bind-mounts host paths into its sandbox namespace. For these mounts to propagate correctly, the root mount (`/`) must be marked as **shared**. Docker defaults to **private** propagation, which causes bwrap mounts to silently fail. The `postStartCommand` runs:

```shell
sudo mount --make-rshared /
```

This recursively marks all mount points as shared, allowing bwrap's bind mounts to work.

### Sandbox TMPDIR ([`postStartCommand`](.devcontainer/ai-agent/devcontainer.json))

Claude Code sets `TMPDIR=/tmp/claude` inside the sandbox, but doesn't create the directory itself. The sandbox allowlist permits writes to `/tmp/claude`, and the weaker sandbox bind-mounts the real `/tmp` into the namespace, so the directory just needs to exist on the host. Without it, any tool that resolves `TMPDIR` on startup (pnpm, node, etc.) crashes with `ENOENT`. The `postStartCommand` runs `mkdir -p /tmp/claude` to pre-create it. This is a workaround for a Claude Code bug ([anthropics/claude-code#21654](https://github.com/anthropics/claude-code/issues/21654)).

### `enableWeakerNestedSandbox` ([Claude settings](.claude/settings.json))

Even with the above flags, Docker still blocks mounting a fresh `/proc` filesystem inside a user namespace — a kernel-level restriction that `CAP_SYS_ADMIN` and AppArmor changes cannot override. Claude's full-strength sandbox requires this `/proc` mount. The `enableWeakerNestedSandbox` setting tells Claude to use a weaker sandbox variant that skips the `/proc` mount while still providing filesystem isolation via bwrap.

### `--copy` flag for repoverlay ([`agent-aliases.sh`](scripts/codespace-setup/agent-aliases.sh))

repoverlay defaults to applying overlays as symlinks. bwrap cannot follow symlinks when constructing its mount namespace — it bind-mounts individual paths, and a symlink at the source causes a "No such file or directory" error even when the target is within the same repo. The `--copy` flag in `agent-aliases.sh` forces repoverlay to copy files instead, avoiding this limitation.
