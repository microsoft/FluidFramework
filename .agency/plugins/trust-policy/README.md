# Trust-policy Agency plugin

Check whether an exact package version has trustworthy provenance before installing it, without installing or building Fluid Framework build-tools.
The checker verifies provenance with Sigstore through npm's [pacote](https://github.com/npm/pacote), as `npm audit signatures` does, and suggests an attested alternative when a version is rejected.
It works for any project that installs from the npm registry, whether it uses npm, Yarn, or pnpm.

This directory is both an Agency plugin and the npm package for the checker that the plugin's skill runs:

| Role | Files |
|---|---|
| Agency plugin | `.claude-plugin/plugin.json`, `agency.json`, `skills/` |
| npm package (the checker) | `package.json`, `package-lock.json`, `src/`, and the build output in `lib/` |

The [Agency plugin](#agency-plugin) section covers using the plugin from an agent.
The [Checker package](#checker-package) section covers building, running, and developing the checker directly.

## Agency plugin

The plugin provides the `check-trust-policy` skill, which documents the detailed behavior and how an agent should run and report the checker.
The repository's `agency.toml` registers the plugin in the `trust-policy` profile.

The skill runs the compiled checker from `lib/`, so build the package once, as described in [Setup](#setup), before using the skill.
If the checker is not built, the skill stops and gives the commands to run.

## Checker package

### Setup

Install and build from this directory:

```powershell
npm ci --engine-strict
npm run build
```

`--engine-strict` makes npm reject an unsupported Node.js version during installation; the checker also checks it at startup.

### Usage

```powershell
node .\lib\trust-policy.js --package semver@5.7.2
node .\lib\trust-policy.js --package "@sigstore/verify@4.1.2" --policy cryptographic --json
node .\lib\trust-policy.js --package semver@5.7.2 --policy metadata --json
node .\lib\trust-policy.js --package semver@5.7.2 --policy no-downgrade --json
```

Use `--help` for all options.
Text mode exits 1 for rejected or inconclusive packages and incomplete checks.
JSON mode returns structured results even then, so inspect the fields rather than the exit status.

### Development

```powershell
npm test        # build, then run the tests
npm run check   # type-check without emitting
npm run lint    # Biome
npm run format  # Biome, with fixes
```

Tests use Node.js's built-in test runner and do not require build-tools or live network access.
Cryptographic verification is delegated to pacote, so the tests cover only how its results are interpreted; verify against the live registry with the checks above.
Pull requests that change this directory run lint, type-checking, and tests in the [`Agency trust-policy plugin`](/.github/workflows/agency-trust-policy.yml) GitHub Actions workflow.

## Comparison

### `npm audit signatures`

The checker differs from `npm audit signatures` in these ways:

- **It checks before install.**
  It takes one exact `name@version` and checks it without installing anything.
  `npm audit signatures` only checks packages that are already installed, by which time any install scripts have run.
- **It rejects missing provenance.**
  `npm audit signatures` verifies attestations that exist but passes packages that have none.
  Under the default `cryptographic` policy, a version without verifiable SLSA provenance is rejected.
- **It catches forged attestations.**
  It requires SLSA provenance to be certificate-signed (Fulcio) and checks the certificate against Sigstore's trusted root.
  On registries other than npmjs.org, npm silently falls back to whatever keys the registry serves.
  A compromised mirror or proxy, or a malicious `.npmrc` scope redirect, could serve its own key and sign a forged attestation that `npm audit signatures` accepts.
- **It catches trust downgrades.**
  The `no-downgrade` policy flags a version with weaker trust evidence than an earlier release.
  For example, earlier releases were published from CI with provenance or a trusted publisher, and this one was not, which is a typical sign of a stolen maintainer token used outside CI.
  npm has no such check.
  pnpm's `trustPolicy: no-downgrade` setting applies the same rule during resolution, using only registry metadata; this checker also cryptographically verifies any alternative it suggests.
- **It suggests an alternative.**
  When a version is rejected, it finds the newest stable, non-deprecated release that passes the same policy.
- **It works with any package manager.**
  pnpm and Yarn cannot audit signatures, so this gives their projects npm's check plus the stricter rules above.
- **It distinguishes unusable results.**
  It treats deprecated versions as rejected and reports network or Sigstore failures as `inconclusive` rather than as a pass.
  It refuses Azure Artifacts feeds, which do not serve attestations.

The checker does not scan for known vulnerabilities, as `npm audit` does, or audit a whole lockfile.
Provenance shows where and how a package was built, not that its code is safe.
