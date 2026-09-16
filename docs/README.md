# docs

This directory contains documentation aimed at developers working in this repository.
It contains guidelines, process documentation, and tooling guidance.
It also contains high-level architectural documentation whose scope exceeds a given package and/or workspace.

Note: this area is under active development.
We are in the process of migrating documentation here from our existing GitHub wiki and other sources.
Please expect some churn here in terms of organization and tooling.

## Guidance

The documentation content in this directory should itself follow our [Documentation Guidelines](./content/Guidelines/Documentation-Guidelines.md).

In particular, our [Markdown best practices](./content/Guidelines/Documentation-Guidelines/Markdown-Best-Practices.md).

## Structure

All documentation content lives under the [content](./content) directory.
The root of the documentation is [content/Home.md](./content/Home.md), which serves as the top-level table of contents.

To keep the documentation organized and navigable, we follow two conventions:

### Directories have a sibling index page

Every subdirectory has a sibling Markdown page with the same name that serves as the index (table of contents) for that directory.
For example, the [content/Guidelines](./content/Guidelines) directory has a sibling [content/Guidelines.md](./content/Guidelines.md) page that links to the documents within it.
This pattern repeats at every level of nesting.

When adding a new directory, add a corresponding sibling index page and link to the directory's contents from it.

### Pages are reachable from the top down

Every page must be reachable by following links starting from [content/Home.md](./content/Home.md).
In other words, there should be no "orphaned" pages: each page is linked (directly or transitively) from its parent directory's index page, which is in turn linked from its own parent, all the way up to the root.

When adding a new page, link to it from the appropriate index page so that it remains discoverable.

### Images and other binary assets

Image and other binary assets are co-located with the documentation that uses them.
Each level of the hierarchy that needs assets has its own `_assets` subdirectory (for example, [content/Contributing/_assets](./content/Contributing/_assets) holds the images used by the pages under `content/Contributing`).

When adding assets, place them in an `_assets` directory at the appropriate level and reference them with a relative path from the consuming page.

These assets are stored using [Git LFS](https://git-lfs.com/) to keep large binary blobs out of the main repository history.
The tracked file types are declared in a single [`.gitattributes`](./.gitattributes) at the root of `docs`, which applies to every `_assets` directory in the tree.
Contributors who add or update assets must have Git LFS installed and initialized (run `git lfs install` once per machine); otherwise commits will store the raw binary contents instead of LFS pointers.

## Tooling

The `docs` directory is a standalone [pnpm](https://pnpm.io/) workspace with its own tooling for formatting and linting the Markdown content.

### Formatting

We use [Prettier](https://prettier.io/) to enforce consistent formatting.
The configuration lives in [prettier.config.cjs](./prettier.config.cjs), which extends the repository's shared `build-common` Prettier configuration.

### Linting

We use [markdownlint](https://github.com/DavidAnson/markdownlint) (via [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)) to lint the Markdown content.
The configuration lives in [.markdownlint-cli2.mjs](./.markdownlint-cli2.mjs).
In addition to the standard rules, we use the [markdownlint-rule-relative-links](https://github.com/theoludwig/markdownlint-rule-relative-links) custom rule to verify that relative links resolve to files that exist.

### Commands

Run the following from the `docs` directory:

- `npm run format` — format the Markdown content with Prettier.
- `npm run lint` — check formatting (Prettier) and linting (markdownlint).
- `npm run lint:fix` — apply Prettier and markdownlint auto-fixes.

These checks also run in CI for any change under `docs` (see the `docs-lint` pipeline under [tools/pipelines](../tools/pipelines)).
