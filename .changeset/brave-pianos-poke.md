---
"@fluidframework/react": minor
"__section": feature
---
Add support for React 19

Previously `@fluidframework/react"` only supported React 18.
Now both React 18 and 19 are supported.
As part of this, some of the TypeScript typing has been adjusted to allow use with both versions more clearly, but the runtime behavior is unchanged.
Users of these `@alpha` APIs might need slight adjustments to continue to type check in some edge cases.
