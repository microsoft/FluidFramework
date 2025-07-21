/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICompressionRuntimeOptions } from "./compressionDefinitions.js";
import type { FlushMode } from "./dataStoreContext.js";
import type { IGCRuntimeOptions } from "./gcRuntimeOptions.js";
import type { IdCompressorMode } from "./idCompressorDefinitions.js";
import type { ISummaryConfiguration } from "./summaryConfiguration.js";

/**
 * @legacy
 * @alpha
 */
export interface ISummaryRuntimeOptions {
	/**
	 * Override summary configurations set by the server.
	 */
	summaryConfigOverrides?: ISummaryConfiguration;

	/**
	 * Delay before first attempt to spawn summarizing container.
	 *
	 * @deprecated Use {@link ISummaryRuntimeOptions.summaryConfigOverrides}'s
	 * {@link ISummaryBaseConfiguration.initialSummarizerDelayMs} instead.
	 */
	initialSummarizerDelayMs?: number;
}

/**
 * Full set of options for container runtime as "required".
 *
 * @remarks
 * {@link IContainerRuntimeOptions} is expected to be used by consumers.
 *
 * @privateRemarks If any new properties are added to this interface (or
 * {@link IContainerRuntimeOptionsInternal}), then we will also need to make
 * changes in {@link file://./compatUtils.ts}.
 * If the new property does not change the DocumentSchema, then it must be
 * explicity omitted from {@link RuntimeOptionsAffectingDocSchema}.
 * If it does change the DocumentSchema, then a corresponding entry must be
 * added to `runtimeOptionsAffectingDocSchemaConfigMap` with the appropriate
 * compat configuration info.
 * If neither of the above is done, then the build will fail to compile.
 *
 * @legacy
 * @alpha
 */
export interface ContainerRuntimeOptions {
	readonly summaryOptions: ISummaryRuntimeOptions;
	readonly gcOptions: IGCRuntimeOptions;
	/**
	 * Affects the behavior while loading the runtime when the data verification check which
	 * compares the DeltaManager sequence number (obtained from protocol in summary) to the
	 * runtime sequence number (obtained from runtime metadata in summary) finds a mismatch.
	 * 1. "close" (default) will close the container with an assertion.
	 * 2. "log" will log an error event to telemetry, but still continue to load.
	 * 3. "bypass" will skip the check entirely. This is not recommended.
	 */
	readonly loadSequenceNumberVerification: "close" | "log" | "bypass";

	/**
	 * Enables the runtime to compress ops. See {@link ICompressionRuntimeOptions}.
	 */
	readonly compressionOptions: ICompressionRuntimeOptions;
	/**
	 * If specified, when in FlushMode.TurnBased, if the size of the ops between JS turns exceeds this value,
	 * an error will be thrown and the container will close.
	 *
	 * If unspecified, the limit is 700Kb.
	 *
	 * 'Infinity' will disable any limit.
	 *
	 * @experimental This config should be driven by the connection with the service and will be moved in the future.
	 */
	readonly maxBatchSizeInBytes: number;
	/**
	 * If the op payload needs to be chunked in order to work around the maximum size of the batch, this value represents
	 * how large the individual chunks will be. This is only supported when compression is enabled. If after compression, the
	 * batch content size exceeds this value, it will be chunked into smaller ops of this exact size.
	 *
	 * This value is a trade-off between having many small chunks vs fewer larger chunks and by default, the runtime is configured to use
	 * 200 * 1024 = 204800 bytes. This default value ensures that no compressed payload's content is able to exceed {@link ContainerRuntimeOptions.maxBatchSizeInBytes}
	 * regardless of the overhead of an individual op.
	 *
	 * Any value of `chunkSizeInBytes` exceeding {@link ContainerRuntimeOptions.maxBatchSizeInBytes} will disable this feature, therefore if a compressed batch's content
	 * size exceeds {@link ContainerRuntimeOptions.maxBatchSizeInBytes} after compression, the container will close with an instance of `DataProcessingError` with
	 * the `BatchTooLarge` message.
	 */
	readonly chunkSizeInBytes: number;

	/**
	 * Enable the IdCompressor in the runtime.
	 * @experimental Not ready for use.
	 */
	readonly enableRuntimeIdCompressor: IdCompressorMode;

	/**
	 * If enabled, the runtime will group messages within a batch into a single
	 * message to be sent to the service.
	 * The grouping and ungrouping of such messages is handled by the "OpGroupingManager".
	 *
	 * By default, the feature is enabled. This feature can only be disabled when compression is also disabled.
	 * @deprecated  The ability to disable Grouped Batching is deprecated and will be removed in a future release. This feature is required for the proper functioning of the Fluid Framework.
	 */
	readonly enableGroupedBatching: boolean;

	/**
	 * When this property is set to true, it requires runtime to control is document schema properly through ops
	 * The benefit of this mode is that clients who do not understand schema will fail in predictable way, with predictable message,
	 * and will not attempt to limp along, which could cause data corruptions and crashes in random places.
	 * When this property is not set (or set to false), runtime operates in legacy mode, where new features (modifying document schema)
	 * are engaged as they become available, without giving legacy clients any chance to fail predictably.
	 */
	readonly explicitSchemaControl: boolean;

	/**
	 * Create blob handles with pending payloads when calling createBlob (default is `undefined` (disabled)).
	 * When enabled (`true`), createBlob will return a handle before the blob upload completes.
	 */
	readonly createBlobPayloadPending: true | undefined;
}

/**
 * Options for container runtime.
 *
 * @legacy
 * @alpha
 */
export type IContainerRuntimeOptions = Partial<ContainerRuntimeOptions>;

/**
 * Internal extension of {@link IContainerRuntimeOptions}
 *
 * @internal
 */
export type IContainerRuntimeOptionsInternal = Partial<ContainerRuntimeOptionsInternal>;

/**
 * Internal extension of {@link ContainerRuntimeOptions}
 *
 * @privateRemarks
 * These options are not available to consumers when creating a new container runtime,
 * but we do need to expose them for internal use, e.g. when configuring the container runtime
 * to ensure compatibility with older versions.
 *
 * This is defined as a fully required set of options as this package does not yet
 * use `exactOptionalPropertyTypes` and `Required<>` applied to optional type allowing
 * `undefined` like {@link IdCompressorMode} will exclude `undefined`.
 *
 * @internal
 */
export interface ContainerRuntimeOptionsInternal extends ContainerRuntimeOptions {
	/**
	 * Sets the flush mode for the runtime. In Immediate flush mode the runtime will immediately
	 * send all operations to the driver layer, while in TurnBased the operations will be buffered
	 * and then sent them as a single batch at the end of the turn.
	 * By default, flush mode is TurnBased.
	 */
	readonly flushMode: FlushMode;

	/**
	 * Allows Grouped Batching to be disabled by setting to false (default is true).
	 * In that case, batched messages will be sent individually (but still all at the same time).
	 */
	readonly enableGroupedBatching: boolean;
}
