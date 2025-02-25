`flub exec`
===========

Run a shell command in the context of a package or release group.

* [`flub exec CMD`](#flub-exec-cmd)

## `flub exec CMD`

Run a shell command in the context of a package or release group.

```
USAGE
  $ flub exec CMD [-v | --quiet] [--concurrency <value>] [--branch <value> [--changed | [--all | --dir
    <value>... | --packages | -g client|server|azure|build-tools|gitrest|historian|all... | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all...]]] [--private] [--scope <value>... | --skipScope
    <value>...]

ARGUMENTS
  CMD  The shell command to execute.

FLAGS
  --concurrency=<value>  [default: 25] The number of tasks to execute concurrently.

PACKAGE SELECTION FLAGS
  -g, --releaseGroup=<option>...      Run on all child packages within the specified release groups. This does not
                                      include release group root packages. To include those, use the --releaseGroupRoot
                                      argument. Cannot be used with --all.
                                      <options: client|server|azure|build-tools|gitrest|historian|all>
      --all                           Run on all packages and release groups. Cannot be used with --dir, --packages,
                                      --releaseGroup, or --releaseGroupRoot.
      --branch=<value>                [default: main] Select only packages that have been changed when compared to this
                                      base branch. Can only be used with --changed.
      --changed                       Select packages that have changed when compared to a base branch. Use the --branch
                                      option to specify a different base branch. Cannot be used with --all.
      --dir=<value>...                Run on the package in this directory. Cannot be used with --all.
      --packages                      Run on all independent packages in the repo. Cannot be used with --all.
      --releaseGroupRoot=<option>...  Run on the root package of the specified release groups. This does not include any
                                      child packages within the release group. To include those, use the --releaseGroup
                                      argument. Cannot be used with --all.
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
  Run a shell command in the context of a package or release group.
```

_See code: [src/commands/exec.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/exec.ts)_
