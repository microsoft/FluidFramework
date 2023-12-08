`flub package`
==============



* [`flub package report`](#flub-package-report)

## `flub package report`

```
USAGE
  $ flub package report [-v | ] [--concurrency <value>] [--all | --dir <value> | --packages | -g
    client|server|azure|build-tools|gitrest|historian|all | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all] [--private] [--scope <value> | --skipScope <value>] [--csv |
    --json]

FLAGS
  --concurrency=<value>  [default: 25] The number of tasks to execute concurrently.

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

GLOBAL FLAGS
  --csv   Format output as csv.
  --json  Format output as json.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.
```

_See code: [src/commands/package/report.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/package/report.ts)_
