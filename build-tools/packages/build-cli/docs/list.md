`flub list`
===========

List packages in a release group in topological order.

* [`flub list`](#flub-list)

## `flub list`

List packages in a release group in topological order.

```
USAGE
  $ flub list -g client|server|azure|build-tools|gitrest|historian [-v | --quiet] [--json] [--private]
    [--scope <value> | --skipScope <value>] [--tarball]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  --tarball                    Return packed tarball names (without extension) instead of package names. @-signs will be
                               removed from the name, and slashes are replaced with dashes.

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
  List packages in a release group in topological order.
```

_See code: [src/commands/list.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/list.ts)_
