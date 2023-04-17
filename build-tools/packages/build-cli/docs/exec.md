`flub exec`
===========

Run a shell command in the context of a package or release group.

* [`flub exec CMD`](#flub-exec-cmd)

## `flub exec CMD`

Run a shell command in the context of a package or release group.

```
USAGE
  $ flub exec CMD [-v] [-a | -d <value> | --packages | -g
    client|server|azure|build-tools|gitrest|historian] [--releaseGroupRoots] [--private] [--scope <value> | -g
    client|server|azure|build-tools|gitrest|historian]

ARGUMENTS
  CMD  The shell command to execute.

FLAGS
  -a, --all                    Run on all packages and release groups. Cannot be used with --dir, --packages, or
                               --releaseGroup.
  -d, --dir=<value>            Run on the package in this directory. Cannot be used with --all, --packages, or
                               --releaseGroup.
  -g, --releaseGroup=<option>  Run on all packages within this release group. Cannot be used with --all, --dir, or
                               --packages.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -g, --skipScope=<option>...  Package scopes to filter out.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -v, --verbose                Verbose logging.
  --packages                   Run on all independent packages in the repo. Cannot be used with --all, --dir, or
                               --releaseGroup.
  --[no-]private               Only include private packages (or non-private packages for --no-private)
  --releaseGroupRoots          Runs only on the root package of release groups. Can only be used with --all or
                               --releaseGroup.
  --scope=<value>...           Package scopes to filter to.

DESCRIPTION
  Run a shell command in the context of a package or release group.
```

_See code: [src/commands/exec.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/exec.ts)_
