# SharedTree Write Format

A SharedTree is given a **write format** upon creation. The write format dictates the scheme used to encode ops sent by the DDS as well as its summary format. Future write formats cannot be interpreted by SharedTrees that only understand past write formats and therefore care must be taken when migrating to a new format (e.g. the rollout of a new format must be delayed/staged until all clients support the new write format).

## Document Upgrade

SharedTree will automatically upgrade documents to a newer write format when necessary. This happens when a client with a newer write format loads a document written in an older write format. The joining client will upgrade the document to the new format as well as notify the other clients to change automatically to the newer write format.

> After a document upgrade occurs, clients that do not support the new write format will no longer be able to read the document!

## Write Formats

### 0.0.2

The first released write format. Ops and summaries are not compressed or optimized.

### 0.1.1

An optimized encoding is used for ops and summaries to dramatically reduce their serialized size. See the [0.1.1 compression document](./Compression.md) for details.
