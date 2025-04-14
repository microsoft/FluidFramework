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

Update the dependency version that a release group has on another release group. That is, if one or more packages in the release group depend on package A in another release group, then this command will update the dependency range on package A and all other packages in that release group.

```
USAGE
  $ flub vnext modify fluid-deps --on <value> [-v | --quiet] [-g <value>...] [--prerelease] [-d ^|~|]

FLAGS
  -d, --dependencyRange=<option>  [default: ^] Controls the type of dependency that is used when updating packages. Use
                                  "" (the empty string) to indicate exact dependencies. Note that dependencies on
                                  pre-release versions will always be exact.
                                  <options: ^|~|>
  -g, --releaseGroup=<value>...   A release group whose packages will be updated. This can be specified multiple times
                                  to updates dependencies for multiple release groups.
      --on=<value>                (required) A release group that contains dependent packages. Packages that depend on
                                  packages in this release group will be updated.
      --prerelease                Update to the latest prerelease version, which might be an earlier release than
                                  latest.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Update the dependency version that a release group has on another release group. That is, if one or more packages in
  the release group depend on package A in another release group, then this command will update the dependency range on
  package A and all other packages in that release group.

  To learn more see the detailed documentation at
  https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md

EXAMPLES
  Update 'client' dependencies on packages in the 'build-tools' release group to the latest release version.

    $ flub vnext modify fluid-deps -g client --on build-tools

  Update 'client' dependencies on packages in the 'server' release group to the latest version. Include pre-release
  versions.

    $ flub vnext modify fluid-deps -g client --on build-tools --prerelease

  Update 'client' dependencies on packages in the 'server' release group to the latest version. Include pre-release
  versions.

    $ flub vnext modify fluid-deps -g client --on server
```

_See code: [src/commands/vnext/modify/fluid-deps.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/vnext/modify/fluid-deps.ts)_
