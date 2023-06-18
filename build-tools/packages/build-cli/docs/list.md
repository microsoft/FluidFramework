`flub list`
===========

List packages in a release group in topological order.

* [`flub list`](#flub-list)

## `flub list`

List packages in a release group in topological order.

```
USAGE
  $ flub list -g client|server|azure|build-tools|gitrest|historian [-v | --quiet] [--json] [--private]
    [--tarball]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of the release group
                               <options: client|server|azure|build-tools|gitrest|historian>
  --[no-]private               Only include private packages (or non-private packages for --no-private)
  --tarball                    Return packed tarball names (without extension) instead of package names. @-signs will be
                               removed from the name, and slashes are replaced with dashes.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List packages in a release group in topological order.
```

_See code: [src/commands/list.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/list.ts)_
