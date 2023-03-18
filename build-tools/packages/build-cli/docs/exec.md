`flub exec`
===========

Run a shell command in the context of a package or release group.

* [`flub exec EXECCMD`](#flub-exec-execcmd)

## `flub exec EXECCMD`

Run a shell command in the context of a package or release group.

```
USAGE
  $ flub exec EXECCMD [-v] [--private | ] [--scope <value> | -g client|server|azure|build-tools] [--roots
    [-a | [-d <value> | --packages | -g client|server|azure|build-tools] |  | ]]

ARGUMENTS
  EXECCMD  The shell command to execute.

FLAGS
  -a, --all                    Run on all packages and release groups. Cannot be used with --releaseGroup, --packages,
                               or --dir.
  -d, --dir=<value>            Run on the package in this directory. Cannot be used with --releaseGroup or --packages.
  -g, --releaseGroup=<option>  Run on all packages within this release group. Cannot be used with --dir or --packages.
                               <options: client|server|azure|build-tools>
  -g, --skipScope=<option>...  Package scopes to filter out.
                               <options: client|server|azure|build-tools>
  -v, --verbose                Verbose logging.
  --packages                   Run on all independent packages in the repo. This is an alternative to using the --dir
                               flag for independent packages.
  --[no-]private               Only include private packages (or non-private packages for --no-private)
  --roots                      Runs only on the root package of release groups. Can only be used with --all.
  --scope=<value>...           Package scopes to filter to.

DESCRIPTION
  Run a shell command in the context of a package or release group.
```

_See code: [src/commands/exec.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/exec.ts)_
