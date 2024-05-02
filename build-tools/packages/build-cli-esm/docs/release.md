`flub release`
==============

Releases a package or release group.

* [`flub release`](#flub-release)

## `flub release`

Releases a package or release group.

```
USAGE
  $ flub release [-v | --quiet] [-g client|server|azure|build-tools|gitrest|historian | -p <value>] [-t
    major|minor|patch] [-x | --install | --commit | --branchCheck | --updateCheck | --policyCheck]

FLAGS
  -g, --releaseGroup=<option>  Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -p, --package=<value>        Name of package. You can use scoped or unscoped package names. For example, both
                               @fluid-tools/benchmark and benchmark are valid.
  -t, --bumpType=<option>      Version bump type.
                               <options: major|minor|patch>
  -x, --skipChecks             Skip all checks.
      --[no-]branchCheck       Check that the current branch is correct.
      --[no-]commit            Commit changes to a new branch.
      --[no-]install           Update lockfiles by running 'npm install' automatically.
      --[no-]policyCheck       Check that the local repo complies with all policy.
      --[no-]updateCheck       Check that the local repo is up to date with the remote.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

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

_See code: [src/commands/release.ts](https://github.com/packages/build-cli-esm/blob/v0.39.0/src/commands/release.ts)_
