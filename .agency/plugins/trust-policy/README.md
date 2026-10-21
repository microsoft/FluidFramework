# Trust-policy Agency plugin

Audit dependency trust and check individual package provenance without installing or building Fluid Framework build-tools.
This plugin transplants the `flub check trustPolicy` command; the build-tools implementation is unchanged.
It audits pnpm workspaces, Yarn Classic/Berry lockfiles, and npm package-lock/shrinkwrap files, and verifies single-package provenance with Sigstore.

The `check-trust-policy` skill documents the detailed behavior and how an agent should run and report the checker.

## Setup

Install and build from this directory:

```powershell
npm ci --engine-strict
npm run build
```

`--engine-strict` makes npm reject an unsupported Node.js version during installation; the checker also checks it at startup.
Dependency audits also need pnpm 10.24.0 or later on PATH.

The repository's `agency.toml` registers the plugin in the `trust-policy` profile.

## Usage

```powershell
# Dependency audits
node .\lib\trust-policy.js --path D:\FluidFramework2\build-tools
node .\lib\trust-policy.js --path D:\FluidFramework2\build-tools --json
node .\lib\trust-policy.js --path D:\FluidFramework2\build-tools --include-excluded
node .\lib\trust-policy.js --lockfile D:\my-project\yarn.lock --json
node .\lib\trust-policy.js --lockfile D:\my-project\package-lock.json --json

# Single-package checks
node .\lib\trust-policy.js --package semver@5.7.2
node .\lib\trust-policy.js --package "@sigstore/verify@4.1.2" --policy cryptographic --json
node .\lib\trust-policy.js --package semver@5.7.2 --policy metadata --json
node .\lib\trust-policy.js --package semver@5.7.2 --policy no-downgrade --json
```

Use `--help` for all options.
Text mode exits 1 for violations, rejected or inconclusive packages, and incomplete checks.
JSON mode returns structured results even then, so inspect the fields rather than the exit status.

## Development

```powershell
npm test        # build, then run the tests
npm run check   # type-check without emitting
npm run lint    # Biome
npm run format  # Biome, with fixes
```

Tests use Node.js's built-in test runner and do not require build-tools or live network access.