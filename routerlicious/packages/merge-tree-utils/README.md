# Prague Loader

The loader makes up the minimal kernal of the Prague runtime. This kernel is responsible for providing access to
Prague storage as well as consensus over a quorum of clients.

Storage includes snapshots as well as the live and persisted operation stream.

The consensus system allows clients within the collaboration window to agree on document properties. One
example of this is the npm package that should be loaded to process operations applied to the document.