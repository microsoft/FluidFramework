# @fluid-experimental/stack

## Overview

A simple stack DDS that demonstrates simple use of the attachment blob storage APIs. The stack supports only two operations (`push` and `pop`). The stack uploads its elements to blob storage rather than retaining them in memory, thus, it can in theory have more elements than fit in the client machine's memory or disk space.

## Implementation

The SharedStack stores each of its elements in a unique blob. It retains only a handle to the first blob (the top of the stack). That contents of that blob contain a handle to the second blob, which contains a handle to the third blob, etc.; the blobs form a linked list. This allows the SharedStack to retain just a single handle to the top blob which transitively references all the others. A push operation uploads a new blob that points to the previous top blob. A pop operation downloads the contents of the top blob and sets the new top to be its "next". An empty SharedStack has an `undefined` top blob handle.

## Investigation

One of the primary motivations for this DDS is to prototype a "handle to handles" scenario; it creates handles to blobs whose contents contain handles to another blob, whose contents have a handle to yet another blob, and so on. This scenario is interesting because it is not handled by the current default GC behavior for SharedObjects. The implementation of `getGCData` in the base `SharedObject` class serializes the shared object and records any handles that it finds along the way. It then passes these handles up to let GC know that they are being used. This approach does not work for handles whose blobs contain other handles. This is not surprising; a generic method for discovering all handles recursively would require all known blobs to be downloaded. Not only would this be slow, it might be prohibitively spatially expensive for a DDS who has uploaded more blobs than can fit in a client's memory (consider for example a SharedStack with 1,000,000 elements of 100 KB each). So, the DDS must implement `getGCData` itself in this case.
