# Bump Version tool

A tool to help automate release version bumps, and dependencies version bumps.

Currently, it only support doing a minor or a patch release on the client repo.  The other dependent monorepo/packages will be release if there are dependencies to the latest repo version. Only packages in common, packages, server/routerlicious, tools/generator-fluid will be updated and released.

## Usage

The following examples assume the package is install or linked globally
Alternatively run bump-version at the root of the repo by substituting `bump-version` with `npm run bump-version --`.

### Create and pushing a release

- minor version on `main`
- patch version on `release/*` branches

```sh
bump-version
```

The tool will detect the set of mono repo and packages that needs to be released.  Starting from the client monorepo, if it find any dependencies to the current version in the branch from common or server packages, it will release them.

For each package/monorepo that needs to be release, from the bottom of the dependency chain, the tool will:

- add and push tag for the release
- wait for the CI to build and publish the package
- fix all the pre-release dependencies to the released package in the other packages/monorepo
- run `npm install` to update all the lock file
- commit the change and repeat on the next level of the dependency change

### Update dependencies across monorepo or independent packages

Note that the dependencies update is all done in the context of the current branch, regardless of what version it is in main or release/* branches

**Example 1**: bumping dependencies `@fluidframework/common-utils`

The version in the current branch off `main` for `@fluidframework/common-utils` is `0.17.0`, and client and server repo is still depending on previous released version 0.15.0. New functionality is added to `@fluidframework/common-utils` that client will need.  To update the version to the latest:

```sh
bump-version -d @fluidframework/common-utils
```

All the dependencies to `@fluidframework/common-utils` in the package manage by the repo will be changed to `^0.17.0-0`, package lock files will be update, and the change will be committed.

**Example 2**: bumping dependencies to server

The version in the current branch off `release/0.17.x` for server packages are `0.1006.3`, and client repo is still depending on previous released version `0.1006.2`. New functionality is added to some of the server packages that client packages will need.  To update the version to the latest in the branch:

```sh
bump-version -d server
```

All the dependencies to packages in the server repo be changed to `^0.1006.3-0`, package lock files will be update, and the change will be committed. `fluid-build --symlink:full` will now connect the packages/monorepo to do local development`

## Example output

This is an example output for releasing a patched version (0.16.1).  This is just a client release only with no dependencies to other monorepo/packages. So there is no need to fix any pre-release dependencies and update any lock file.  It only need to push a tag and bump the version afterward.

```tex
D:\src\FluidFramework>npm run bump-version

> root@0.14.0 bump-version D:\src\FluidFramework
> node ./tools/fluid-build/dist/bumpVersion/bumpVersion.js --root .

Bumping patch version
Release Versions:
            @fluidframework/build-common:     0.14.0 (old)
     @fluidframework/eslint-config-fluid:     0.16.0 (old)
      @fluidframework/common-definitions:     0.16.0 (old)
            @fluidframework/common-utils:     0.16.0 (old)
                                  Server:   0.1004.1 (old)
                                  Client:     0.16.1 (new)
         @fluidframework/generator-fluid:     0.16.1 (new)
                   @yo-fluid/dice-roller:     0.16.1 (new)

Creating release 0.16.1
  Creating temporary release branch merge/0.16.1
  Releasing client
    Tagging release client_v0.16.1
>>> Push tag client_v0.16.1 to remote? [y/n] y
    Waiting for package to publish @fluid-example/badge@0.16.1...720s
    Waiting for package to publish @fluid-framework/blob-manager@0.16.1...83s
    Waiting for package to publish @fluid-example/canvas@0.16.1...
...cut for brevity...
    Waiting for package to publish @fluidframework/tool-utils@0.16.1...
    Waiting for package to publish @fluidframework/odsp-utils@0.16.1...
    Fix pre-release dependencies
    No dependencies need to be updated
    Tagging release generator-fluid_v0.16.1
>>> Push tag generator-fluid_v0.16.1 to remote? [y/n] y
Creating bump patch version for development in branch merge/0.16.1
  Bumping client version
  Bumping generator version
  Committing version bump to 0.16.2 into merge/0.16.1
======================================================================================================
Please merge merge/0.16.1 to release/0.16.x
Current repo state:

Repo Versions in branch merge/0.16.1:
            @fluidframework/build-common:     0.16.0 (unchanged)
     @fluidframework/eslint-config-fluid:     0.16.1 (unchanged)
      @fluidframework/common-definitions:     0.16.1 (unchanged)
            @fluidframework/common-utils:     0.16.1 (unchanged)
                                  Server:   0.1004.2 (unchanged)
                                  Client:     0.16.1 -> 0.16.2
         @fluidframework/generator-fluid:     0.16.1 -> 0.16.2
                   @yo-fluid/dice-roller:     0.16.1 -> 0.16.2
```
