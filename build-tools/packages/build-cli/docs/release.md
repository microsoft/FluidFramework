`flub release`
==============

Release commands are used to manage the Fluid release process.

* [`flub release`](#flub-release)
* [`flub release report`](#flub-release-report)

## `flub release`

Releases a package or release group.

```
USAGE
  $ flub release [-g client|server|azure|build-tools | -p <value>] [-t major|minor|patch] [-x | --install |
    --commit | --branchCheck | --updateCheck | --policyCheck] [-v]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools>
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

## `flub release report`

Generates a report of Fluid Framework releases.

```
USAGE
  $ flub release report [--json] [--days <value>] [-s | -r] [-g client|server|azure|build-tools [--all | -o
    <value>]] [-p <value> ] [--limit <value> ] [-v]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools>
  -o, --output=<value>         Output JSON report files to this location.
  -p, --package=<value>        Name of package.
  -r, --mostRecent             Always pick the most recent version as the latest (ignore semver version sorting).
  -s, --highest                Always pick the greatest semver version as the latest (ignore dates).
  -v, --verbose                Verbose logging.
  --all                        List all releases. Useful when you want to see all the releases done for a release group
                               or package. The number of results can be limited using the --limit argument.
  --days=<value>               [default: 10] The number of days to look back for releases to report.
  --limit=<value>              Limits the number of displayed releases for each release group.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generates a report of Fluid Framework releases.

  The release report command is used to produce a report of all the packages that were released and their current
  version. After a release, it is useful to generate this report to provide to customers, so they can update their
  dependencies to the most recent version.

  The command will prompt you to select versions for a package or release group in the event that multiple versions have
  recently been released.

  Using the --all flag, you can list all the releases for a given release group or package.

EXAMPLES
  Output all release report files to the current directory.

    $ flub release report -o .

  Generate a minimal release report and display it in the terminal.

    $ flub release report

  Generate a minimal release report and output it to stdout as JSON.

    $ flub release report --json

  List all the releases of the azure release group.

    $ flub release report --all -g azure

  List the 10 most recent client releases.

    $ flub release report --all -g client --limit 10
```
