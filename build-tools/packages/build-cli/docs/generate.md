`flub generate`
===============

Generate commands are used to create/update code, docs, readmes, etc.

* [`flub generate buildVersion`](#flub-generate-buildversion)
* [`flub generate bundleStats`](#flub-generate-bundlestats)
* [`flub generate changelog`](#flub-generate-changelog)
* [`flub generate changeset`](#flub-generate-changeset)

## `flub generate buildVersion`

This command is used to compute the version number of Fluid packages. The release version number is based on what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease suffix if it is not a tagged build

```
USAGE
  $ flub generate buildVersion --build <value> [-v] [--testBuild <value>] [--release release|prerelease|none] [--patch
    <value>] [--base <value>] [--tag <value>] [-i <value>]

FLAGS
  -i, --includeInternalVersions=<value>  Include Fluid internal versions.
  --base=<value>                         The base version. This will be read from lerna.json/package.json if not
                                         provided.
  --build=<value>                        (required) The CI build number.
  --patch=<value>                        Indicates the build is a patch build.
  --release=<option>                     Indicates the build is a release build.
                                         <options: release|prerelease|none>
  --tag=<value>                          The tag name to use.
  --testBuild=<value>                    Indicates the build is a test build.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  This command is used to compute the version number of Fluid packages. The release version number is based on what's in
  the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease
  suffix if it is not a tagged build

EXAMPLES
  $ flub generate buildVersion
```

## `flub generate bundleStats`

Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later consumption

```
USAGE
  $ flub generate bundleStats [-v] [--smallestAssetSize <value>]

FLAGS
  --smallestAssetSize=<value>  [default: 100] The smallest asset size in bytes to consider correct. Adjust when testing
                               for assets that are smaller.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later
  consumption
```

## `flub generate changelog`

Generate a changelog for packages based on changesets.

```
USAGE
  $ flub generate changelog [-v] [-a | -d <value> | --packages | -g client|server|azure|build-tools|gitrest|historian]
    [--releaseGroupRoots] [--private] [--scope <value> | -g client|server|azure|build-tools|gitrest|historian]
    [--version <value>]

FLAGS
  -a, --all                    Run on all packages and release groups. Cannot be used with --dir, --packages, or
                               --releaseGroup.
  -d, --dir=<value>            Run on the package in this directory. Cannot be used with --all, --packages, or
                               --releaseGroup.
  -g, --releaseGroup=<option>  Run on all packages within this release group. Cannot be used with --all, --dir, or
                               --packages.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -g, --skipScope=<option>...  Package scopes to filter out.
                               <options: client|server|azure|build-tools|gitrest|historian>
  --packages                   Run on all independent packages in the repo. Cannot be used with --all, --dir, or
                               --releaseGroup.
  --[no-]private               Only include private packages (or non-private packages for --no-private)
  --releaseGroupRoots          Runs only on the root package of release groups. Can only be used with --all or
                               --releaseGroup.
  --scope=<value>...           Package scopes to filter to.
  --version=<value>            The version for which to generate the changelog. If this is not provided, the version of
                               the package according to package.json will be used.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.

DESCRIPTION
  Generate a changelog for packages based on changesets.

EXAMPLES
  Generate changelogs for the client release group.

    $ flub generate changelog --releaseGroup client
```

## `flub generate changeset`

Generates a new changeset file. You will be prompted to select the packages affected by this change. You can also create an empty changeset to include with this change that can be updated later.

```
USAGE
  $ flub generate changeset [-v] [--json] [-b <value>] [--empty] [--all] [--uiMode default|simple]

FLAGS
  -b, --branch=<value>  [default: main] The branch to compare the current changes against. The current changes will be
                        compared with this branch to populate the list of changed packages. You must have a valid remote
                        pointing to the microsoft/FluidFramework repo.
  --all                 Include ALL packages, including examples and other unpublished packages.
  --empty               Create an empty changeset file. If this flag is used, all other flags are ignored. A new,
                        randomly named changeset file will be created every time --empty is used.

GLOBAL FLAGS
  -v, --verbose  Verbose logging.
  --json         Format output as json.

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
