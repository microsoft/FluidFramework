`flub update`
=============

Updates a project.

* [`flub update project`](#flub-update-project)

## `flub update project`

Updates a project.

```
USAGE
  $ flub update project [-v | --quiet] [--newTsconfigs] [--ts2esm] [--tscMulti] [--renameTypes] [--attw]
    [--concurrency <value>] [--all | --dir <value> | --packages | -g
    client|server|azure|build-tools|gitrest|historian|all | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all] [--private] [--scope <value> | --skipScope <value>]

FLAGS
  --attw                 Add are-the-types-wrong script and dependencies.
  --concurrency=<value>  [default: 25] The number of tasks to execute concurrently.
  --newTsconfigs         Enable new tsconfigs in the package.
  --renameTypes          Enable scripts to rename ESM types and rewrite imports.
  --ts2esm               Enable ts2esm in the package.
  --tscMulti             Enable tsc-multi in the package.

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
  Updates a project.
```

_See code: [src/commands/update/project.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/update/project.ts)_
