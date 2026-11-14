---
applyTo: "build-tools/**"
---

# Build Tools

`build-tools/` is a separate pnpm workspace.
Use its `package.json`, `pnpm-workspace.yaml`, and each affected package's manifest as the source of truth for supported Node.js, pnpm, TypeScript, and dependency versions.
Do not install this release group from the repository root.

For release documentation, use [conventional commits](../../build-tools/README.md#documenting-build-tools-changes), not changesets.
Follow the repository-wide instructions in `.github/copilot-instructions.md`.

## Building and Testing

Run these commands from `build-tools/`:

```bash
# Restore dependencies when missing or after dependency changes.
pnpm install --frozen-lockfile

# Compile workspace packages in dependency order, including tests.
pnpm build:compile

# Full build, including lint and API documentation.
pnpm build

# Run the compiled workspace tests.
pnpm test:mocha

# Check formatting, dependency consistency, and ESLint.
pnpm lint
```

For a focused `build-cli` change, first build its workspace dependencies with `pnpm build:compile`.
Then run from `build-tools/packages/build-cli/`:

```bash
pnpm tsc
pnpm build:test
pnpm exec mocha --no-config lib/test/commands/<test>.test.js --forbid-only --timeout 120000
pnpm exec eslint src/commands/<changed-command>.ts
```

Tests compile separately from production code.
`pnpm tsc` alone does not compile tests or prepare non-TypeScript test fixtures.
Use the affected package's scripts and Mocha configuration to choose the smallest applicable test run.
Select specific compiled test files for a focused run; `--grep` alone still loads unrelated test modules and their top-level setup.
Do not clean the entire workspace to address a missing dependency or an unrelated test failure.

## Package and Module Boundaries

- `@fluid-tools/build-cli` (`flub`): ESM, output in `lib/`.
- `@fluidframework/build-tools`: CommonJS, output in `dist/`.
- `@fluid-tools/build-infrastructure`: dual ESM/CommonJS, outputs in `lib/` and `dist/`.
- `@fluid-tools/version-tools` (`fluv`): CommonJS, output in `lib/`.

The `fluid-build` scheduler resolves package dependencies and task order.
Task definitions are in `fluidBuild.config.cjs` and each package's `fluidBuild.tasks`.

Read [DEV.md](../../build-tools/DEV.md) before dependency upgrades, but verify its version-specific claims against the current manifests and imports.
Some dependencies require older APIs or CommonJS compatibility; do not upgrade them merely to match the latest release.
ESLint uses flat configuration (`eslint.config.mts`); formatting uses Biome (`biome.jsonc`).

## Adding a flub Command

Create the command under `build-tools/packages/build-cli/src/commands/` and follow the adjacent oclif command patterns.
Add tests under `src/test/commands/`.
Use `pnpm build:manifest` and `pnpm build:readme` from the package directory when updating generated command metadata and help.

Policy checks run from `build-tools/` using `pnpm policy-check` or `pnpm policy-check:fix`.
