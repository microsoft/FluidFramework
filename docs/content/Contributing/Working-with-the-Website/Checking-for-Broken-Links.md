# Checking for Broken Links

To check for broken links in the documentation, do the following steps:

1. Switch to the docs folder: `cd docs`
1. Run `pnpm i` to install dependencies.
1. Run `pnpm build` to build the docs.
1. Run `pnpm ci:linkcheck` to run a link check.

Fix any broken links found.
