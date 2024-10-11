---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": "deprecation"
---
RestrictiveReadonlyRecord is deprecated

`RestrictiveReadonlyRecord` was an attempt to implement a version of the built-in `Record<TKey, TValue>` type that would prohibit (instead of leaving unrestricted like Record does) values under keys that do not extend `TKey`.

The implementation of `RestrictiveReadonlyRecord` failed to accomplish this except for the edge cases where `TKey` was exactly `string` or exactly `symbol`.
Fixing this bug appears to be impossible within the current limitation of TypeScript, however this library does not require any case other than `TKey` being exactly `string`.

To reduce the risk of users of the tree library using the problematic `RestrictiveReadonlyRecord` type, it has been deprecated and replaced with a more specific type that avoids the bug, `RestrictiveStringRecord<TValue>`.

To highlight that this new type is not intended for direct use by users of tree, and instead is just used as part of the typing of its public API, `RestrictiveStringRecord` has been tagged with `@system`.
See [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels) for more details.
