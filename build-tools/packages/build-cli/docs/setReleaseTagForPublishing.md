`flub setReleaseTagForPublishing`
=================================

Updates the types in package.json based on the release flag. This command is intended for use in publishing pipelines and may not be intended for regular developer use.

* [`flub setReleaseTagForPublishing`](#flub-setreleasetagforpublishing)

## `flub setReleaseTagForPublishing`

Updates the types in package.json based on the release flag. This command is intended for use in publishing pipelines and may not be intended for regular developer use.

```
USAGE
  $ flub setReleaseTagForPublishing [-v | --quiet] [--concurrency <value>] [--all | --dir <value> | --packages | -g
    client|server|azure|build-tools|gitrest|historian|all | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all] [--private] [--scope <value> | --skipScope <value>] [--types
    <value>]

FLAGS
  --concurrency=<value>  [default: 25] The number of tasks to execute concurrently.
  --types=<value>        The types flag is used to specify the type of release when updating a package.json file. It
                         accepts a custom enumeration called UpdatePackageJsonEnum that defines different release types.

PACKAGE SELECTION FLAGS
  -g, --releaseGroup=<option>...  Run on all child packages within the specified release groups. This does not include
                                  release group root packages. To include those, use the --releaseGroupRoot argument.
                                  Cannot be used with --all, --dir, or --packages.
                                  <options: client|server|azure|build-tools|gitrest|historian|all>
  --all                           Run on all packages and release groups. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --dir=<value>                   Run on the package in this directory. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --packages                      Run on all independent packages in the repo. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --releaseGroupRoot=<option>...  Run on the root package of the specified release groups. This does not include any
                                  child packages within the release group. To include those, use the --releaseGroup
                                  argument. Cannot be used with --all, --dir, or --packages.
                                  <options: client|server|azure|build-tools|gitrest|historian|all>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

DESCRIPTION
  Updates the types in package.json based on the release flag. This command is intended for use in publishing pipelines
  and may not be intended for regular developer use.
```

_See code: [src/commands/setReleaseTagForPublishing.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/setReleaseTagForPublishing.ts)_
