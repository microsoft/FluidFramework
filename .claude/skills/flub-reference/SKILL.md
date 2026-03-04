---
name: flub-reference
description: Quick reference for flub and fluid-build CLI commands in the Fluid Framework monorepo. Use when you need to find the right flub command, understand its flags, or figure out how to run a specific build/check/generate task. Triggers on mentions of flub, fluid-build, build CLI, or specific flub subcommands.
---

# flub & fluid-build Command Reference

Quick reference for the Fluid Framework build CLI tools.

## Two Tools

- **`flub`** (`@fluid-tools/build-cli`) — Package management, code generation, releases, policy checks
- **`fluid-build`** (`@fluidframework/build-tools`) — Build orchestration, task execution, dependency-aware compilation

## fluid-build

Build orchestrator used by `pnpm build`, `pnpm test`, etc.

```bash
fluid-build [options] [<package-pattern>|<path>...]
```

### Targeting Packages

```bash
fluid-build packages/dds/map                  # By path
fluid-build --filter @fluidframework/map       # By package name
fluid-build -g client                          # By release group
fluid-build .                                  # Current directory
```

### Common Tasks

```bash
fluid-build . --task build         # Full build
fluid-build . --task compile       # TypeScript only
fluid-build . --task api           # Entry points + API reports
fluid-build . --task lint          # ESLint + Biome
fluid-build . --task test          # Build + run all tests
fluid-build . --task test:mocha    # Build + Mocha tests
fluid-build . --task test:jest     # Build + Jest tests
fluid-build . --task clean         # Remove build artifacts
```

### Useful Flags

| Flag | Purpose |
|------|---------|
| `--task <name>` / `-t` | Task to run |
| `--worker` | Use worker threads for parallelism |
| `--filter <pkg>` | Target specific package |
| `-g <group>` | Target release group |
| `--vscode` | Output for VS Code problem matcher |

---

## flub Commands

### Global Flags

| Flag | Purpose |
|------|---------|
| `-v, --verbose` | Verbose logging |
| `--quiet` | Suppress output |
| `--json` | JSON output |

### Package Selection Flags (available on most commands)

| Flag | Purpose |
|------|---------|
| `-g, --releaseGroup` | `client`, `server`, `azure`, `build-tools`, `gitrest`, `historian`, `all` |
| `-p, --package` | Specific package name |
| `--all` | All packages and release groups |
| `--dir` | Package directory path |
| `--changed` | Only packages changed vs. branch |
| `--[no-]private` | Include/exclude private packages |
| `--scope` | Package scopes to include |
| `--skipScope` | Package scopes to exclude |

---

### flub info

Get repo, release group, and package information.

```bash
flub info                              # All packages
flub info -g client                    # Client release group only
flub info -c name,version,path         # Specific columns
```

### flub list

List packages in topological order.

```bash
flub list client                       # List client packages
flub list client --feed public         # Only publicly published packages
flub list client --no-private          # Exclude private packages
flub list client --outFile list.txt    # Write to file
```

---

### flub check

#### check policy
Verify and fix repo policies (headers, assert tags, etc.).

```bash
flub check policy                      # Check all policies
flub check policy --fix                # Auto-fix violations
flub check policy --listHandlers       # List all policy handlers
flub check policy -d "Handler"         # Filter by handler name
flub check policy -p "packages/dds"    # Filter by path
```

#### check changeset
Verify a changeset exists (CI use).

```bash
flub check changeset --branch main     # Check vs. main
flub check changeset --branch main --json
```

#### check layers
Validate dependency layering.

```bash
flub check layers --info layerInfo.json          # Validate
flub check layers --info layerInfo.json --md .   # Generate PACKAGES.md
flub check layers --info layerInfo.json --dot .  # Generate GraphViz dot file
```

#### check buildVersion
Verify version consistency.

```bash
flub check buildVersion -g client --path .       # Check versions
flub check buildVersion -g client --path . --fix # Fix versions
```

---

### flub generate

#### generate entrypoints
Create filtered `.d.ts` files per release tag level.

```bash
flub generate entrypoints --outDir ./lib --node10TypeCompat   # ESM
flub generate entrypoints --outDir ./dist                      # CJS
```

| Flag | Purpose |
|------|---------|
| `--mainEntrypoint` | Main source file (default: `./src/index.ts`) |
| `--outDir` | Output directory |
| `--outFileAlpha`, `--outFileBeta`, `--outFilePublic` | Override output names |
| `--outFileLegacyBeta`, `--outFileLegacyAlpha` | Legacy variant names |
| `--node10TypeCompat` | Node10 resolution compatible output |

#### generate changeset
Create a new changeset interactively.

```bash
flub changeset add --releaseGroup client         # Alias (most common)
flub generate changeset -g client                # Full command
flub generate changeset --empty                  # Empty changeset
flub generate changeset --branch next            # Compare vs. next
flub generate changeset --all                    # Include example/test packages
```

#### generate typetests
Generate type compatibility test files.

```bash
flub generate typetests --dir . -v               # Standard generation
flub generate typetests --entrypoint public      # Override entrypoint
flub generate typetests --publicFallback         # Fallback to public
```

#### generate releaseNotes
Generate release notes from changesets.

```bash
flub generate releaseNotes -g client -t minor              # Minor release notes
flub generate releaseNotes -g client -t major --outFile RELEASE.md
```

#### generate upcoming
Summarize all pending changesets.

```bash
flub generate upcoming -g client -t minor
```

#### generate assertTags
Tag assert statements with unique IDs.

```bash
flub generate assertTags --all                   # Tag all asserts
flub generate assertTags --validate              # Validate only
```

#### generate buildVersion
Compute CI version numbers.

```bash
flub generate buildVersion --build 12345 --release prerelease
```

#### generate bundleStats
Collect bundle analysis artifacts.

```bash
flub generate bundleStats --smallestAssetSize 100
```

#### generate compatLayerGeneration
Update compatibility layer generation state.

```bash
flub generate compatLayerGeneration --generationDir ./src
```

---

### flub typetests

Update type test configuration in `package.json`.

```bash
flub typetests --dir . --reset --previous --normalize    # Full prepare
flub typetests --dir . --disable                         # Disable type tests
flub typetests --dir . --enable                          # Re-enable
flub typetests --dir . --exact 2.80.0                    # Pin specific version
flub typetests --dir . --remove                          # Remove -previous dep
```

---

### flub bump

Version bumping.

```bash
flub bump client -t minor                         # Bump client minor
flub bump client -t patch --commit --install      # Bump + commit + install
```

#### bump deps
Update external dependency versions.

```bash
flub bump deps client -t minor                    # Update deps to latest minor
flub bump deps client --prerelease                # Include prereleases
```

---

### flub release

Release management (state machine driven).

```bash
flub release -g client -t minor                   # Start minor release
flub release prepare -g client                    # Verify branch is release-ready
flub release history -g client -l 10              # Last 10 releases
flub release report -g client                     # Generate release report
flub release fromTag client_v2.90.0               # Info from git tag
```

---

### flub modify

#### modify fluid-imports
Rewrite imports to use correct subpaths.

```bash
flub modify fluid-imports --tsconfigs ./tsconfig.json     # Fix import paths
flub modify fluid-imports --onlyInternal                  # Use /internal for all
```

---

### flub exec

Run shell commands across packages.

```bash
flub exec -g client -- npm run clean             # Clean all client packages
flub exec --changed -- npm test                  # Test changed packages
```

---

## Common Recipes

### Full rebuild of a single package

```bash
cd packages/dds/map
fluid-build . --task clean && fluid-build . --task build
```

### Regenerate API reports after changing exports

```bash
fluid-build . --task api
```

### Check everything locally before pushing

```bash
fluid-build . --task compile && npm run check:exports && npm run build:api-reports
```

### Prepare for a PR

```bash
pnpm format:changed:main                         # Format changed files
pnpm check:changesets                             # Validate changeset prose
flub check policy                                 # Check repo policies
```
