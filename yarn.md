# yarn cheatsheet

Note: this PR and PR #4593 are closely related.

This draft PR is an experiment of replacing our custom fluid-build tool and lerna with [yarn2 workspaces](https://yarnpkg.com/features/workspaces) and [lage](https://microsoft.github.io/lage/).

I do not intend to check this in; I am sharing it in case anyone else is investigating speeding up our build system.

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

### Known issues and caveats

#### Caching doesn't work

lage's caching seems busted. Maybe an incompatibility with Yarn v2?



