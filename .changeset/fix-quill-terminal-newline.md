---
"@fluidframework/quill-react": minor
"__section": fix
---
Fix extra blank lines in collaborating Quill editors

Quill React bindings now distinguish Quill's required terminal newline from user-authored content. Remote editors no longer render an extra blank paragraph after text or line-formatting changes, while intentional trailing line breaks remain synchronized.
