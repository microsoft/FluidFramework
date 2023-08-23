`flub test-only-filter`
=======================

FOR INTERNAL TESTING ONLY. This command is used only to test the common package filtering and selection logic that is used across the CLI. FOR INTERNAL TESTING ONLY.

* [`flub test-only-filter`](#flub-test-only-filter)

## `flub test-only-filter`

FOR INTERNAL TESTING ONLY. This command is used only to test the common package filtering and selection logic that is used across the CLI. FOR INTERNAL TESTING ONLY.

```
USAGE
  $ flub test-only-filter [-v | --quiet] [--concurrency <value>] [--all | --dir <value> | --packages | -g
    client|server|azure|build-tools|gitrest|historian|all | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all] [--private] [--scope <value> | --skipScope <value>] [--json]

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
  --quiet        Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

DESCRIPTION
  FOR INTERNAL TESTING ONLY. This command is used only to test the common package filtering and selection logic that is
  used across the CLI. FOR INTERNAL TESTING ONLY.

  This command outputs JSON containing metadata about the packages selected and filtered. This output is parsed in
  tests. While the --json flag is technically optional, it should always be passed when using this command for testing.
  Otherwise there is no output to be checked for correctness.
```

_See code: [src/commands/test-only-filter.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/test-only-filter.ts)_
