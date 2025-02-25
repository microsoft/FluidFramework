`flub info`
===========

Get info about the repo, release groups, and packages.

* [`flub info`](#flub-info)

## `flub info`

Get info about the repo, release groups, and packages.

```
USAGE
  $ flub info [--json] [-v | --quiet] [-g client|server|azure|build-tools|gitrest|historian] [-c
    releaseGroup|name|private|version|path...] [-p]

FLAGS
  -c, --columns=<option>...    [default: releaseGroup,name,private,version] Specify which columns are included in
                               report.
                               <options: releaseGroup|name|private|version|path>
  -g, --releaseGroup=<option>  Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -p, --[no-]private           Include private packages (default true).

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Get info about the repo, release groups, and packages.
```

_See code: [src/commands/info.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/info.ts)_
