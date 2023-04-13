`flub release`
==============

Release commands are used to manage the Fluid release process.

* [`flub release`](#flub-release)
* [`flub release history`](#flub-release-history)
* [`flub release report`](#flub-release-report)

## `flub release`

Releases a package or release group.

```
USAGE
  $ flub release [-v] [-g client|server|azure|build-tools|gitrest|historian | -p <value>] [-t
    major|minor|patch] [-x | --install | --commit | --branchCheck | --updateCheck | --policyCheck]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools|gitrest|historian>
  -p, --package=<value>        Name of package.
  -t, --bumpType=<option>      Version bump type.
                               <options: major|minor|patch>
  -v, --verbose                Verbose logging.
  -x, --skipChecks             Skip all checks.
  --[no-]branchCheck           Check that the current branch is correct.
  --[no-]commit                Commit changes to a new branch.
  --[no-]install               Update lockfiles by running 'npm install' automatically.
  --[no-]policyCheck           Check that the local repo complies with all policy.
  --[no-]updateCheck           Check that the local repo is up to date with the remote.

DESCRIPTION
  Releases a package or release group.

  The release command ensures that a release branch is in good condition, then walks the user through releasing a
  package or release group.

  The command runs a number of checks automatically to make sure the branch is in a good state for a release. If any of
  the dependencies are also in the repo, then they're checked for the latest release version. If the dependencies have
  not yet been released, then the command prompts to perform the release of the dependency, then run the release command
  again.

  This process is continued until all the dependencies have been released, after which the release group itself is
  released.
```

_See code: [src/commands/release.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release.ts)_

## `flub release history`

Prints a list of released versions of a package or release group. Releases are gathered from the git tags in repo containing the working directory.

```
USAGE
  $ flub release history [-v] [-g client|server|azure|build-tools|gitrest|historian | -p <value>] [-l <value>]
    [--json]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools|gitrest|historian>
  -l, --limit=<value>          Limits the number of displayed releases for each release group. Results are sorted by
                               semver, so '--limit 10' will return the 10 highest semver releases for the release group.
  -p, --package=<value>        Name of package.
  -v, --verbose                Verbose logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints a list of released versions of a package or release group. Releases are gathered from the git tags in repo
  containing the working directory.

  Use 'npm view' to list published packages based on the public npm registry.

  The number of results can be limited using the --limit argument.

EXAMPLES
  List all the releases of the azure release group.

    $ flub release history -g azure

  List the 10 most recent client releases.

    $ flub release history -g client --limit 10
```

## `flub release report`

Generates a report of Fluid Framework releases.

```
USAGE
  $ flub release report [-v] [--json] [-i | -r | -s] [-g client|server|azure|build-tools|gitrest|historian] [-o
    <value>]

FLAGS
  -g, --releaseGroup=<option>
      Report only on this release group. If also pass --interactive, --highest, or --mostRecent, then the report will only
      include this release group at the selected version.

      If you pass this flag by itself, the command will use the version of the release group at the current commit in the
      repo, but will also include its direct Fluid dependencies.

      If you want to report on a particular release, check out the git tag for the release version you want to report on
      before running this command.
      <options: client|server|azure|build-tools|gitrest|historian>

  -i, --interactive
      Choose the version of each release group and package to contain in the release report.

  -o, --output=<value>
      Output JSON report files to this directory.

  -r, --mostRecent
      Always pick the most recent version as the latest (ignore semver version sorting).

  -s, --highest
      Always pick the greatest semver version as the latest (ignore dates).

  -v, --verbose
      Verbose logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generates a report of Fluid Framework releases.

  The release report command is used to produce a report of all the packages that were released and their version. After
  a release, it is useful to generate this report to provide to customers, so they can update their dependencies to the
  most recent version.

  The command operates in two modes: "whole repo" or "release group." The default mode is "whole repo." In this mode,
  the command will look at the git tags in the repo to determine the versions, and will include all release groups and
  packages in the repo. You can control which version of each package and release group is included in the report using
  the --interactive, --mostRecent, and --highest flags.

  The "release group" mode can be activated by passing a --releaseGroup flag. In this mode, the specified release
  group's version will be loaded from the repo, and its immediate Fluid dependencies will be included in the report.
  This is useful when we want to include only the dependency versions that the release group depends on in the report.

EXAMPLES
  Generate a release report of the highest semver release for each package and release group and display it in the
  terminal only.

    $ flub release report

  Output all release report files to the current directory.

    $ flub release report -o .

  Generate a release report for each package and release group in the repo interactively.

    $ flub release report -i
```
