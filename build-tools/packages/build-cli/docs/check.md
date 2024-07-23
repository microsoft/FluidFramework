`flub check`
============

Check commands are used to verify repo state, apply policy, etc.

* [`flub check buildVersion`](#flub-check-buildversion)
* [`flub check changeset`](#flub-check-changeset)
* [`flub check layers`](#flub-check-layers)
* [`flub check policy`](#flub-check-policy)

## `flub check buildVersion`

Checks that all packages have the same version set in package.json. The packages checked can be filtered by standard criteria. THIS COMMAND IS INTENDED FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.

```
USAGE
  $ flub check buildVersion [-v | --quiet] [--version <value> | --path <value>] [--fix] [--concurrency <value>]
    [--branch <value> [--changed |  |  |  | [--all | --dir <value> | --packages | -g
    client|server|azure|build-tools|gitrest|historian|all | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all] | ]] [--private] [--scope <value> | --skipScope <value>]

FLAGS
  --concurrency=<value>  [default: 25] The number of tasks to execute concurrently.
  --fix                  Fix invalid versions in the package.json file.
  --path=<value>         Path to a directory containing a package. The version will be loaded from the package.json in
                         this directory.
  --version=<value>      The version against which to check all the packages.

PACKAGE SELECTION FLAGS
  -g, --releaseGroup=<option>...      Run on all child packages within the specified release groups. This does not
                                      include release group root packages. To include those, use the --releaseGroupRoot
                                      argument. Cannot be used with --all, --dir, or --packages.
                                      <options: client|server|azure|build-tools|gitrest|historian|all>
      --all                           Run on all packages and release groups. Cannot be used with --dir, --packages,
                                      --releaseGroup, or --releaseGroupRoot.
      --branch=<value>                [default: main] Select only packages that have been changed when compared to this
                                      base branch. Can only be used with --changed.
      --changed                       Select only packages that have changed when compared to a base branch. Use the
                                      --branch option to specify a different base branch. Cannot be used with other
                                      options.
      --dir=<value>                   Run on the package in this directory. Cannot be used with --all, --packages,
                                      --releaseGroup, or --releaseGroupRoot.
      --packages                      Run on all independent packages in the repo. Cannot be used with --all, --dir,
                                      --releaseGroup, or --releaseGroupRoot.
      --releaseGroupRoot=<option>...  Run on the root package of the specified release groups. This does not include any
                                      child packages within the release group. To include those, use the --releaseGroup
                                      argument. Cannot be used with --all, --dir, or --packages.
                                      <options: client|server|azure|build-tools|gitrest|historian|all>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

DESCRIPTION
  Checks that all packages have the same version set in package.json. The packages checked can be filtered by standard
  criteria. THIS COMMAND IS INTENDED FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.
```

_See code: [src/commands/check/buildVersion.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/check/buildVersion.ts)_

## `flub check changeset`

Checks if a changeset was added when compared against a branch. This is used in CI to enforce that changesets are present for a PR.

```
USAGE
  $ flub check changeset -b <value> [--json] [-v | --quiet]

FLAGS
  -b, --branch=<value>  (required) The branch to compare against.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  Check if a changeset was added when compared to the 'main' branch.

    $ flub check changeset -b main

  Check if a changeset was added when compared to the 'next' branch.

    $ flub check changeset -b next
```

_See code: [src/commands/check/changeset.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/check/changeset.ts)_

## `flub check layers`

Checks that the dependencies between Fluid Framework packages are properly layered.

```
USAGE
  $ flub check layers --info <value> [-v | --quiet] [--md <value>] [--dot <value>] [--logtime]

FLAGS
  --dot=<value>   Generate *.dot for GraphViz
  --info=<value>  (required) Path to the layer graph json file
  --logtime       Display the current time on every status message for logging
  --md=<value>    Generate PACKAGES.md file at this path relative to repo root

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Checks that the dependencies between Fluid Framework packages are properly layered.
```

_See code: [src/commands/check/layers.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/check/layers.ts)_

## `flub check policy`

Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.

```
USAGE
  $ flub check policy [-v | --quiet] [-D <value> | -d <value>] [-e <value>] [--listHandlers | --stdin | -p <value>
    | -f | ]

FLAGS
  -D, --excludeHandler=<value>...  Exclude policy handler by name. Can be specified multiple times to exclude multiple
                                   handlers.
  -d, --handler=<value>            Filter policy handler names by <regex>.
  -e, --exclusions=<value>         Path to the exclusions.json file.
  -f, --fix                        Fix errors if possible.
  -p, --path=<value>               Filter file paths by <regex>.
      --listHandlers               List all policy handlers by name.
      --stdin                      Read list of files from stdin.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files,
  assert tagging, etc.
```

_See code: [src/commands/check/policy.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/check/policy.ts)_
