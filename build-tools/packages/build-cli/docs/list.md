`flub list`
===========

List packages in a release group in topological order.

* [`flub list [PACKAGE_OR_RELEASE_GROUP]`](#flub-list-package_or_release_group)

## `flub list [PACKAGE_OR_RELEASE_GROUP]`

List packages in a release group in topological order.

```
USAGE
  $ flub list [PACKAGE_OR_RELEASE_GROUP] [--json] [-v | --quiet] [-g
    client|server|azure|build-tools|gitrest|historian | ] [--feed
    public|internal-build|internal-test|internal-dev|official|internal] [--private] [--scope <value>... | --skipScope
    <value>...] [--tarball] [--outFile <value>]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group.

FLAGS
  -g, --releaseGroup=<option>  Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
      --outFile=<value>        Output file to write the list of packages to. If not specified, the list will be written
                               to stdout.
      --tarball                Return packed tarball names (without extension) instead of package names. @-signs will be
                               removed from the name, and slashes are replaced with dashes.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

PACKAGE FILTER FLAGS
  --feed=<option>         Filter the resulting packages to those that should be published to a particular npm feed. Use
                          'public' for public npm. The 'official' and 'internal' values are deprecated and should not be
                          used.
                          <options: public|internal-build|internal-test|internal-dev|official|internal>
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List packages in a release group in topological order.
```

_See code: [src/commands/list.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/list.ts)_
