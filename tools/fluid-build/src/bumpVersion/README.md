# Bump Version tool

A tool to help automate release version bumps, and dependencies version bumps.

Currently, it only support doing a minor or a patch release on the client repo.  The other dependent monorepo/packages will be release if there are dependencies to the latest repo version. Only packages in common, packages, server/routerlicious, tools/generator-fluid will be updated and released.

## Usage

The following examples assume the package is install or linked globally
Alternatively run bump-version at the root of the repo by substituting `bump-version` with `npm run bump-version --`.

### Create and pushing a release

- minor version on `master`
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

Note that the dependencies update is all done in the context of the current branch, regardless of what version it is in master or release/* branches

**Example 1**: bumping dependencies `@microsoft/fluid-common-utils`

The version in the current branch off `master` for `@microsoft/fluid-common-utils` is `0.17.0`, and client and server repo is still depending on previous released version 0.15.0. New functionality is added to `@microsoft/fluid-common-utils` that client will need.  To update the version to the latest:

```sh
bump-version -d @microsoft/fluid-common-utils
```

All the dependencies to `@microsoft/fluid-common-utils` in the package manage by the repo will be changed to `^0.17.0-0`, package lock files will be update, and the change will be committed.

**Example 2**: bumping dependencies to server

The version in the current branch off `release/0.17.x` for server packages are `0.1006.3`, and client repo is still depending on previous released version `0.1006.2`. New functionality is added to some of the server packages that client packages will need.  To update the version to the latest in the branch:

```sh
bump-version -d server
```

All the dependencies to packages in the server repo be changed to `^0.1006.3-0`, package lock files will be update, and the change will be committed. `fluid-build --symlink:full` will now connect the packages/monorepo to do local development`
