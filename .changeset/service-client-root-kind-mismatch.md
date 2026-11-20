---
"fluid-framework": minor
"__section": fix
---
ServiceClient.loadContainer (alpha) rejects a mismatched root kind

When passed a single [data store kind](https://fluidframework.com/docs/api/fluid-framework/datastorekind-interface), [`ServiceClient.loadContainer`](https://fluidframework.com/docs/api/fluid-framework/serviceclient-interface#loadcontainer-methodsignature) now rejects a document whose persisted root type differs from the supplied kind's type, even if the two kinds use the same storage layout.
Applications that intentionally support multiple type identifiers can still supply a [registry](https://fluidframework.com/docs/api/fluid-framework/datastoreregistry-typealias).
