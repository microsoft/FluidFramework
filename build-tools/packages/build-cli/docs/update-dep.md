`flub update-dep`
=================

Updates a dependency in the lockfile to the latest version of a specified semver range.

* [`flub update-dep`](#flub-update-dep)

## `flub update-dep`

Updates a dependency in the lockfile to the latest version of a specified semver range.

```
USAGE
  $ flub update-dep -g client|server|azure|build-tools|gitrest|historian --dependencyName <value> --version
    <value> [--json] [-v | --quiet]

FLAGS
  -g, --releaseGroup=<option>   (required) Name of a release group.
                                <options: client|server|azure|build-tools|gitrest|historian>
      --dependencyName=<value>  (required) Name of the dependency (npm package) to update
      --version=<value>         (required) Semver range specifier to use when updating the dependency.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Updates a dependency in the lockfile to the latest version of a specified semver range.
```

_See code: [src/commands/update-dep.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/update-dep.ts)_
