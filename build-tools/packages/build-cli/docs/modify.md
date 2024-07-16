`flub modify`
=============

Modify commands are used to modify projects to add or remove dependencies, update Fluid imports, etc.

* [`flub modify fluid-imports`](#flub-modify-fluid-imports)
* [`flub modify lockfile`](#flub-modify-lockfile)

## `flub modify fluid-imports`

Rewrite imports for Fluid Framework APIs to use the correct subpath import (/beta, /legacy, etc.)

```
USAGE
  $ flub modify fluid-imports [-v | --quiet] [--tsconfigs <value>...] [--packageRegex <value>] [--data <value>]
    [--onlyInternal]

FLAGS
  --data=<value>          Optional path to a data file containing raw API level data. Overrides API levels extracted
                          from package data.
  --onlyInternal          Use /internal for all non-public APIs instead of /beta or /legacy.
  --packageRegex=<value>  Regular expression filtering import packages to adjust
  --tsconfigs=<value>...  [default: ./tsconfig.json] Tsconfig file paths that will be used to load project files. When
                          multiple are given all must depend on the same version of packages; otherwise results are
                          unstable.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Rewrite imports for Fluid Framework APIs to use the correct subpath import (/beta, /legacy, etc.)
```

_See code: [src/commands/modify/fluid-imports.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/modify/fluid-imports.ts)_

## `flub modify lockfile`

Updates a dependency in the pnpm lockfile to the latest version of a specified semver range.

```
USAGE
  $ flub modify lockfile -g client|server|azure|build-tools|gitrest|historian --dependencyName <value> --version
    <value> [--json] [-v | --quiet]

FLAGS
  -g, --releaseGroup=<option>   (required) Name of a release group.
                                <options: client|server|azure|build-tools|gitrest|historian>
      --dependencyName=<value>  (required) Name of the dependency (npm package) to update.
      --version=<value>         (required) Semver range specifier to use when updating the dependency.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Updates a dependency in the pnpm lockfile to the latest version of a specified semver range.

  Note that if the version passed in to the command is not within the range of versions naturally accepted by the
  packages that depend on it, after this command runs the lockfile might not reflect the version that was passed in, but
  the latest version that complies with the semver range declared by the dependent packages.
```

_See code: [src/commands/modify/lockfile.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/modify/lockfile.ts)_
