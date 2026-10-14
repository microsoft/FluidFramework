---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Reject view creation from disposed tree checkouts

Creating a view from a disposed checkout now fails with a usage error instead of returning an unusable view.
