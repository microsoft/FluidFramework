---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Allow attaching a SharedTree to an already attached container

Before this release, attaching a SharedTree instance to an already attached container would fail with assert code `0x88f` if that instance needed to include data about removed nodes in its attach summary.
(This is the case when nodes are removed before attaching and there is a local branch that forks from a commit that made such a removal or from an earlier commit. This is also the case when retaining `Revertible` objects for those commits).

After this release, the behavior depends on the `CodecWriteOptions.oldestCompatibleClient` value:
* For values < `FluidClientVersion.v2_52`, the behavior is the same.
* For values >= `FluidClientVersion.v2_52`, the attach will succeed, but use a newer storage format.

Applications should take care to saturate their clients with FF version `2.52` (or greater) before using a `CodecWriteOptions.oldestCompatibleClient` that is equal to or greater than `FluidClientVersion.v2_52`.
Failure to do so may lead clients with `CodecWriteOptions.oldestCompatibleClient` equal to or greater than `FluidClientVersion.v2_52` to attach SharedTree instances using a storage format that is not supported by FF versions before `2.52`.
This means that application versions using FF versions before `2.52` will be unable to open documents where such an operation has happened.
