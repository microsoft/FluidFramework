`flub vnext`
============

Vnext commands are new implementations of standard flub commands using new infrastructure.

* [`flub vnext check latestVersions`](#flub-vnext-check-latestversions)
* [`flub vnext generate changelog`](#flub-vnext-generate-changelog)

## `flub vnext check latestVersions`

Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.

```
USAGE
  $ flub vnext check latestVersions -g <value> --version <value> [-v | --quiet]

FLAGS
  -g, --releaseGroup=<value>  (required) The name of a release group.
      --version=<value>       (required) The version to check. When running in CI, this value corresponds to the
                              pipeline trigger branch.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI
  pipeline only.

  This command is used in CI to determine if a pipeline was triggered by a release branch with the latest minor version
  of a major version.
```

_See code: [src/commands/vnext/check/latestVersions.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/vnext/check/latestVersions.ts)_

## `flub vnext generate changelog`

Generate a changelog for packages based on changesets. Note that this process deletes the changeset files!

```
USAGE
  $ flub vnext generate changelog -g <value> [-v | --quiet] [--version <value>]

FLAGS
  -g, --releaseGroup=<value>  (required) The name of a release group.
      --version=<value>       The version for which to generate the changelog. If this is not provided, the version of
                              the package according to package.json will be used.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Generate a changelog for packages based on changesets. Note that this process deletes the changeset files!

ALIASES
  $ flub vnext generate changelogs

EXAMPLES
  Generate changelogs for the client release group.

    $ flub vnext generate changelog --releaseGroup client
```

_See code: [src/commands/vnext/generate/changelog.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/vnext/generate/changelog.ts)_
