---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Replace "TreeEncodingOptions.useStoredKeys" with "keys" and "KeyEncodingOptions"

The alpha API `TreeEncodingOptions` has had its `useStoredKeys` boolean replaced with `keys` that takes a `KeyEncodingOptions` allowing for three options instead of the previous two.
With the new API, it is now possible to control, for APIs which support it (like [`TreeAlpha.exportVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#exportverbose-methodsignature)), if unknown optional fields will be included when exporting data using stored keys.

Additionally the relevant options interfaces have been marked as `@input`, indicating that in the future more options may be added as optional parameters, and that should be considered non-breaking.
