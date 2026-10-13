# Changesets

This folder contains changesets, which are markdown files that hold two key bits of information:

1. a version type (following semver), and
2. change information to be added to a changelog. You can find the full documentation for it
   [in the repo changeset documentation](../../../docs/content/Contributing/Breaking-vs-Non-Breaking-Changes/Changesets.md) or in [the official changesets documentation.](https://github.com/changesets/changesets)

There is also a list of [frequently asked questions](../../../docs/content/Contributing/Breaking-vs-Non-Breaking-Changes/Changesets-FAQ.md) in
the documentation.

## Updating changelogs from changesets

See
[flub generate changelog](../../../build-tools/packages/build-cli/docs/generate.md#flub-generate-changelog), which is built on
top of [@fluid-private/changelog-generator](../../../build-tools/packages/changelog-generator/README.md).
