`flub vnext`
============

Vnext commands are new implementations of standard flub commands using new infrastructure.

* [`flub vnext check latestVersions`](#flub-vnext-check-latestversions)

## `flub vnext check latestVersions`

Determines if an input version matches a latest minor release version. Intended to be used in the Fluid Framework CI pipeline only.

```
USAGE
  $ flub vnext check latestVersions --releaseGroup <value> --version <value> [-v | --quiet]

FLAGS
  --releaseGroup=<value>  (required) The name of a release group.
  --version=<value>       (required) The version to check. When running in CI, this value corresponds to the pipeline
                          trigger branch.

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
