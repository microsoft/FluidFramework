---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Rules regarding how and when lazy schema references are resolved have been clarified

A lazy schema reference is a [LazyItem](https://fluidframework.com/docs/api/fluid-framework/lazyitem-typealias) referencing a [TreeNodeSchema](https://fluidframework.com/docs/api/fluid-framework/treenodeschema-typealias).
They typically look like `() => MySchema` and are used when a [forward reference](https://en.wikipedia.org/wiki/Forward_declaration#Forward_reference) from one schema to another is required (including but not limited to recursive and co-recursive schema).

[TreeViewConfiguration](https://fluidframework.com/docs/api/fluid-framework/treeviewconfiguration-class#_constructor_-constructor) now documents its significance with respect to lazy schema references.
Additionally some implicit assumptions like no modifications of [AllowedTypes](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias)
after resolving of lazy schema references have been enforced (such modifications would previously cause undefined behavior in the future, and now an error is thrown when trying to modify them).

`evaluateLazySchema` has been added as an `@alpha` API that is now consistently used by all internal code when evaluating lazy schema references.
This ensures consistent behavior and error reporting, but also adds caching.
Therefore it is now supported for applications to have lazy schema references which compute the schema when invoked,
without having to implement their own caching as long as those applications use `evaluateLazySchema` anytime they need to evaluate a lazy schema reference.
