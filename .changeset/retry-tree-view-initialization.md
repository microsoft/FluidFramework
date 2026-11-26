---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Tree views remain usable after initialization rejects invalid content

If [`view.initialize(content)`](https://fluidframework.com/docs/api/fluid-framework/treeview-interface#initialize-methodsignature) rejects content that does not match the schema, you can now correct the content and retry on the same view.
Calling it on an already initialized tree still throws, but leaves the existing content and view usable.
