# Configs and feature gates for solving the 1MB limit.

## Introduction

There is a current limitation regarding the size of the payload a Fluid client can send and receive. [The limit is 1MB per payload](https://github.com/microsoft/FluidFramework/issues/9023) and it is currently enforced explicitly with the `BatchTooLarge` error which closes the container.

Version `client_v2.0.0-internal.2.3.0` introduces two features which can be used to work around this size limit, batch compression and compressed batch chunking. This document describes the prerequisites for safely leveraging the features, how to enable/disable them and a brief description of how they work.

**The features are still considered experimental and for safety and back-compat reasons they are disabled by default.**

## Table of contents

-   [Introduction](#introduction)
    -   [Prerequisites](#prerequisites)
        -   [Update to the required Fluid version](#update-to-the-required-fluid-version)
        -   [Ensure there is full saturation for the deployment of the Fluid version containing compression and chunking.](#ensure-there-is-full-saturation-for-the-deployment-of-the-fluid-version-containing-compression-and-chunking)
    -   [Enabling compression](#enabling-compression)
    -   [Enabling chunking for compression](#enabling-chunking-for-compression)
    -   [Disabling in case of emergency](#disabling-in-case-of-emergency)
    -   [Example configs](#example-configs)
    -   [How it works](#how-it-works)

## Prerequisites

### Update to the required Fluid version

`client_v2.0.0-internal.2.3.0` is the minimum version which contains compression and chunking.

### Ensure there is full saturation for the deployment of the Fluid version containing compression and chunking.

Compression and chunking create new types of ops which cannot be handled by older versions of the runtime. If the runtime is not able to process an op, it will close with a `DataProcessingError` with assert code `0x3ce` ("Runtime message of unknown type"). Therefore, it is important that all clients in the target distribution are on at least version `client_v2.0.0-internal.2.3.0` before enabling compression. Any client which can open a document that was created with compression must be on at least version `client_v2.0.0-internal.2.3.0` to be able to open it correctly.

## Enabling compression

**Compression targets payloads which exceed the max batch size (1MB) and it is disabled by default.** To enable compression, use the `IContainerRuntimeOptions.compressionOptions` property, of type `ICompressionRuntimeOptions`.

`ICompressionRuntimeOptions` has two properties:

-   `minimumBatchSizeInBytes` – the minimum size of the batch for which compression should kick in. If the payload is too small, compression may not yield too many benefits. To target the original 1MB issue, a good value here would be to match the default maxBatchSizeInBytes (972800), however, experimentally, a good lower value could be at around 614400 bytes.
-   `compressionAlgorithm` – currently, only `lz4` is supported.

## Enabling chunking for compression

**Op chunking for compression targets payloads which exceed the max batch size (1MB) after compression.** So, only payloads which are already compressed. By default, the feature is disabled.

To enable, use the `IContainerRuntimeOptions.chunkSizeInBytes` property, which represents the size of the chunked ops, when chunking is necessary. When chunking is performed, the large op is split into smaller ops (chunks). This config represents the size of the chunks. The value enables a trade-off between large chunks / few ops and small chunks / many ops. A good value for this would be at around 614400.

This config would govern chunking compressed batches only. We will not be enabling chunking across all types of ops/batches but **only when compression is enabled and when the batch is compressed**, and its payload size is more than `maxBatchSizeInBytes`. Therefore, for this feature to be working, it is required that compression is enabled using `IContainerRuntimeOptions.compressionOptions`.

## Disabling in case of emergency

If the features are enabled using the configs, they can be disabled at runtime via feature gates as following:

-   `Fluid.ContainerRuntime.DisableCompression` - if set to true, will disable compression (this has a side effect of also disabling chunking, as chunking is invoked only for compressed payloads).
-   `Fluid.ContainerRuntime.DisableCompressionChunking` - if set to true, will disable chunking for compression.

## Example configs

Enable only compression:

```
    const runtimeOptions: IContainerRuntimeOptions = {
        compressionOptions: {
            minimumBatchSizeInBytes: 614400,
            compressionAlgorithm: CompressionAlgorithms.lz4,
        },
    }
```

Enable compression and chunking:

```
    const runtimeOptions: IContainerRuntimeOptions = {
        compressionOptions: {
            minimumBatchSizeInBytes: 614400,
            compressionAlgorithm: CompressionAlgorithms.lz4,
        },
        chunkSizeInBytes: 614400,
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

The first 2 chunks are sent in their own batches, while the last chunk is the first op in the last batch which contains the ops reserving the required sequence numbers:

Notice that the sequence numbers don’t matter here, as all ops will be based off the same reference sequence number, so the sequence number will be recalculated for all, without additional work.

Additionally, as compression preserves the original uncompressed batch layout in terms of the number of ops by using empty ops to reserve the sequence numbers, this ensures that the clients will always receive the exact count of ops to rebuild the uncompressed batch sequentially.

On the receiving end, the client will accumulate chunks 1 and 2 and keep them in memory. When chunk 3 is received, the original large, decompressed op will be rebuilt, and the runtime will then process the batch as if it is a compressed batch.
