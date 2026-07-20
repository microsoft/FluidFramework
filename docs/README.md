# docs

This directory contains documentation aimed at developers working in this repository.
It contains guidelines, process documentation, and tooling guidance.
It also contains high-level architectural documentation whose scope exceeds a given package and/or workspace.

Note: this area is under active development.
We are in the process of migrating documentation here from our existing GitHub wiki and other sources.
Please expect some churn here in terms of organization and tooling.

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
