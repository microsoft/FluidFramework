# Prague Loader

The loader makes up the minimal kernal of the Prague runtime. This kernel is responsible for providing access to
Prague storage as well as consensus over a quorum of clients.

Storage includes snapshots as well as the live and persisted operation stream.

The consensus system allows clients within the collaboration window to agree on document properties. One
example of this is the npm package that should be loaded to process operations applied to the document.

## Document and channels

The base document channel is 'owned' and run by the chaincode of the loader. It should be versioned and require
a specific loader version.

The channels of the document run separate code as defined by the consensus field. It's possible we could further
split this and have each channel have an independent code source and use the consensus to propagate it.

We could also possibly define a runtime code that gets executed independent of a chain - this would be for UI,
etc...