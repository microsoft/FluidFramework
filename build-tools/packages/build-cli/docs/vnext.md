`flub vnext`
============

Vnext commands are new implementations of standard flub commands using new infrastructure.

* [`flub vnext check latestVersions`](#flub-vnext-check-latestversions)
* [`flub vnext generate buildVersion`](#flub-vnext-generate-buildversion)
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

## `flub vnext generate buildVersion`

This command is used to compute the version number of Fluid packages. The release version number is based on what's in the release group root package.json. The CI pipeline will supply the build number and branch to determine the prerelease suffix if it is not a tagged build.

```
USAGE
  $ flub vnext generate buildVersion --build <value> [-v | --quiet] [--testBuild <value>] [--release release|prerelease|none]
    [--patch <value>] [--base <value>] [--tag <value>] [-i <value>] [--packageTypes none|alpha|beta|public|untrimmed]

FLAGS
  -i, --includeInternalVersions=<value>  [env: VERSION_INCLUDE_INTERNAL_VERSIONS] Include Fluid internal versions.
      --base=<value>                     The base version. This will be read from package.json if not provided.
      --build=<value>                    (required) [env: VERSION_BUILDNUMBER] The CI build number.
      --packageTypes=<option>            [default: none, env: PACKAGE_TYPES_FIELD] If provided, the version generated
                                         will include extra strings based on the TypeScript types that are expected to
                                         be used. This flag should only be used in the Fluid Framework CI pipeline.
                                         <options: none|alpha|beta|public|untrimmed>
      --patch=<value>                    [env: VERSION_PATCH] Indicates the build should use "simple patch versioning"
                                         where the value of the --build flag is used as the patch version.
      --release=<option>                 [env: VERSION_RELEASE] Indicates the build is a release build.
                                         <options: release|prerelease|none>
      --tag=<value>                      [env: VERSION_TAGNAME] The tag name to use.
      --testBuild=<value>                [env: TEST_BUILD] Indicates the build is a test build.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  This command is used to compute the version number of Fluid packages. The release version number is based on what's in
  the release group root package.json. The CI pipeline will supply the build number and branch to determine the
  prerelease suffix if it is not a tagged build.

EXAMPLES
  $ flub vnext generate buildVersion
```

_See code: [src/commands/vnext/generate/buildVersion.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/vnext/generate/buildVersion.ts)_

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
  $ flub generate changelog

EXAMPLES
  Generate changelogs for the client release group.

    $ flub vnext generate changelog --releaseGroup client
```

_See code: [src/commands/vnext/generate/changelog.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/vnext/generate/changelog.ts)_
