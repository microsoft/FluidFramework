# Checking for Broken Links

To check for broken links in the documentation, do the following steps:

1. Switch to the website folder: `cd website`.
2. Run `pnpm i` to install dependencies.
3. Follow the [link checker setup instructions](../../../../website/README.md#link-checker-setup) to install linkcheck 3.0.0 and add it to your `PATH`.
4. Run `pnpm build` to build the website.
5. Run `pnpm ci:check-links` to serve the built website and run a link check.

Fix any broken links found.
