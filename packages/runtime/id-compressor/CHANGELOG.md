# @fluidframework/id-compressor

## 2.0.0-rc.1.0.0

### Minor Changes

-   id-compressor: Cluster allocation strategy updated ([#19066](https://github.com/microsoft/FluidFramework/issues/19066)) [0c36eb5f53](https://github.com/microsoft/FluidFramework/commits/0c36eb5f539362a8e27982e831a3ffe7999c1478)

    This change adjusts the cluster allocation strategy for ghost sessions to exactly fill the cluster instead of needlessly allocating a large cluster.
    It will also not make a cluster at all if IDs are not allocated.
    This change adjusts a computation performed at a consensus point, and thus breaks any sessions collaborating across version numbers.
    The version for the serialized format has been bumped to 2.0, and 1.0 documents will fail to load with the following error:
    IdCompressor version 1.0 is no longer supported.

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0
