# Trust-policy Agency plugin

Audit installed pnpm dependencies for trust downgrades without installing or building Fluid Framework build-tools.
This plugin transplants the `flub check trustPolicy` command from main.
The build-tools implementation is unchanged.

The checker still uses pnpm to enumerate dependencies and evaluate `trustPolicy: no-downgrade`.
It also reads Yarn Classic and Berry lockfiles directly, without installing Yarn or the target dependencies.
It does not yet audit npm lockfiles, require provenance on every package, or independently verify provenance signatures.
It uses oclif and Yarn's official `@yarnpkg/parsers` parser, independently of build-tools.
The checker and tests are written in TypeScript.
TypeScript and Node.js types are plugin-local development dependencies.

## Setup

You need Node.js 22.22.2 or later, pnpm 10.24.0 or later on PATH, installed target dependencies, and registry access.
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

## Development

```powershell
npm test
npm run check
```

Tests use Node.js's built-in test runner and do not require build-tools or live registry access.
`npm test` builds the plugin before running the compiled tests.
`npm run check` type-checks the source without emitting build output.
