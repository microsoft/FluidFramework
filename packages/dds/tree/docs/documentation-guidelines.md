# Documentation Guidelines

This package uses a mix of markdown and code comments as documentation.
In an effort to improve linking and reduce information duplication, the generated API documentation is committed to git on the `internal-docs` branch.
This generated documentation also includes APIs that are not package-public which will not be hosted on the official [Fluid Framework website](fluidframework.com).

## Internal Documentation Index Files

In order to publish non-package exported API docs, we currently export (almost) everything through the `internalDocumentationIndex.ts` files.
This is meant to be a temporary measure and we will be working towards being able to generate docs for all TSDoc comments without the need for these files.

Maintenance Instructions:

-   If a folder is renamed, update its path and export name in the applicable files
-   If a folder is added, add an export for it in the applicable files
