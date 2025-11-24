`flub legacy`
=============

Legacy commands that have been replaced by newer implementations.

* [`flub legacy generate changelog`](#flub-legacy-generate-changelog)

## `flub legacy generate changelog`

**Deprecated:** This command is deprecated. Use 'flub generate changelog' instead.

[DEPRECATED] Generate a changelog for packages based on changesets. Use 'flub generate changelog' instead.

```
USAGE
  $ flub legacy generate changelog -g <value> [-v | --quiet] [--version <value>] [--install]

FLAGS
  -g, --releaseGroup=<value>  (required) Name of a release group.
      --[no-]install          Update lockfiles by running 'npm install' automatically.
      --version=<value>       The version for which to generate the changelog. If this is not provided, the version of
                              the package according to package.json will be used.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  [DEPRECATED] Generate a changelog for packages based on changesets. Use 'flub generate changelog' instead.

EXAMPLES
  Generate changelogs for the client release group.

    $ flub legacy generate changelog --releaseGroup client
```

_See code: [src/commands/legacy/generate/changelog.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/legacy/generate/changelog.ts)_
