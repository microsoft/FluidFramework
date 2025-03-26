`flub bump`
===========

Bump the version of packages, release groups, and their dependencies.

* [`flub bump PACKAGE_OR_RELEASE_GROUP`](#flub-bump-package_or_release_group)
* [`flub bump deps PACKAGE_OR_RELEASE_GROUP`](#flub-bump-deps-package_or_release_group)

## `flub bump PACKAGE_OR_RELEASE_GROUP`

Bumps the version of a release group or package to the next minor, major, or patch version, or to a specific version, with control over the interdependency version ranges.

```
USAGE
  $ flub bump PACKAGE_OR_RELEASE_GROUP [-v | --quiet] [-t major|minor|patch | --exact <value>] [--scheme
    semver|internal|virtualPatch | ] [--exactDepType ^|~||workspace:*|workspace:^|workspace:~] [-d
    ^|~||workspace:*|workspace:^|workspace:~] [--updateAllDeps] [-x | --install | --commit |  |  | ]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group.

FLAGS
  -d, --interdependencyRange=<option>  Controls the type of dependency that is used between packages within the release
                                       group. Use "" (the empty string) to indicate exact dependencies. Use the
                                       workspace:-prefixed values to set interdependencies using the workspace protocol.
                                       The interdependency range will be set to the workspace string specified.
                                       <options: ^|~||workspace:*|workspace:^|workspace:~>
  -t, --bumpType=<option>              Bump the release group or package to the next version according to this bump
                                       type.
                                       <options: major|minor|patch>
  -x, --skipChecks                     Skip all checks.
      --[no-]commit                    Commit changes to a new branch.
      --exact=<value>                  An exact string to use as the version. The string must be a valid semver version
                                       string.
      --exactDepType=<option>          [DEPRECATED - Use interdependencyRange instead.] Controls the type of dependency
                                       that is used between packages within the release group. Use "" to indicate exact
                                       dependencies.
                                       <options: ^|~||workspace:*|workspace:^|workspace:~>
      --[no-]install                   Update lockfiles by running 'npm install' automatically.
      --scheme=<option>                Override the version scheme used by the release group or package.
                                       <options: semver|internal|virtualPatch>
      --updateAllDeps                  Controls the behavior for updating dependencies in a package. If "false" (the
                                       default), matching dependencies are only updated if they use the "workspace:"
                                       protocol. If "true", they are updated regardless of what their version specifier
                                       says. This flag only exists to allow use of the old behavior (by passing
                                       `--updateAllDeps).

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Bumps the version of a release group or package to the next minor, major, or patch version, or to a specific version,
  with control over the interdependency version ranges.

  The bump command is used to bump the version of a release groups or individual packages within the repo. Typically
  this is done as part of the release process (see the release command), but it is sometimes useful to bump without
  doing a release, for example when moving a package from one release group to another.

EXAMPLES
  Bump @fluidframework/build-common to the next minor version.

    $ flub bump @fluidframework/build-common -t minor

  Bump the server release group to the next major version, forcing the semver version scheme.

    $ flub bump server -t major --scheme semver

  By default, the bump command will run npm install in any affected packages and commit the results to a new branch.
  You can skip these steps using the --no-commit and --no-install flags.

    $ flub bump server -t major --no-commit --no-install

  You can control how interdependencies between packages in a release group are expressed using the
  --interdependencyRange flag.

    $ flub bump client --exact 2.0.0-internal.4.1.0 --interdependencyRange "~"

  You can set interdependencies using the workspace protocol as well. The interdependency range will be set to the
  workspace string specified.

    $ flub bump client --exact 2.0.0-internal.4.1.0 --interdependencyRange "workspace:~"
```

_See code: [src/commands/bump.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/bump.ts)_

## `flub bump deps PACKAGE_OR_RELEASE_GROUP`

Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.

```
USAGE
  $ flub bump deps PACKAGE_OR_RELEASE_GROUP [-v | --quiet] [--prerelease -t
    latest|newest|greatest|minor|patch|@next|@canary] [--onlyBumpPrerelease] [-g
    client|server|azure|build-tools|gitrest|historian | -p <value>] [-x | --install | --commit |  |  | ]
    [--updateChecker ncu|homegrown]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group.

FLAGS
  -g, --releaseGroup=<option>  Only bump dependencies within this release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -p, --package=<value>        Only bump dependencies of this package. You can use scoped or unscoped package names. For
                               example, both @fluid-tools/markdown-magic and markdown-magic are valid.
  -t, --updateType=<option>    [default: minor] Bump the current version of the dependency according to this bump type.
                               <options: latest|newest|greatest|minor|patch|@next|@canary>
  -x, --skipChecks             Skip all checks.
      --[no-]commit            Commit changes to a new branch.
      --[no-]install           Update lockfiles by running 'npm install' automatically.
      --onlyBumpPrerelease     Only bump dependencies that are on pre-release versions.
      --prerelease             Treat prerelease versions as valid versions to update to.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

EXPERIMENTAL FLAGS
  --updateChecker=<option>  Specify the implementation to use to update dependencies. The default, 'ncu', uses
                            npm-check-updates under the covers. The 'homegrown' value is a new experimental updater
                            written specifically for the Fluid Framework repo. This flag is experimental and may change
                            or be removed at any time.
                            <options: ncu|homegrown>

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

    $ flub bump deps server -g client -t greatest --prerelease

  Bump dependencies on server packages to the current version across the repo, replacing any pre-release ranges with
  release ranges.

    $ flub bump deps server -t latest
```

_See code: [src/commands/bump/deps.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/bump/deps.ts)_
