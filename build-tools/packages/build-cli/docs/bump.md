`flub bump`
===========

Bump the version of packages, release groups, and their dependencies.

* [`flub bump PACKAGE_OR_RELEASE_GROUP`](#flub-bump-package_or_release_group)
* [`flub bump deps PACKAGE_OR_RELEASE_GROUP`](#flub-bump-deps-package_or_release_group)

## `flub bump PACKAGE_OR_RELEASE_GROUP`

Bumps the version of a release group or package to the next minor, major, or patch version.

```
USAGE
  $ flub bump [PACKAGE_OR_RELEASE_GROUP] -t major|minor|patch [--scheme semver|internal|virtualPatch] [-x
    | --install | --commit |  |  | ] [-v]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group.

FLAGS
  -t, --bumpType=<option>  (required) Bump the release group or package to the next version according to this bump type.
                           <options: major|minor|patch>
  -v, --verbose            Verbose logging.
  -x, --skipChecks         Skip all checks.
  --[no-]commit            Commit changes to a new branch.
  --[no-]install           Update lockfiles by running 'npm install' automatically.
  --scheme=<option>        Override the version scheme used by the release group or package.
                           <options: semver|internal|virtualPatch>

DESCRIPTION
  Bumps the version of a release group or package to the next minor, major, or patch version.

  The bump command is used to bump the version of a release groups or individual packages within the repo. Typically
  this is done as part of the release process (see the release command), but it is sometimes useful to bump without
  doing a release.

EXAMPLES
  Bump @fluidframework/build-common to the next minor version.

    $ flub bump @fluidframework/build-common -t minor

  Bump the server release group to the next major version, forcing the semver version scheme.

    $ flub bump server -t major --scheme semver

  By default, the bump command will run npm install in any affected packages and commit the results to a new branch.
  You can skip these steps using the --no-commit and --no-install flags.

    $ flub bump server -t major --no-commit --no-install
```

_See code: [src/commands/bump.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/bump.ts)_

## `flub bump deps PACKAGE_OR_RELEASE_GROUP`

Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.

```
USAGE
  $ flub bump deps [PACKAGE_OR_RELEASE_GROUP] [-p -t latest|newest|greatest|minor|patch|@next|@canary]
    [--onlyBumpPrerelease] [-g client|server|azure|build-tools] [-x | --install | --commit |  |  | ] [-v]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group.

FLAGS
  -g, --releaseGroup=<option>  Only bump dependencies within this release group.
                               <options: client|server|azure|build-tools>
  -p, --prerelease             Treat prerelease versions as valid versions to update to.
  -t, --updateType=<option>    Bump the current version of the dependency according to this bump type.
                               <options: latest|newest|greatest|minor|patch|@next|@canary>
  -v, --verbose                Verbose logging.
  -x, --skipChecks             Skip all checks.
  --[no-]commit                Commit changes to a new branch.
  --[no-]install               Update lockfiles by running 'npm install' automatically.
  --onlyBumpPrerelease         Only bump dependencies that are on pre-release versions.

DESCRIPTION
  Update the dependency version of a specified package or release group. That is, if one or more packages in the repo
  depend on package A, then this command will update the dependency range on package A. The dependencies and the
  packages updated can be filtered using various flags.

  To learn more see the detailed documentation at
  https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bumpDetails.md

EXAMPLES
  Bump dependencies on @fluidframework/build-common to the latest release version across all release groups.

    $ flub bump deps @fluidframework/build-common -t latest

  Bump dependencies on @fluidframework/build-common to the next minor version in the azure release group.

    $ flub bump deps @fluidframework/build-common -t minor -g azure

  Bump dependencies on packages in the server release group to the greatest released version in the client release
  group. Include pre-release versions.

    $ flub bump deps server -g client -t greatest -p

  Bump dependencies on server packages to the current version across the repo, replacing any pre-release ranges with
  release ranges.

    $ flub bump deps server -t latest
```
