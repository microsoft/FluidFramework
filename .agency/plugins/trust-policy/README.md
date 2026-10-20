# Trust-policy Agency plugin

Audit dependency trust and check individual package provenance without installing or building Fluid Framework build-tools.
This plugin transplants the `flub check trustPolicy` command from main.
The build-tools implementation is unchanged.

The checker still uses pnpm to enumerate dependencies and evaluate `trustPolicy: no-downgrade`.
It also reads Yarn Classic and Berry lockfiles directly, without installing Yarn or the target dependencies.
It also reads npm `package-lock.json` and `npm-shrinkwrap.json` versions 1–3, without installing target dependencies.
Lockfile audits check no-downgrade, not whether every package has provenance.
Single-package mode can verify provenance signatures and the downloaded artifact.
It uses oclif, Yarn's official Classic/Berry parsers, semver, and Sigstore, independently of build-tools.
The checker and tests are written in TypeScript.
TypeScript and Node.js types are plugin-local development dependencies.

## Setup

You need a supported Node.js release (22.22.2+, 24.15.0+, or 26+) and registry access.
Dependency audits also need pnpm 10.24.0 or later on PATH; only pnpm input needs installed target dependencies.
Single-package mode does not require pnpm or an installed target project.
Install this plugin's dependencies from its directory:

```powershell
npm ci
npm run build
```

The repository's `agency.toml` registers the plugin in the `trust-policy` profile.
The `check-trust-policy` skill runs the checker from its installed plugin location.
You can also run the command directly, without Agency:

```powershell
node .\lib\run.js --path D:\FluidFramework2\build-tools
node .\lib\run.js --path D:\FluidFramework2\build-tools --json
node .\lib\run.js --lockfile D:\my-project\yarn.lock --json
node .\lib\run.js --lockfile D:\my-project\package-lock.json --json
```

Use `--help` to see `--keep`, `--tempDir`, `--verbose`, and `--quiet`.
Rebuild the plugin after changing its TypeScript source.
Generated JavaScript and source maps live in the ignored `lib` directory.

## Behavior

The command selects the nearest enclosing pnpm workspace instead of loading Fluid Framework's build-project configuration.
Without a workspace file, it uses the nearest enclosing `package.json`.
It enumerates installed registry dependencies using `pnpm list --recursive --json --depth Infinity`.
It then creates one scratch project per unique package version, using the real registry name rather than an npm alias.
Each scratch install uses `--lockfile-only` and `--trust-policy no-downgrade`.
The checker accumulates violations and retries with version-specific exclusions until pnpm succeeds or stops reporting new violations.
Multiple excluded versions of a package are combined into one `||` selector.
The target manifests and lockfiles are not modified.
For Yarn projects, the nearest `yarn.lock` is detected by `--path`, or you can select it explicitly with `--lockfile`.
Both lockfile formats preserve npm aliases' real registry names and exclude local, workspace, and Git dependencies.
Patched Yarn packages currently cause an explicit error rather than an incomplete success.
pnpm remains required to evaluate trust policy for the extracted registry versions.
For npm projects, `--path` detects the nearest package-lock or shrinkwrap file.
At a directory containing multiple formats, a pnpm workspace takes precedence, followed by npm shrinkwrap, npm package-lock, and Yarn.
Use `--lockfile` to override that selection.
npm aliases, nested dependencies, and multiple installed versions are included; workspace links and local or Git sources are excluded.

By default, the scratch directory is `<workspace>/.trust-audit-temp` and is removed after the audit.
Use `--keep` to retain it or `--tempDir` to choose another location.
For safety, the command refuses to overwrite an existing scratch directory, unlike the original command.
Remove a previously retained scratch directory yourself or choose a new one.
Scratch project directories use unique numeric names instead of a slugging library.

Text mode exits with code 1 for violations or an incomplete audit.
JSON mode preserves the original behavior: it returns a structured result even if the audit finds violations or is incomplete.
Inspect `violations` and `auditIncomplete`, not just the command exit status.
Operational failures, including dependency enumeration and malformed trust-policy events, still fail the command.
Verbose subprocess output is suppressed in JSON mode so stdout remains valid JSON.

## Single-package mode

Use an exact version, including a scope when needed:

```powershell
node .\lib\run.js --package semver@5.7.2 --json
node .\lib\run.js --package "@sigstore/verify@4.1.2" --policy cryptographic --json
node .\lib\run.js --package semver@5.7.2 --policy metadata --json
node .\lib\run.js --package semver@5.7.2 --policy no-downgrade --json
```

`--policy` selects:

| Policy | Meaning |
| --- | --- |
| `cryptographic` (default) | Require SLSA provenance verified by Sigstore, including the signing certificate, transparency log, and signed package name, version, and SHA-512 digest of the downloaded tarball. |
| `metadata` | Require registry-reported SLSA provenance; do not verify signatures or download artifacts. |
| `no-downgrade` | Reject weaker registry-reported provenance/trusted-publisher evidence than an earlier publication. A pass may have no provenance at all. |

The Agency skill prompts for the policy when you have not specified one.
The utility defaults to cryptographic verification when `--policy` is omitted.
Registry publish attestations alone are not build provenance.
Cryptographic verification uses Sigstore's trusted roots; it does not pin a particular repository or workflow as an authorized publisher.
None of these checks establishes that the package is free of malware or vulnerabilities.

If the requested version fails the policy, the checker searches newest stable, nondeprecated provenance-bearing releases.
Cryptographic verification is required for alternatives even under `no-downgrade`; `metadata` alternatives are explicitly unverified.
Alternatives are not restricted to the requested major version and may require breaking API changes.
Deprecated requested versions are rejected.
The search checks at most 20 candidates; use `--max-candidates` to change that bound.
`searchTruncated` and `auditIncomplete` distinguish a limited or interrupted search from a complete one.
Verification/network failures are reported in `errors`, not silently treated as absent provenance.

Single-package results use `requested.accepted`, `requested.provenanceVerified`, and `alternative`.
Text mode exits 1 if the requested version is rejected or the check is incomplete.
As with lockfile audits, JSON mode returns structured results even for rejection: inspect the fields.
This mode reads the public npm registry by default, or another credential-free HTTPS registry specified with `--registry`.
It does not load npm authentication configuration.
Attestation and tarball URLs must use that registry's HTTPS origin; redirects are refused.
Cryptographic mode streams tarballs up to 256 MiB to compute a digest without installing, extracting, or executing package code.
It may update Sigstore's local trusted-root cache and contact Sigstore infrastructure.

## Development

```powershell
npm test
npm run check
```

Tests use Node.js's built-in test runner and do not require build-tools or live registry access.
`npm test` builds the plugin before running the compiled tests.
`npm run check` type-checks the source without emitting build output.
