# Configs and feature gates for solving the 1MB limit.

## Introduction

There is a current limitation regarding the size of the payload a Fluid client can send and receive. [The limit is 1MB per payload](https://github.com/microsoft/FluidFramework/issues/9023) and it is currently enforced explicitly with the `BatchTooLarge` error which closes the container.

There are two features which can be used to work around this size limit, batch compression and compressed batch chunking. This document describes how to enable/disable them, along with a brief description of how they work. The features are enabled by default.

By default, the runtime is configured with a max batch size of `716800` bytes, which is lower than the 1MB limit. The reason for the lower value is to account for possible overhead from the op envelope and metadata.

## Table of contents

-   [Introduction](#introduction)
    -   [Compression](#compression)
    -   [Grouped batching](#grouped-batching)
        -   [Risks](#risks)
    -   [Chunking for compression](#chunking-for-compression)
    -   [Disabling in case of emergency](#disabling-in-case-of-emergency)
    -   [Example configs](#example-configs)
    -   [How it works](#how-it-works)
    -   [How grouped batching works](#how-grouped-batching-works)

## Compression

**Compression targets payloads which exceed the max batch size and it is enabled by default.**. The `IContainerRuntimeOptions.compressionOptions` property, of type `ICompressionRuntimeOptions` is the configuration governing how compression works.

`ICompressionRuntimeOptions` has two properties:

-   `minimumBatchSizeInBytes` – the minimum size of the batch for which compression should kick in. If the payload is too small, compression may not yield too many benefits. To target the original 1MB issue, a good value here would be to match the default maxBatchSizeInBytes (972800), however, experimentally, a good lower value could be at around 614400 bytes. Setting this value to `Number.POSITIVE_INFINITY` will disable compression.
-   `compressionAlgorithm` – currently, only `lz4` is supported.

## Grouped batching

**Note: This feature is currently considered experimental and is not ready for production usage.**

The `IContainerRuntimeOptions.enableGroupedBatching` option has been added to the container runtime layer and is **off by default**. This option will group all batch messages under a new "grouped" message to be sent to the service. Upon receiving this new "grouped" message, the batch messages will be extracted and given the sequence number of the parent "grouped" message.

The purpose for enabling grouped batching on top of compression is that regular compression won't include the empty messages in the chunks. Thus, if we have batches with many messages (i.e. more than 4k), we will go over the batch size limit just on empty op envelopes alone.

See [below](#how-grouped-batching-works) for an example.

### Risks

This option is experimental and should not be enabled yet in production. This option should **ONLY** be enabled after observing that 99.9% of your application sessions contains these changes (runtime version "2.0.0-internal.4.1.0" or later). Containers created with this option may not open in future versions of the framework.

This option will change a couple of expectations around message structure and runtime layer expectations. Only enable this option after testing
and verifying that the following expectation changes won't have any effects:

-   batch messages observed at the runtime layer will not match messages seen at the loader layer (i.e. grouped form at loader layer, ungrouped form at runtime layer)
-   messages within the same batch will have the same sequence number
-   client sequence numbers on batch messages can only be used to order messages with the same sequenceNumber
-   requires all ops to be processed by runtime layer (version "2.0.0-internal.1.2.0" or later https://github.com/microsoft/FluidFramework/pull/11832)

## Chunking for compression

**Op chunking for compression targets payloads which exceed the max batch size after compression.** So, only payloads which are already compressed. By default, the feature is enabled.

The `IContainerRuntimeOptions.chunkSizeInBytes` property is the only configuration for chunking and it represents the size of the chunked ops, when chunking is necessary. When chunking is performed, the large op is split into smaller ops (chunks). This config represents both the size of the chunks and the threshold for the feature to activate. The value enables a trade-off between large chunks / few ops and small chunks / many ops. A good value for this would be at around 204800. Setting this value to `Number.POSITIVE_INFINITY` will disable chunking.

This config would govern chunking compressed batches only. We will not be enabling chunking across all types of ops/batches but **only when compression is enabled and when the batch is compressed**, and its payload size is more than `IContainerRuntimeOptions.chunkSizeInBytes`.

## Disabling in case of emergency

If the features are enabled using the configs, they can be disabled at runtime via feature gates as following:

-   `Fluid.ContainerRuntime.CompressionDisabled` - if set to true, will disable compression (this has a side effect of also disabling chunking, as chunking is invoked only for compressed payloads).
-   `Fluid.ContainerRuntime.DisableGroupedBatching` - if set to true, will disable grouped batching.
-   `Fluid.ContainerRuntime.CompressionChunkingDisabled` - if set to true, will disable chunking for compression.

## Example configs

By default, the runtime is configured with the following values related to compression and chunking:

```
    const runtimeOptions: IContainerRuntimeOptions = {
        compressionOptions: {
            minimumBatchSizeInBytes: 614400,
            compressionAlgorithm: CompressionAlgorithms.lz4,
        },
        chunkSizeInBytes: 204800,
        maxBatchSizeInBytes: 716800,
    }
```

To use compression but disable chunking:

```
    const runtimeOptions: IContainerRuntimeOptions = {
        chunkSizeInBytes: Number.POSITIVE_INFINITY,
    }
```

To disable compression (will also disable chunking, as chunking works only for compressed batches):

```
    const runtimeOptions: IContainerRuntimeOptions = {
        compressionOptions: {
            minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
            compressionAlgorithm: CompressionAlgorithms.lz4,
        },
    }
```

To enable grouped batching:

```
    const runtimeOptions: IContainerRuntimeOptions = {
        enableGroupedBatching: true,
    }
```

## How it works

Compression currently works as a runtime layer over the regular op sending/receiving pipeline.

If we have a batch with a size larger than the configured minimum required for compression (in the example let’s say it’s 850 bytes), as following:

```
+-----------+-----------+-----------+-----------+
| Op 1      | Op 2      | Op 3      | Op 4      |
| SeqNum: 1 | SeqNum: 2 | SeqNum: 3 | SeqNum: 4 |
| Size: 100 | Size: 150 | Size: 200 | Size: 400 |
+-----------+-----------+-----------+-----------+
```

The total size of the batch is 850 bytes. The client which needs to send the batch would compress the batch to a smaller size (200 bytes) and will send a new batch like the following:

```
+--------------------+-----------+-----------+-----------+
| Op 1               | Op 2      | Op 3      | Op 4      |
| SeqNum: 1          | SeqNum: 2 | SeqNum: 3 | SeqNum: 4 |
| Size: 200          | Size: 0   | Size: 0   | Size: 0   |
| Compression: 'lz4' |           |           |           |
+--------------------+-----------+-----------+-----------+
```

The first op in the batch is the only one with content (which is opaque due to it being compressed), the rest of the ops serve only to reserve the sequence numbers so that the state machine which rebuilds the original batch on the receiving client can reconstruct the original batch.

When the batch is received by a client, it will detect the first op as being compressed, it will decompress it and store it in memory. For each empty op subsequently received, it will fetch the uncompressed content from memory and rebuild the original ops. The original ops are then processed by the runtime and applied accordingly.
So, compression virtualizes the batch.

After compression, the first op in the batch can exceed 1MB, therefore it would still be rejected. In this case, another layer of virtualization is added after compression (and before decompression, symmetrically on the receiving end).

The first op in the compressed batch can be chunked into smaller ops which can be sent outside the original batch. However, to conveniently maintain the batch semantics, the last chunk (the chunk which triggers rebuilding the original op) is the first op in the new batch.

To illustrate, let’s take the large batch below:

```
+--------------------+-----------+-----------+-----------+
| Op 1               | Op 2      | Op 3      | Op 4      |
| SeqNum: 1          | SeqNum: 2 | SeqNum: 3 | SeqNum: 4 |
| Size: 900          | Size: 0   | Size: 0   | Size: 0   |
| Compression: 'lz4' |           |           |           |
+--------------------+-----------+-----------+-----------+
```

This will produce the following batches:

```
+-----------+
| Chunk 1/3 |
| SeqNum: 1 |
| Size: 300 |
+-----------+

```

```
+-----------+
| Chunk 2/3 |
| SeqNum: 2 |
| Size: 300 |
+-----------+

```

```
+-----------+-----------+-----------+-----------+
| Chunk 3/3 | Op 2      | Op 3      | Op 4      |
| SeqNum: 3 | SeqNum: 4 | SeqNum: 5 | SeqNum: 6 |
| Size: 300 | Size: 0   | Size: 0   | Size: 0   |
+-----------+-----------+-----------+-----------+
```

The first 2 chunks are sent in their own batches, while the last chunk is the first op in the last batch which contains the ops reserving the required sequence numbers.

Notice that the sequence numbers don’t matter here, as all ops will be based off the same reference sequence number, so the sequence number will be recalculated for all, without additional work.

Additionally, as compression preserves the original uncompressed batch layout in terms of the number of ops by using empty ops to reserve the sequence numbers, this ensures that the clients will always receive the exact count of ops to rebuild the uncompressed batch sequentially.

On the receiving end, the client will accumulate chunks 1 and 2 and keep them in memory. When chunk 3 is received, the original large, decompressed op will be rebuilt, and the runtime will then process the batch as if it is a compressed batch.

## How grouped batching works

**Note: There are plans to replace empty ops with something more efficient when doing grouped batching AB#4092**

Given the following baseline batch:

```
+---------------+---------------+---------------+---------------+---------------+
| Op 1          | Op 2          | Op 3          | Op 4          | Op 5          |
| Contents: "a" | Contents: "b" | Contents: "c" | Contents: "d" | Contents: "e" |
+---------------+---------------+---------------+---------------+---------------+
```

Compressed batch:

```
+--------------------+-----------------+-----------------+-----------------+-----------------+
| Op 1               | Op 2            | Op 3            | Op 4            | Op 5            |
| Contents: "abcde"  | Contents: empty | Contents: empty | Contents: empty | Contents: empty |
| Compression: 'lz4' |                 |                 |                 |                 |
+--------------------+-----------------+-----------------+-----------------+-----------------+
```

Grouped batch:

```
+---------------------------------------------------------------------------------------------------------------------------------+
| Op 1                   Contents: +--------------------+-----------------+-----------------+-----------------+-----------------+ |
| SeqNum: 1                        | Op 1               | Op 2            | Op 3            | Op 4            | Op 5            | |
| Type: "groupedBatch"             | Contents: "abcde"  | Contents: empty | Contents: empty | Contents: empty | Contents: empty | |
|                                  | Compression: 'lz4' |                 |                 |                 |                 | |
|                                  +--------------------+-----------------+-----------------+-----------------+-----------------+ |
+---------------------------------------------------------------------------------------------------------------------------------+
```

Can produce the following chunks:

```
+-------------------------------------------------+
| Chunk 1/2    Contents: +----------------------+ |
| SeqNum: 1              |  +-----------------+ | |
|                        |  | Contents: "abc" | | |
|                        |  +-----------------+ | |
|                        +----------------------+ |
+-------------------------------------------------+
```

```
+--------------------------------------------------------------------------------------------------------------------------+
| Chunk 2/2    Contents: +---------------------------------------------------------------------------------------------+ | |
| SeqNum: 2              |  +----------------+-----------------+-----------------+-----------------+-----------------+ | | |
|                        |  | Contents: "de" | Contents: empty | Contents: empty | Contents: empty | Contents: empty | | | |
|                        |  +----------------+-----------------+-----------------+-----------------+-----------------+ | | |
|                        +---------------------------------------------------------------------------------------------+ | |
+--------------------------------------------------------------------------------------------------------------------------+
```

-   Send to service
-   Service acks ops sent
-   Receive chunks from service
-   Recompile to the grouped batch step

Ungrouped batch:

```
+--------------------+-----------------+-----------------+-----------------+-----------------+
| Op 1               | Op 2            | Op 3            | Op 4            | Op 5            |
| Contents: "abcde"  | Contents: empty | Contents: empty | Contents: empty | Contents: empty |
| SeqNum: 2          | SeqNum: 2       | SeqNum: 2       | SeqNum: 2       | SeqNum: 2       |
| ClientSeqNum: 1    | ClientSeqNum: 2 | ClientSeqNum: 3 | ClientSeqNum: 4 | ClientSeqNum: 5 |
| Compression: 'lz4' |                 |                 |                 |                 |
+--------------------+-----------------+-----------------+-----------------+-----------------+
```

Uncompressed batch:

```
+-----------------+-----------------+-----------------+-----------------+-----------------+
| Op 1            | Op 2            | Op 3            | Op 4            | Op 5            |
| Contents: "a"   | Contents: "b"   | Contents: "c"   | Contents: "d"   | Contents: "e"   |
| SeqNum: 2       | SeqNum: 2       | SeqNum: 2       | SeqNum: 2       | SeqNum: 2       |
| ClientSeqNum: 1 | ClientSeqNum: 2 | ClientSeqNum: 3 | ClientSeqNum: 4 | ClientSeqNum: 5 |
+-----------------+-----------------+-----------------+-----------------+-----------------+
```
