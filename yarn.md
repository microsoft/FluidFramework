# yarn cheatsheet

Note: this PR and PR #4593 are closely related.

This draft PR is an experiment of replacing our custom fluid-build tool and lerna with [yarn2
workspaces](https://yarnpkg.com/features/workspaces) and [lage](https://microsoft.github.io/lage/).

**Note:** using lage here is incidental. Fluid-build already paralellizes things efficiently, but I didn't have time to
make code changes to fluid-build.

We can decide on package manager vs "task runner" independently, including updating fluid-build as needed.

I do not intend to merge this in; I am sharing it in case anyone else is investigating speeding up the repo init
experience.

## Goals of the experiment:

- Speed up installation/bootstrapping of a new Fluid repo clone.
- Speed up experimentation with new packages or mass package upgrades (no lengthy lerna bootstrap step to change deps).
- Save disk space when using multiple Fluid repo clones.
- Determine what, if anything, doesn't work in this setup.

## How to try it

1. Install yarn globally: `npm i -g yarn`.
1. Run `yarn install`.
1. Use `yarn lage l-build` to run a build using lage.

Note that the **build will fail.** Likely with an error like this:

That's the current state.

## Workspace structure

Yarn supports nested workspaces to some extent, so it actually supports our repo structure pretty well already. Here's
the root workspace config:

```json
  "workspaces": [
    "packages/*/*",
    "examples/**",
    "server/historian/",
    "server/routerlicious/",
    "common/"
  ]
```

The last three entries are also _worktrees_ (more at
<https://yarnpkg.com/features/workspaces#how-to-declare-a-worktree>), and define subpaths that they encompass.

You can list all the workspaces using `yarn workspaces list`.

## Features

Yarn v2 seems particularly well suited to monorepo management. It will determine, based on the version numbers in
package dependencies, whether to install a package from npm or use the one in the repo. You can also [explicitly
define][1] these relationships and say I _always_ want the workspace version.

It also has some very nice interactive package management features. Try going to a non-React package in the repo and
typing `yarn add react-dom`. You can select from versions influenced by what is already used in the repo. You can also
try `yarn upgrade-interactive`.

It can help [deduplicate packages][2] within the repo: `yarn workspaces foreach dedupe --check`

There are also things I haven't fully explored, like the release workflows and constraints, but they look very useful
from a monorepo management perspective.

[1]: https://yarnpkg.com/features/workspaces#workspace-ranges-workspace
[2]: https://yarnpkg.com/cli/dedupe

### Known issues and caveats

#### Caching doesn't work

lage's caching seems busted. Maybe an incompatibility with Yarn v2?

#### 

