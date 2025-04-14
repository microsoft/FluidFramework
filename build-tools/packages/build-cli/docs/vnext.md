`flub vnext`
============

Vnext commands are new implementations of standard flub commands using new infrastructure.

* [`flub vnext check latestVersions`](#flub-vnext-check-latestversions)
* [`flub vnext modify fluid-deps`](#flub-vnext-modify-fluid-deps)

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

## `flub vnext modify fluid-deps`

Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.

```
USAGE
  $ flub vnext modify fluid-deps -g <value> -g <value> [-v | --quiet] [--prerelease ]

FLAGS
  -g, --on=<value>            (required) The name of a release group.
  -g, --releaseGroup=<value>  (required) The name of a release group.
      --prerelease            Treat prerelease versions as valid versions to update to.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Update the dependency version of a specified package or release group. That is, if one or more packages in the repo
  depend on package A, then this command will update the dependency range on package A. The dependencies and the
  packages updated can be filtered using various flags.

  To learn more see the detailed documentation at
  https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md
```

_See code: [src/commands/vnext/modify/fluid-deps.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/vnext/modify/fluid-deps.ts)_
