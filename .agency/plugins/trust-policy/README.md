# Trust-policy Agency plugin

Check whether an exact package version has trustworthy provenance before installing it, without installing or building Fluid Framework build-tools.
The checker verifies provenance with Sigstore through npm's [pacote](https://github.com/npm/pacote), as `npm audit signatures` does, and suggests an attested alternative when a version is rejected.
It works for any project that installs from the npm registry, whether it uses npm, Yarn, or pnpm.

The `check-trust-policy` skill documents the detailed behavior and how an agent should run and report the checker.

## Setup

Install and build from this directory:

```powershell
npm ci --engine-strict
npm run build
```

`--engine-strict` makes npm reject an unsupported Node.js version during installation; the checker also checks it at startup.

The repository's `agency.toml` registers the plugin in the `trust-policy` profile.

## Usage

```powershell
node .\lib\trust-policy.js --package semver@5.7.2
node .\lib\trust-policy.js --package "@sigstore/verify@4.1.2" --policy cryptographic --json
node .\lib\trust-policy.js --package semver@5.7.2 --policy metadata --json
node .\lib\trust-policy.js --package semver@5.7.2 --policy no-downgrade --json
```

Use `--help` for all options.
Text mode exits 1 for rejected or inconclusive packages and incomplete checks.
JSON mode returns structured results even then, so inspect the fields rather than the exit status.

## Development

```powershell
npm test        # build, then run the tests
npm run check   # type-check without emitting
npm run lint    # Biome
npm run format  # Biome, with fixes
```

Tests use Node.js's built-in test runner and do not require build-tools or live network access.
Cryptographic verification is delegated to pacote, so the tests cover only how its results are interpreted; verify against the live registry with the checks above.
Pull requests that change this plugin run lint, type-checking, and tests in the [`Agency trust-policy plugin`](/.github/workflows/agency-trust-policy.yml) GitHub Actions workflow.