`flub generate`
===============

Generate commands are used to create/update code, docs, readmes, etc.

* [`flub generate assertTags`](#flub-generate-asserttags)
* [`flub generate buildVersion`](#flub-generate-buildversion)
* [`flub generate bundleStats`](#flub-generate-bundlestats)
* [`flub generate changelog`](#flub-generate-changelog)
* [`flub generate changeset`](#flub-generate-changeset)
* [`flub generate upcoming`](#flub-generate-upcoming)

## `flub generate assertTags`

Tags asserts by replacing their message with a unique numerical value.

```
USAGE
  $ flub generate assertTags [-v | --quiet] [--disableConfig] [--concurrency <value>] [--all | --dir <value> | --packages
    | -g client|server|azure|build-tools|gitrest|historian|all | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all] [--private] [--scope <value> | --skipScope <value>]

FLAGS
  --concurrency=<value>  [default: 25] The number of tasks to execute concurrently.

PACKAGE SELECTION FLAGS
  -g, --releaseGroup=<option>...  Run on all child packages within the specified release groups. This does not include
                                  release group root packages. To include those, use the --releaseGroupRoot argument.
                                  Cannot be used with --all, --dir, or --packages.
                                  <options: client|server|azure|build-tools|gitrest|historian|all>
  --all                           Run on all packages and release groups. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --dir=<value>                   Run on the package in this directory. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --packages                      Run on all independent packages in the repo. Cannot be used with --all, --dir,
                                  --releaseGroup, or --releaseGroupRoot.
  --releaseGroupRoot=<option>...  Run on the root package of the specified release groups. This does not include any
                                  child packages within the release group. To include those, use the --releaseGroup
                                  argument. Cannot be used with --all, --dir, or --packages.
                                  <options: client|server|azure|build-tools|gitrest|historian|all>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

TESTING FLAGS
  --disableConfig  Disable filtering based on the fluid-build config in the repo. Useful for testing.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

DESCRIPTION
  Tags asserts by replacing their message with a unique numerical value.

  Tagged asserts are smaller because the message string is not included, and they're easier to aggregate for telemetry
  purposes.
```

_See code: [src/commands/generate/assertTags.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/generate/assertTags.ts)_

## `flub generate buildVersion`

This command is used to compute the version number of Fluid packages. The release version number is based on what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease suffix if it is not a tagged build

```
USAGE
  $ flub generate buildVersion --build <value> [-v | --quiet] [--testBuild <value>] [--release release|prerelease|none]
    [--patch <value>] [--base <value>] [--tag <value>] [-i <value>] [--packageTypes none|alpha|beta|public|untrimmed]

FLAGS
  -i, --includeInternalVersions=<value>  Include Fluid internal versions.
  --base=<value>                         The base version. This will be read from lerna.json/package.json if not
                                         provided.
  --build=<value>                        (required) The CI build number.
  --packageTypes=<option>                [default: none] If provided, the version generated will include extra strings
                                         based on the TypeScript types that are expected to be used. This flag should
                                         only be used in the Fluid Framework CI pipeline.
                                         <options: none|alpha|beta|public|untrimmed>
  --patch=<value>                        Indicates the build should use "simple patch versioning" where the value of the
                                         --build flag is used as the patch version.
  --release=<option>                     Indicates the build is a release build.
                                         <options: release|prerelease|none>
  --tag=<value>                          The tag name to use.
  --testBuild=<value>                    Indicates the build is a test build.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

DESCRIPTION
  This command is used to compute the version number of Fluid packages. The release version number is based on what's in
  the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease
  suffix if it is not a tagged build

EXAMPLES
  $ flub generate buildVersion
```

_See code: [src/commands/generate/buildVersion.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/generate/buildVersion.ts)_

## `flub generate bundleStats`

Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later consumption

```
USAGE
  $ flub generate bundleStats [-v | --quiet] [--smallestAssetSize <value>]

FLAGS
  --smallestAssetSize=<value>  [default: 100] The smallest asset size in bytes to consider correct. Adjust when testing
                               for assets that are smaller.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

DESCRIPTION
  Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later
  consumption
```

_See code: [src/commands/generate/bundleStats.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/generate/bundleStats.ts)_

## `flub generate changelog`

Generate a changelog for packages based on changesets.

```
USAGE
  $ flub generate changelog -g client|server|azure|build-tools|gitrest|historian [-v | --quiet] [--version <value>]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  --version=<value>            The version for which to generate the changelog. If this is not provided, the version of
                               the package according to package.json will be used.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

DESCRIPTION
  Generate a changelog for packages based on changesets.

EXAMPLES
  Generate changelogs for the client release group.

    $ flub generate changelog --releaseGroup client
```

_See code: [src/commands/generate/changelog.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/generate/changelog.ts)_

## `flub generate changeset`

Generates a new changeset file. You will be prompted to select the packages affected by this change. You can also create an empty changeset to include with this change that can be updated later.

```
USAGE
  $ flub generate changeset [--json] [-v | --quiet] [-b <value>] [--empty -g
    client|server|azure|build-tools|gitrest|historian] [--all] [--uiMode default|simple]

FLAGS
  -b, --branch=<value>         [default: main] The branch to compare the current changes against. The current changes
                               will be compared with this branch to populate the list of changed packages. You must have
                               a valid remote pointing to the microsoft/FluidFramework repo.
  -g, --releaseGroup=<option>  Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  --all                        Include ALL packages, including examples and other unpublished packages.
  --empty                      Create an empty changeset file. If this flag is used, all other flags are ignored. A new,
                               randomly named changeset file will be created every time --empty is used.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

EXPERIMENTAL FLAGS
  --uiMode=<option>  [default: default] Controls the mode in which the interactive UI is displayed. The 'default' mode
                     includes an autocomplete filter to narrow the list of packages. The 'simple' mode does not include
                     the autocomplete filter, but has better UI that may display better in some terminal configurations.
                     This flag is experimental and may change or be removed at any time.
                     <options: default|simple>

ALIASES
  $ flub changeset add

EXAMPLES
  Create an empty changeset using the --empty flag.

    $ flub generate changeset --empty

  Create a changeset interactively. Any package whose contents has changed relative to the 'main' branch will be
  selected by default.

    $ flub generate changeset

  You can compare with a different branch using --branch (-b).

    $ flub generate changeset --branch next

  By default example and private packages are excluded, but they can be included with --all.

    $ flub generate changeset --all
```

_See code: [src/commands/generate/changeset.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/generate/changeset.ts)_

## `flub generate upcoming`

Generates a summary of all changesets. This is used to generate an UPCOMING.md file that provides a single place where developers can see upcoming changes.

```
USAGE
  $ flub generate upcoming -g client|server|azure|build-tools|gitrest|historian -t major|minor [--json] [-v | --quiet]
    [--out <value>]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -t, --releaseType=<option>   (required) The type of release for which the upcoming file is being generated.
                               <options: major|minor>
  --out=<value>                [default: UPCOMING.md] Output the results to this file.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
  --quiet        Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

EXAMPLES
  Generate UPCOMING.md for the client release group using the minor changesets.

    $ flub generate upcoming -g client -t minor

  You can output a different file using the --out flag.

    $ flub generate upcoming -g client -t minor --out testOutput.md
```

_See code: [src/commands/generate/upcoming.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/generate/upcoming.ts)_
