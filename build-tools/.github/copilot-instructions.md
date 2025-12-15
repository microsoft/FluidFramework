# Copilot Instructions for build-tools

## Overview

This is the **build-tools** release group for the Fluid Framework monorepo. It contains CLI tools and libraries for building, testing, releasing, and managing Fluid Framework repositories.

**Runtime**: Node.js >=20.15.1, pnpm 10.18.3
**Language**: TypeScript ~5.4.5
**Module system**: Mix of CommonJS and ESM (see DEV.md for constraints)

## Packages

| Package | Description | Output Dir | Module Type |
|---------|-------------|------------|-------------|
| `@fluid-tools/build-cli` (flub) | Main CLI for build/release operations | `lib/` | ESM |
| `@fluidframework/build-tools` | Core build infrastructure, `fluid-build` CLI | `dist/` | CommonJS |
| `@fluid-tools/build-infrastructure` | Workspace and release group abstractions | `lib/` (ESM), `dist/` (CJS) | Dual |
| `@fluid-tools/version-tools` (fluv) | Semantic versioning utilities CLI | `lib/` | CommonJS |
| `@fluidframework/bundle-size-tools` | Bundle size analysis utilities | `dist/` | CommonJS |

## Build Commands

**Always run from `build-tools/` directory. Install dependencies first if `node_modules/` doesn't exist.**

```bash
# Install dependencies (required first time or after package.json changes)
pnpm install

# Full build (compile + lint + docs)
pnpm build

# Fast incremental build (compile only)
pnpm build:fast

# TypeScript compilation only
pnpm tsc

# Run tests
pnpm test:mocha

# Lint code
pnpm lint

# Format code
pnpm format

# Clean build artifacts
pnpm clean
```

## Build Order

Packages have workspace dependencies and must build in order:
1. `version-tools` (no internal deps)
2. `build-tools` (depends on version-tools)
3. `build-infrastructure` (depends on version-tools)
4. `bundle-size-tools` (no internal deps)
5. `build-cli` (depends on all above)

The `fluid-build` task scheduler handles this automatically via `pnpm build`.

## Validation Checklist

Before submitting changes, verify:

1. **TypeScript compiles**: `pnpm tsc`
2. **Tests pass**: `pnpm test:mocha`
3. **Lint passes**: `pnpm lint` (runs ESLint + syncpack)
4. **Format is correct**: `pnpm check:format` (uses Biome)

## Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Root workspace config, scripts, dependencies |
| `pnpm-workspace.yaml` | Workspace package locations |
| `syncpack.config.cjs` | Dependency version synchronization rules |
| `biome.jsonc` | Code formatting and organization (extends root) |
| `commitlint.config.cjs` | Commit message format (conventional commits, sentence-case) |
| `api-extractor-base.json` | Shared API Extractor configuration |

Each package has:
- `package.json` - Package config and scripts
- `tsconfig.json` - TypeScript configuration
- `.eslintrc.cjs` - ESLint rules (extends `@fluidframework/eslint-config-fluid`)
- `api-extractor.json` - API report generation (most packages)

## Dependency Constraints

**Critical**: Many dependencies are pinned to older versions due to ESM/CommonJS compatibility. See `DEV.md` for the full list. Do not upgrade:

- `execa` (max ^5.x)
- `globby` (max ^11.x)
- `type-fest` (max ^2.x)
- `eslint` (max ~8.57.0)
- `typescript` (pinned ~5.4.5)

## Testing

Tests use Mocha. Test files are in `src/test/` and compile to `lib/test/` or `dist/test/`.

```bash
# Run all tests
pnpm test:mocha

# Run tests with coverage
pnpm test:coverage

# Run tests for a specific package
cd packages/build-cli && pnpm test:mocha
```

## Common Tasks

### Adding a new flub command

1. Create command file in `packages/build-cli/src/commands/`
2. Commands use oclif framework - extend `BaseCommand`
3. Run `pnpm build:manifest` to update oclif manifest
4. Add tests in `src/test/commands/`

### Modifying build tasks

Task definitions are in the repository root (`../fluidBuild.config.cjs`) and can be augmented per-package in `package.json` under `fluidBuild.tasks`.

### Policy checks

```bash
# Check repo policy
pnpm policy-check

# Fix auto-fixable policy issues
pnpm policy-check:fix
```

## File Structure

```
build-tools/
├── packages/
│   ├── build-cli/          # flub CLI (ESM)
│   ├── build-infrastructure/ # Workspace abstractions (dual ESM/CJS)
│   ├── build-tools/        # fluid-build CLI (CommonJS)
│   ├── bundle-size-tools/  # Bundle analysis (CommonJS)
│   └── version-tools/      # fluv CLI (CommonJS)
├── biome.jsonc             # Formatter config
├── syncpack.config.cjs     # Dep version rules
├── DEV.md                  # Dependency upgrade blockers
└── pnpm-workspace.yaml     # Workspace definition
```

## Troubleshooting

- **"Cannot find module" errors**: Run `pnpm install` then `pnpm build`
- **Type errors after dependency changes**: Run `pnpm clean && pnpm build`
- **Lockfile conflicts**: Use `pnpm install --no-frozen-lockfile` only for local testing
- **ESM import errors**: Check DEV.md - many packages are pinned to CommonJS-compatible versions

Trust these instructions. Only search the codebase if information here is incomplete or found to be incorrect.
