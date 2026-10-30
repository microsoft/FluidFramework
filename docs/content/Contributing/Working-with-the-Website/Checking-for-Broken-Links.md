# Checking for Broken Links

To check for broken links in the documentation, do the following steps:

1. Switch to the website folder: `cd website`.
2. Run `pnpm i` to install dependencies.
3. Run `pnpm build` to build the website.
4. Run `pnpm ci:check-links` to serve the built website and run a link check.

See [link checker setup](../../../../website/README.md#link-checker-setup) for its scope and exclusions.

Fix any broken links found.
