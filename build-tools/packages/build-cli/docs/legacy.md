`flub legacy`
=============

Legacy commands that have been replaced by newer implementations.

* [`flub legacy generate changelog`](#flub-legacy-generate-changelog)

## `flub legacy generate changelog`

[DEPRECATED] Generate a changelog for packages based on changesets. Use 'flub vnext generate changelog' instead.

```
USAGE
  $ flub legacy generate changelog -g client|server|azure|build-tools|gitrest|historian [-v | --quiet] [--version <value>]
    [--install]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
      --[no-]install           Update lockfiles by running 'npm install' automatically.
      --version=<value>        The version for which to generate the changelog. If this is not provided, the version of
                               the package according to package.json will be used.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  [DEPRECATED] Generate a changelog for packages based on changesets. Use 'flub vnext generate changelog' instead.

EXAMPLES
  Generate changelogs for the client release group.

    $ flub legacy generate changelog --releaseGroup client
```

_See code: [src/commands/legacy/generate/changelog.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/legacy/generate/changelog.ts)_
