---
"@fluidframework/quill-react": minor
"__section": tree
---
Remove the FormattedText re-export from @fluidframework/quill-react

`@fluidframework/quill-react` previously re-exported the `FormattedText` namespace from `@fluidframework/tree`, which is not yet intended for production use.
This re-export has been removed.
