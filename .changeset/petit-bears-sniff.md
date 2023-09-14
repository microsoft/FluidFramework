---
"@fluid-tools/api-markdown-documenter": minor
---

Add (alpha) HTML rendering APIs

Adds capabilities for rendering API docs as HTML in addition to Markdown.

Updates existing Markdown rendering to fall back to this separate infra, rather than bundling its own HTML rendering (for tables, etc.).

This PR includes a few of API breaking changes:

-   Removes `RenderDocumentationNodeAsMarkdown` type alias, opting to inline the callback signature into `MarkdownRenderers`.
-   Removes the `insideHtml` property from `MarkdownRenderContext`, as it is no longer needed.
-   Renames `DocumentationNode`'s `filePath` property to `documentPath` to avoid confusion around file extensions.
