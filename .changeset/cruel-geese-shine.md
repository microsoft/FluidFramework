---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Change and clarify limitations related to alpha features allowUnknownOptionalFields and importVerbose

[allowUnknownOptionalFields](https://fluidframework.com/docs/api/fluid-framework/schemafactoryobjectoptions-interface#allowunknownoptionalfields-propertysignature) currently has some limitations.
To mitigate some bugs, [importVerbose](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#importverbose-methodsignature) has dropped support for unknown optional fields.
Previously `importVerbose` would tolerate some unknown optional fields, but could not validate they comply with the document stored schema.
This could cause some crashes, and likely document corruption.
This support has been removed: now trying to create nodes containing unknown optional fields via `importVerbose` with throw a `UsageError`.
There is no longer a way to create and insert nodes which contain subtrees for which there is no schema.

Ideally `exportVerbose` and `importVerbose` could be used to round trip data while optionally preserving unknown optional fields, but this is currently not working and thus not supported.

If exporting using [useStoredKeys](https://fluidframework.com/docs/api/fluid-framework/treeencodingoptions-interface#usestoredkeys-propertysignature), the unknown optional fields will be preserved but may not be able to be imported.
If exporting not using `useStoredKeys`, a known bug currently causes an assert.
