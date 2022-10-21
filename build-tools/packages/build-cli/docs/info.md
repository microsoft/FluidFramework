`flub info`
===========

Get info about the repo, release groups, and packages.

* [`flub info`](#flub-info)

## `flub info`

Get info about the repo, release groups, and packages.

```
USAGE
  $ flub info [-g client|server|azure|build-tools] [-p] [-v]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools>
  -p, --[no-]private           Include private packages (default true).
  -v, --verbose                Verbose logging.

DESCRIPTION
  Get info about the repo, release groups, and packages.
```

_See code: [src/commands/info.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/info.ts)_
