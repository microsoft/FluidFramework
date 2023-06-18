`flub exec`
===========

Run a shell command in the context of a package or release group.

* [`flub exec CMD`](#flub-exec-cmd)

## `flub exec CMD`

Run a shell command in the context of a package or release group.

```
USAGE
  $ flub exec CMD [-v] [--releaseGroupRoots client|server|azure|build-tools|gitrest|historian|all | [-a |
    -d <value> | --packages | -g client|server|azure|build-tools|gitrest|historian|all] |  | ] [--private] [--scope
    <value> | -g client|server|azure|build-tools|gitrest|historian]

ARGUMENTS
  CMD  The shell command to execute.

PACKAGE SELECTION FLAGS
  -a, --all                        Run on all packages and release groups. Cannot be used with --dir, --packages, or
                                   --releaseGroup.
  -d, --dir=<value>                Run on the package in this directory. Cannot be used with --all, --packages, or
                                   --releaseGroup.
  -g, --releaseGroup=<option>...   Run on all packages within the release group. Cannot be used with --all, --dir, or
                                   --packages. This does not include release group root packages; to include those as
                                   well, use the --releaseGroupRoots argument.
                                   <options: client|server|azure|build-tools|gitrest|historian|all>
  --packages                       Run on all independent packages in the repo. Cannot be used with --all, --dir, or
                                   --releaseGroup.
  --releaseGroupRoots=<option>...  Run on the root package of the specified release groups. Cannot be used with --all,
                                   --dir, or --packages.
                                   <options: client|server|azure|build-tools|gitrest|historian|all>

PACKAGE FILTER FLAGS
  -g, --skipScope=<option>...  Package scopes to filter out. Cannot be used with --scope.
                               <options: client|server|azure|build-tools|gitrest|historian>
  --[no-]private               Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...           Package scopes to filter to. Cannot be used with --skipScope.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  Run a shell command in the context of a package or release group.
```

_See code: [src/commands/exec.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/exec.ts)_
