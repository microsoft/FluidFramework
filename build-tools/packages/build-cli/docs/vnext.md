`flub vnext`
============

Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.

* [`flub vnext check latestVersions VERSION RELEASE_GROUP`](#flub-vnext-check-latestversions-version-release_group)

## `flub vnext check latestVersions VERSION RELEASE_GROUP`

Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.

```
USAGE
  $ flub vnext check latestVersions VERSION RELEASE_GROUP [-v | --quiet]

ARGUMENTS
  VERSION        The version to check. When running in CI, this value corresponds to the pipeline trigger branch.
  RELEASE_GROUP  The name of a release group.

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
