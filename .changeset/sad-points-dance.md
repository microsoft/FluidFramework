---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix independentInitializedView when used with ForestTypeExpensiveDebug

Previously using [independentInitializedView](https://fluidframework.com/docs/api/tree/#independentinitializedview-function) with [ForestTypeExpensiveDebug](https://fluidframework.com/docs/api/tree/#foresttypeexpensivedebug-variable) when the root schema was not an optional field, an error was thrown about the tree being out of schema.
This has been fixed.
