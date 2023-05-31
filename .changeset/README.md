# Changesets

This folder contains changesets, which are markdown files that hold two key bits of information:

1. a version type (following semver), and
2. change information to be added to a changelog. You can find the full documentation for it
   [in the changesets repository](https://github.com/changesets/changesets)

We have a list of common questions to get you started with changesets in this project in
[our wiki](https://github.com/microsoft/FluidFramework/wiki/Changesets-FAQ).

## Updating changelogs

Assumes changelog tools have been built.

1. Run `pnpm exec changeset version`.
1. `git add .changeset`
1. Find and replace `## 2.0.0\n` with `## [RELEASE VERSION]\n`
1. Run `rg "## [RELEASE VERSION]\s*###" --multiline --files-without-match **/CHANGELOG.md > NoChanges.txt`
1. Run `cat NoChanges.txt | while read line; do sd "## 2.0.0-internal.4.4.0\s*##" "## 2.0.0-internal.4.4.0\n\nDependency updates only.\n\n##" $line; done`
1. `pnpm -r --workspace-concurrency=1 exec -- git add CHANGELOG.md`
1. `git restore .`
1. `git clean -df`
