---
"@fluidframework/container-runtime": minor
"__section": feature
---

Add experimental option to skip separate blob uploads when attaching a detached container

A new `@alpha` `ContainerRuntimeOptions` flag, `enableSingleRoundTripFileCreate`, lets a
detached container with `uploadBlob()`-created blobs attach in a single network round trip instead
of `N + 2`. When enabled, blobs created while detached are embedded directly in the attach summary
(each in its own subtree, with a `groupId` equal to its local id, so a client that doesn't need the
bytes yet can defer fetching them) instead of being uploaded to detached storage ahead of time. This
only changes detached-container attach behavior; documents, GC, and post-attach summarization are
unaffected. See `packages/runtime/container-runtime/src/blobManager/singleRoundTripFileCreate.md`
for the design and current limitations.
