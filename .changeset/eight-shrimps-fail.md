---
"@fluid-tools/api-markdown-documenter": minor
---

Don't include file extension in paths in Documentation Domain

The Documentation Domain layer of the system is not intended to know anything about files on disk. It has a concept of abstract documentation hierarchy, which maps to file system structure, but that is as close as it gets.

Previously, `DocumentNode` included a property called `filePath`, which included a hard-coded `.md` file extension. This has been removed; it is now the responsibility of consumers to append the appropriate file extension when writing rendered document contents to disk. `renderDocumentsAsMarkdown` now handled this, as the only code in the system that interacts with the file system.

The `filePath` property has also been renamed to `documentPath` to help avoid confusion, and its docs have been updated call out the distinction.

This PR also removes the `getFilePathForApiItem` utility function from the public API - consumers shouldn't need to use it, and it could cause confusion.
