/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Trace, TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	AttachState,
	IAudience,
	ISelf,
	ICriticalContainerError,
	type IAudienceEvents,
} from "@fluidframework/container-definitions";
import {
	IBatchMessage,
	IContainerContext,
	IGetPendingLocalStateProps,
	ILoader,
	IRuntime,
	LoaderHeader,
	IDeltaManager,
} from "@fluidframework/container-definitions/internal";
import {
	IContainerRuntime,
	IContainerRuntimeEvents,
} from "@fluidframework/container-runtime-definitions/internal";
import {
	FluidObject,
	IFluidHandle,
	IRequest,
	IResponse,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import {
	IFluidHandleContext,
	type IFluidHandleInternal,
	IProvideFluidHandleContext,
} from "@fluidframework/core-interfaces/internal";
import { ISignalEnvelope } from "@fluidframework/core-interfaces/internal";
import {
	assert,
	Deferred,
	LazyPromise,
	PromiseCache,
	delay,
} from "@fluidframework/core-utils/internal";
import {
	IClientDetails,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISignalMessage,
	ISummaryTree,
	SummaryType,
} from "@fluidframework/driver-definitions";
import {
	DriverHeader,
	FetchSource,
	IDocumentStorageService,
	type ISnapshot,
	IDocumentMessage,
	ISnapshotTree,
	ISummaryContent,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type {
	IIdCompressorCore,
	IdCreationRange,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
} from "@fluidframework/id-compressor/internal";
import {
	ISummaryTreeWithStats,
	ITelemetryContext,
	IGarbageCollectionData,
	CreateChildSummarizerNodeParam,
	FlushMode,
	FlushModeExperimental,
	IDataStore,
	IEnvelope,
	IFluidDataStoreContextDetached,
	IFluidDataStoreRegistry,
	ISummarizeInternalResult,
	InboundAttachMessage,
	NamedFluidDataStoreRegistryEntries,
	SummarizeInternalFn,
	channelsTreeName,
	gcTreeKey,
	IInboundSignalMessage,
} from "@fluidframework/runtime-definitions/internal";
import {
	GCDataBuilder,
	ReadAndParseBlob,
	RequestParser,
	TelemetryContext,
	addBlobToSummary,
	addSummarizeResultToSummary,
	calculateStats,
	create404Response,
	exceptionToResponse,
	responseToException,
	seqFromTree,
} from "@fluidframework/runtime-utils/internal";
import type { ITelemetryGenericEventExt } from "@fluidframework/telemetry-utils/internal";
import {
	ITelemetryLoggerExt,
	DataCorruptionError,
	DataProcessingError,
	GenericError,
	IEventSampler,
	LoggingError,
	MonitoringContext,
	PerformanceEvent,
	// eslint-disable-next-line import/no-deprecated
	TaggedLoggerAdapter,
	UsageError,
	createChildLogger,
	createChildMonitoringContext,
	createSampledLogger,
	loggerToMonitoringContext,
	raiseConnectedEvent,
	wrapError,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { BindBatchTracker } from "./batchTracker.js";
import { BlobManager, IBlobManagerLoadInfo, IPendingBlobs } from "./blobManager.js";
import { ChannelCollection, getSummaryForDatastores, wrapContext } from "./channelCollection.js";
import { IPerfSignalReport, ReportOpPerfTelemetry } from "./connectionTelemetry.js";
import { ContainerFluidHandleContext } from "./containerHandleContext.js";
import { channelToDataStore } from "./dataStore.js";
import { FluidDataStoreRegistry } from "./dataStoreRegistry.js";
import { DeltaManagerPendingOpsProxy, DeltaManagerSummarizerProxy } from "./deltaManagerProxies.js";
import {
	GCNodeType,
	GarbageCollector,
	IGCRuntimeOptions,
	IGCStats,
	IGarbageCollector,
	gcGenerationOptionName,
} from "./gc/index.js";
import {
	ContainerMessageType,
	type ContainerRuntimeDocumentSchemaMessage,
	ContainerRuntimeGCMessage,
	type ContainerRuntimeIdAllocationMessage,
	type InboundSequencedContainerRuntimeMessage,
	type InboundSequencedContainerRuntimeMessageOrSystemMessage,
	type LocalContainerRuntimeMessage,
	type OutboundContainerRuntimeMessage,
	type UnknownContainerRuntimeMessage,
} from "./messageTypes.js";
import { IBatchMetadata, ISavedOpMetadata } from "./metadata.js";
import {
	BatchMessage,
	IBatch,
	IBatchCheckpoint,
	OpCompressor,
	OpDecompressor,
	OpGroupingManager,
	OpSplitter,
	Outbox,
	RemoteMessageProcessor,
} from "./opLifecycle/index.js";
import { pkgVersion } from "./packageVersion.js";
import {
	IPendingBatchMessage,
	IPendingLocalState,
	PendingStateManager,
} from "./pendingStateManager.js";
import { ScheduleManager } from "./scheduleManager.js";
import {
	DocumentsSchemaController,
	EnqueueSummarizeResult,
	IBaseSummarizeResult,
	IConnectableRuntime,
	IContainerRuntimeMetadata,
	ICreateContainerMetadata,
	type IDocumentSchemaCurrent,
	IEnqueueSummarizeOptions,
	IGenerateSummaryTreeResult,
	IGeneratedSummaryStats,
	IOnDemandSummarizeOptions,
	IRefreshSummaryAckOptions,
	IRootSummarizerNodeWithGC,
	ISerializedElection,
	ISubmitSummaryOptions,
	ISummarizeResults,
	ISummarizer,
	ISummarizerEvents,
	ISummarizerInternalsProvider,
	ISummarizerRuntime,
	ISummaryMetadataMessage,
	IdCompressorMode,
	OrderedClientCollection,
	OrderedClientElection,
	RetriableSummaryError,
	RunWhileConnectedCoordinator,
	SubmitSummaryResult,
	Summarizer,
	SummarizerClientElection,
	SummaryCollection,
	SummaryManager,
	aliasBlobName,
	blobsTreeName,
	chunksBlobName,
	createRootSummarizerNodeWithGC,
	electedSummarizerBlobName,
	extractSummaryMetadataMessage,
	idCompressorBlobName,
	metadataBlobName,
	rootHasIsolatedChannels,
	summarizerClientType,
	wrapSummaryInChannelsTree,
} from "./summary/index.js";
import { Throttler, formExponentialFn } from "./throttler.js";

/**
 * Utility to implement compat behaviors given an unknown message type
 * The parameters are typed to support compile-time enforcement of handling all known types/behaviors
 *
 * @param _unknownContainerRuntimeMessageType - Typed as something unexpected, to ensure all known types have been
 * handled before calling this function (e.g. in a switch statement).
 * @param compatBehavior - Typed redundantly with CompatModeBehavior to ensure handling is added when updating that type
 */
function compatBehaviorAllowsMessageType(
	_unknownContainerRuntimeMessageType: UnknownContainerRuntimeMessage["type"],
	compatBehavior: "Ignore" | "FailToProcess" | undefined,
): boolean {
	// undefined defaults to same behavior as "FailToProcess"
	return compatBehavior === "Ignore";
}

/**
 * @alpha
 */
export interface ISummaryBaseConfiguration {
	/**
	 * Delay before first attempt to spawn summarizing container.
	 */
	initialSummarizerDelayMs: number;

	/**
	 * Defines the maximum allowed time to wait for a pending summary ack.
	 * The maximum amount of time client will wait for a summarize is the minimum of
	 * maxSummarizeAckWaitTime (currently 3 * 60 * 1000) and maxAckWaitTime.
	 */
	maxAckWaitTime: number;
	/**
	 * Defines the maximum number of Ops in between Summaries that can be
	 * allowed before forcibly electing a new summarizer client.
	 */
	maxOpsSinceLastSummary: number;
}

/**
 * @alpha
 */
export interface ISummaryConfigurationHeuristics extends ISummaryBaseConfiguration {
	state: "enabled";
	/**
	 * Defines the maximum allowed time, since the last received Ack, before running the summary
	 * with reason maxTime.
	 * For example, say we receive ops one by one just before the idle time is triggered.
	 * In this case, we still want to run a summary since it's been a while since the last summary.
	 */
	maxTime: number;
	/**
	 * Defines the maximum number of Ops, since the last received Ack, that can be allowed
	 * before running the summary with reason maxOps.
	 */
	maxOps: number;
	/**
	 * Defines the minimum number of Ops, since the last received Ack, that can be allowed
	 * before running the last summary.
	 */
	minOpsForLastSummaryAttempt: number;
	/**
	 * Defines the lower boundary for the allowed time in between summarizations.
	 * Pairs with maxIdleTime to form a range.
	 * For example, if we only receive 1 op, we don't want to have the same idle time as say 100 ops.
	 * Based on the boundaries we set in minIdleTime and maxIdleTime, the idle time will change
	 * linearly depending on the number of ops we receive.
	 */
	minIdleTime: number;
	/**
	 * Defines the upper boundary for the allowed time in between summarizations.
	 * Pairs with minIdleTime to form a range.
	 * For example, if we only receive 1 op, we don't want to have the same idle time as say 100 ops.
	 * Based on the boundaries we set in minIdleTime and maxIdleTime, the idle time will change
	 * linearly depending on the number of ops we receive.
	 */
	maxIdleTime: number;
	/**
	 * Runtime op weight to use in heuristic summarizing.
	 * This number is a multiplier on the number of runtime ops we process when running summarize heuristics.
	 * For example: (multiplier) * (number of runtime ops) = weighted number of runtime ops
	 */
	runtimeOpWeight: number;
	/**
	 * Non-runtime op weight to use in heuristic summarizing
	 * This number is a multiplier on the number of non-runtime ops we process when running summarize heuristics.
	 * For example: (multiplier) * (number of non-runtime ops) = weighted number of non-runtime ops
	 */
	nonRuntimeOpWeight: number;

	/**
	 * Number of ops since last summary needed before a non-runtime op can trigger running summary heuristics.
	 *
	 * Note: Any runtime ops sent before the threshold is reached will trigger heuristics normally.
	 * This threshold ONLY applies to non-runtime ops triggering summaries.
	 *
	 * For example: Say the threshold is 20. Sending 19 non-runtime ops will not trigger any heuristic checks.
	 * Sending the 20th non-runtime op will trigger the heuristic checks for summarizing.
	 */
	nonRuntimeHeuristicThreshold?: number;
}

/**
 * @alpha
 */
export interface ISummaryConfigurationDisableSummarizer {
	state: "disabled";
}

/**
 * @alpha
 */
export interface ISummaryConfigurationDisableHeuristics extends ISummaryBaseConfiguration {
	state: "disableHeuristics";
}

/**
 * @alpha
 */
export type ISummaryConfiguration =
	| ISummaryConfigurationDisableSummarizer
	| ISummaryConfigurationDisableHeuristics
	| ISummaryConfigurationHeuristics;

/**
 * @alpha
 */
export const DefaultSummaryConfiguration: ISummaryConfiguration = {
	state: "enabled",

	minIdleTime: 0,

	maxIdleTime: 30 * 1000, // 30 secs.

	maxTime: 60 * 1000, // 1 min.

	maxOps: 100, // Summarize if 100 weighted ops received since last snapshot.

	minOpsForLastSummaryAttempt: 10,

	maxAckWaitTime: 3 * 60 * 1000, // 3 mins.

	maxOpsSinceLastSummary: 7000,

	initialSummarizerDelayMs: 5 * 1000, // 5 secs.

	nonRuntimeOpWeight: 0.1,

	runtimeOpWeight: 1.0,

	nonRuntimeHeuristicThreshold: 20,
};

/**
 * @alpha
 */
export interface ISummaryRuntimeOptions {
	/** Override summary configurations set by the server. */
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
 * Options for op compression.
 * @alpha
 */
export interface ICompressionRuntimeOptions {
	/**
	 * The value the batch's content size must exceed for the batch to be compressed.
	 * By default the value is 600 * 1024 = 614400 bytes. If the value is set to `Infinity`, compression will be disabled.
	 */
	readonly minimumBatchSizeInBytes: number;

	/**
	 * The compression algorithm that will be used to compress the op.
	 * By default the value is `lz4` which is the only compression algorithm currently supported.
	 */
	readonly compressionAlgorithm: CompressionAlgorithms;
}

/**
 * Options for container runtime.
 * @alpha
 */
export interface IContainerRuntimeOptions {
	readonly summaryOptions?: ISummaryRuntimeOptions;
	readonly gcOptions?: IGCRuntimeOptions;
	/**
	 * Affects the behavior while loading the runtime when the data verification check which
	 * compares the DeltaManager sequence number (obtained from protocol in summary) to the
	 * runtime sequence number (obtained from runtime metadata in summary) finds a mismatch.
	 * 1. "close" (default) will close the container with an assertion.
	 * 2. "log" will log an error event to telemetry, but still continue to load.
	 * 3. "bypass" will skip the check entirely. This is not recommended.
	 */
	readonly loadSequenceNumberVerification?: "close" | "log" | "bypass";
	/**
	 * Sets the flush mode for the runtime. In Immediate flush mode the runtime will immediately
	 * send all operations to the driver layer, while in TurnBased the operations will be buffered
	 * and then sent them as a single batch at the end of the turn.
	 * By default, flush mode is TurnBased.
	 */
	readonly flushMode?: FlushMode;
	/**
	 * Enables the runtime to compress ops. See {@link ICompressionRuntimeOptions}.
	 */
	readonly compressionOptions?: ICompressionRuntimeOptions;
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
	readonly maxBatchSizeInBytes?: number;
	/**
	 * If the op payload needs to be chunked in order to work around the maximum size of the batch, this value represents
	 * how large the individual chunks will be. This is only supported when compression is enabled. If after compression, the
	 * batch content size exceeds this value, it will be chunked into smaller ops of this exact size.
	 *
	 * This value is a trade-off between having many small chunks vs fewer larger chunks and by default, the runtime is configured to use
	 * 200 * 1024 = 204800 bytes. This default value ensures that no compressed payload's content is able to exceed {@link IContainerRuntimeOptions.maxBatchSizeInBytes}
	 * regardless of the overhead of an individual op.
	 *
	 * Any value of `chunkSizeInBytes` exceeding {@link IContainerRuntimeOptions.maxBatchSizeInBytes} will disable this feature, therefore if a compressed batch's content
	 * size exceeds {@link IContainerRuntimeOptions.maxBatchSizeInBytes} after compression, the container will close with an instance of `GenericError` with
	 * the `BatchTooLarge` message.
	 */
	readonly chunkSizeInBytes?: number;

	/**
	 * Enable the IdCompressor in the runtime.
	 * @experimental Not ready for use.
	 */
	readonly enableRuntimeIdCompressor?: IdCompressorMode;

	/**
	 * If enabled, the runtime will group messages within a batch into a single
	 * message to be sent to the service.
	 * The grouping an ungrouping of such messages is handled by the "OpGroupingManager".
	 *
	 * By default, the feature is enabled.
	 */
	readonly enableGroupedBatching?: boolean;

	/**
	 * When this property is set to true, it requires runtime to control is document schema properly through ops
	 * The benefit of this mode is that clients who do not understand schema will fail in predictable way, with predictable message,
	 * and will not attempt to limp along, which could cause data corruptions and crashes in random places.
	 * When this property is not set (or set to false), runtime operates in legacy mode, where new features (modifying document schema)
	 * are engaged as they become available, without giving legacy clients any chance to fail predictably.
	 */
	readonly explicitSchemaControl?: boolean;
}

/**
 * Error responses when requesting a deleted object will have this header set to true
 * @alpha
 */
export const DeletedResponseHeaderKey = "wasDeleted";
/**
 * Tombstone error responses will have this header set to true
 * @alpha
 */
export const TombstoneResponseHeaderKey = "isTombstoned";
/**
 * Inactive error responses will have this header set to true
 * @alpha
 */
export const InactiveResponseHeaderKey = "isInactive";

/**
 * The full set of parsed header data that may be found on Runtime requests
 * @internal
 */
export interface RuntimeHeaderData {
	wait?: boolean;
	viaHandle?: boolean;
	allowTombstone?: boolean;
	allowInactive?: boolean;
}

/** Default values for Runtime Headers */
export const defaultRuntimeHeaderData: Required<RuntimeHeaderData> = {
	wait: true,
	viaHandle: false,
	allowTombstone: false,
	allowInactive: false,
};

/**
 * Available compression algorithms for op compression.
 * @alpha
 */
export enum CompressionAlgorithms {
	lz4 = "lz4",
}

/** @alpha */
export const disabledCompressionConfig: ICompressionRuntimeOptions = {
	minimumBatchSizeInBytes: Infinity,
	compressionAlgorithm: CompressionAlgorithms.lz4,
};

/**
 * @deprecated
 * Untagged logger is unsupported going forward. There are old loaders with old ContainerContexts that only
 * have the untagged logger, so to accommodate that scenario the below interface is used. It can be removed once
 * its usage is removed from TaggedLoggerAdapter fallback.
 */
interface OldContainerContextWithLogger extends Omit<IContainerContext, "taggedLogger"> {
	logger: ITelemetryBaseLogger;
	taggedLogger: undefined;
}

/**
 * State saved when the container closes, to be given back to a newly
 * instantiated runtime in a new instance of the container, so it can load to the
 * same state
 */
export interface IPendingRuntimeState {
	/**
	 * Pending ops from PendingStateManager
	 */
	pending?: IPendingLocalState;
	/**
	 * Pending blobs from BlobManager
	 */
	pendingAttachmentBlobs?: IPendingBlobs;
	/**
	 * Pending idCompressor state
	 */
	pendingIdCompressorState?: SerializedIdCompressorWithOngoingSession;

	/**
	 * Time at which session expiry timer started.
	 */
	sessionExpiryTimerStarted?: number | undefined;
}

const maxConsecutiveReconnectsKey = "Fluid.ContainerRuntime.MaxConsecutiveReconnects";

const defaultFlushMode = FlushMode.TurnBased;

// The actual limit is 1Mb (socket.io and Kafka limits)
// We can't estimate it fully, as we
// - do not know what properties relay service will add
// - we do not stringify final op, thus we do not know how much escaping will be added.
const defaultMaxBatchSizeInBytes = 700 * 1024;

const defaultCompressionConfig = {
	// Batches with content size exceeding this value will be compressed
	minimumBatchSizeInBytes: 614400,
	compressionAlgorithm: CompressionAlgorithms.lz4,
};

const defaultChunkSizeInBytes = 204800;

/** The default time to wait for pending ops to be processed during summarization */
export const defaultPendingOpsWaitTimeoutMs = 1000;
/** The default time to delay a summarization retry attempt when there are pending ops */
export const defaultPendingOpsRetryDelayMs = 1000;

/**
 * Instead of refreshing from latest because we do not have 100% confidence in the state
 * of the current system, we should close the summarizer and let it recover.
 * This delay's goal is to prevent tight restart loops
 */
const defaultCloseSummarizerDelayMs = 5000; // 5 seconds

/**
 * @deprecated please use version in driver-utils
 * @internal
 */
export function isRuntimeMessage(message: ISequencedDocumentMessage): boolean {
	return (Object.values(ContainerMessageType) as string[]).includes(message.type);
}

/**
 * Legacy ID for the built-in AgentScheduler.  To minimize disruption while removing it, retaining this as a
 * special-case for document dirty state.  Ultimately we should have no special-cases from the
 * ContainerRuntime's perspective.
 * @internal
 */
export const agentSchedulerId = "_scheduler";

// safely check navigator and get the hardware spec value
export function getDeviceSpec() {
	try {
		if (typeof navigator === "object" && navigator !== null) {
			return {
				deviceMemory: (navigator as any).deviceMemory,
				hardwareConcurrency: navigator.hardwareConcurrency,
			};
		}
	} catch {}
	return {};
}

/**
 * Older loader doesn't have a submitBatchFn member, this is the older way of submitting a batch.
 * Rather than exposing the submitFn (now deprecated) and IDeltaManager (dangerous to hand out) to the Outbox,
 * we can provide a partially-applied function to keep those items private to the ContainerRuntime.
 */
export const makeLegacySendBatchFn =
	(
		submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number,
		deltaManager: Pick<IDeltaManager<unknown, unknown>, "flush">,
	) =>
	(batch: IBatch) => {
		for (const message of batch.content) {
			submitFn(
				MessageType.Operation,
				// For back-compat (submitFn only works on deserialized content)
				message.contents === undefined ? undefined : JSON.parse(message.contents),
				true, // batch
				message.metadata,
			);
		}

		deltaManager.flush();
	};

/** Helper type for type constraints passed through several functions.
 * message - The unpacked message. Likely a TypedContainerRuntimeMessage, but could also be a system op
 * modernRuntimeMessage - Does this appear like a current TypedContainerRuntimeMessage?
 * local - Did this client send the op?
 */
type MessageWithContext =
	| {
			message: InboundSequencedContainerRuntimeMessage;
			modernRuntimeMessage: true;
			local: boolean;
			savedOp?: boolean;
	  }
	| {
			message: InboundSequencedContainerRuntimeMessageOrSystemMessage;
			modernRuntimeMessage: false;
			local: boolean;
			savedOp?: boolean;
	  };

const summarizerRequestUrl = "_summarizer";

/**
 * Create and retrieve the summmarizer
 */
async function createSummarizer(loader: ILoader, url: string): Promise<ISummarizer> {
	const request: IRequest = {
		headers: {
			[LoaderHeader.cache]: false,
			[LoaderHeader.clientDetails]: {
				capabilities: { interactive: false },
				type: summarizerClientType,
			},
			[DriverHeader.summarizingClient]: true,
			[LoaderHeader.reconnect]: false,
		},
		url,
	};

	const resolvedContainer = await loader.resolve(request);
	let fluidObject: FluidObject<ISummarizer> | undefined;

	// Older containers may not have the "getEntryPoint" API
	// ! This check will need to stay until LTS of loader moves past 2.0.0-internal.7.0.0
	if (resolvedContainer.getEntryPoint !== undefined) {
		fluidObject = await resolvedContainer.getEntryPoint();
	} else {
		const response = await (resolvedContainer as any).request({
			url: `/${summarizerRequestUrl}`,
		});
		if (response.status !== 200 || response.mimeType !== "fluid/object") {
			throw responseToException(response, request);
		}
		fluidObject = response.value;
	}

	if (fluidObject?.ISummarizer === undefined) {
		throw new UsageError("Fluid object does not implement ISummarizer");
	}
	return fluidObject.ISummarizer;
}

/**
 * Extract last message from the snapshot metadata.
 * Uses legacy property if not using explicit schema control, otherwise uses the new property.
 * This allows new runtime to make documents not openable for old runtimes, one explicit document schema control is enabled.
 * Please see addMetadataToSummary() as well
 */
function lastMessageFromMetadata(metadata: IContainerRuntimeMetadata | undefined) {
	return metadata?.documentSchema?.runtime?.explicitSchemaControl
		? metadata?.lastMessage
		: metadata?.message;
}

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 * It will define the store level mappings.
 * @alpha
 */
export class ContainerRuntime
	extends TypedEventEmitter<IContainerRuntimeEvents & ISummarizerEvents>
	implements
		IContainerRuntime,
		IRuntime,
		ISummarizerRuntime,
		ISummarizerInternalsProvider,
		IProvideFluidHandleContext
{
	/**
	 * Load the stores from a snapshot and returns the runtime.
	 * @param params - An object housing the runtime properties:
	 * - context - Context of the container.
	 * - registryEntries - Mapping from data store types to their corresponding factories.
	 * - existing - Pass 'true' if loading from an existing snapshot.
	 * - requestHandler - (optional) Request handler for the request() method of the container runtime.
	 * Only relevant for back-compat while we remove the request() method and move fully to entryPoint as the main pattern.
	 * - runtimeOptions - Additional options to be passed to the runtime
	 * - containerScope - runtime services provided with context
	 * - containerRuntimeCtor - Constructor to use to create the ContainerRuntime instance.
	 * This allows mixin classes to leverage this method to define their own async initializer.
	 * - provideEntryPoint - Promise that resolves to an object which will act as entryPoint for the Container.
	 * This object should provide all the functionality that the Container is expected to provide to the loader layer.
	 */
	public static async loadRuntime(params: {
		context: IContainerContext;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		existing: boolean;
		runtimeOptions?: IContainerRuntimeOptions;
		containerScope?: FluidObject;
		containerRuntimeCtor?: typeof ContainerRuntime;
		/** @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md */
		requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>;
		provideEntryPoint: (containerRuntime: IContainerRuntime) => Promise<FluidObject>;
	}): Promise<ContainerRuntime> {
		const {
			context,
			registryEntries,
			existing,
			requestHandler,
			provideEntryPoint,
			runtimeOptions = {} satisfies IContainerRuntimeOptions,
			containerScope = {},
			containerRuntimeCtor = ContainerRuntime,
		} = params;

		// If taggedLogger exists, use it. Otherwise, wrap the vanilla logger:
		// back-compat: Remove the TaggedLoggerAdapter fallback once all the host are using loader > 0.45
		const backCompatContext: IContainerContext | OldContainerContextWithLogger = context;
		const passLogger =
			backCompatContext.taggedLogger ??
			// eslint-disable-next-line import/no-deprecated
			new TaggedLoggerAdapter((backCompatContext as OldContainerContextWithLogger).logger);
		const logger = createChildLogger({
			logger: passLogger,
			properties: {
				all: {
					runtimeVersion: pkgVersion,
				},
			},
		});

		const mc = loggerToMonitoringContext(logger);

		const {
			summaryOptions = {},
			gcOptions = {},
			loadSequenceNumberVerification = "close",
			flushMode = defaultFlushMode,
			compressionOptions = defaultCompressionConfig,
			maxBatchSizeInBytes = defaultMaxBatchSizeInBytes,
			enableRuntimeIdCompressor,
			chunkSizeInBytes = defaultChunkSizeInBytes,
			enableGroupedBatching = true,
			explicitSchemaControl = false,
		} = runtimeOptions;

		const registry = new FluidDataStoreRegistry(registryEntries);

		const tryFetchBlob = async <T>(blobName: string): Promise<T | undefined> => {
			const blobId = context.baseSnapshot?.blobs[blobName];
			if (context.baseSnapshot && blobId) {
				// IContainerContext storage api return type still has undefined in 0.39 package version.
				// So once we release 0.40 container-defn package we can remove this check.
				assert(
					context.storage !== undefined,
					0x1f5 /* "Attached state should have storage" */,
				);
				return readAndParse<T>(context.storage, blobId);
			}
		};

		const [chunks, metadata, electedSummarizerData, aliases, serializedIdCompressor] =
			await Promise.all([
				tryFetchBlob<[string, string[]][]>(chunksBlobName),
				tryFetchBlob<IContainerRuntimeMetadata>(metadataBlobName),
				tryFetchBlob<ISerializedElection>(electedSummarizerBlobName),
				tryFetchBlob<[string, string][]>(aliasBlobName),
				tryFetchBlob<SerializedIdCompressorWithNoSession>(idCompressorBlobName),
			]);

		// read snapshot blobs needed for BlobManager to load
		const blobManagerSnapshot = await BlobManager.load(
			context.baseSnapshot?.trees[blobsTreeName],
			async (id) => {
				// IContainerContext storage api return type still has undefined in 0.39 package version.
				// So once we release 0.40 container-defn package we can remove this check.
				assert(
					context.storage !== undefined,
					0x256 /* "storage undefined in attached container" */,
				);
				return readAndParse(context.storage, id);
			},
		);

		const messageAtLastSummary = lastMessageFromMetadata(metadata);

		// Verify summary runtime sequence number matches protocol sequence number.
		const runtimeSequenceNumber = messageAtLastSummary?.sequenceNumber;
		const protocolSequenceNumber = context.deltaManager.initialSequenceNumber;
		// When we load with pending state, we reuse an old snapshot so we don't expect these numbers to match
		if (!context.pendingLocalState && runtimeSequenceNumber !== undefined) {
			// Unless bypass is explicitly set, then take action when sequence numbers mismatch.
			if (
				loadSequenceNumberVerification !== "bypass" &&
				runtimeSequenceNumber !== protocolSequenceNumber
			) {
				// Message to OCEs:
				// You can hit this error with runtimeSequenceNumber === -1 in < 2.0 RC3 builds.
				// This would indicate that explicit schema control is enabled in current (2.0 RC3+) builds and it
				// results in addMetadataToSummary() creating a poison pill for older runtimes in the form of a -1 sequence number.
				// Older runtimes do not understand new schema, and thus could corrupt document if they proceed, thus we are using
				// this poison pill to prevent them from proceeding.

				// "Load from summary, runtime metadata sequenceNumber !== initialSequenceNumber"
				const error = new DataCorruptionError(
					// pre-0.58 error message: SummaryMetadataMismatch
					"Summary metadata mismatch",
					{ runtimeVersion: pkgVersion, runtimeSequenceNumber, protocolSequenceNumber },
				);

				if (loadSequenceNumberVerification === "log") {
					logger.sendErrorEvent({ eventName: "SequenceNumberMismatch" }, error);
				} else {
					context.closeFn(error);
				}
			}
		}

		let desiredIdCompressorMode: IdCompressorMode;
		switch (mc.config.getBoolean("Fluid.ContainerRuntime.IdCompressorEnabled")) {
			case true:
				desiredIdCompressorMode = "on";
				break;
			case false:
				desiredIdCompressorMode = undefined;
				break;
			default:
				desiredIdCompressorMode = enableRuntimeIdCompressor;
				break;
		}

		// Enabling the IdCompressor is a one-way operation and we only want to
		// allow new containers to turn it on.
		let idCompressorMode: IdCompressorMode;
		if (existing) {
			// This setting has to be sticky for correctness:
			// 1) if compressior is OFF, it can't be enabled, as already running clients (in given document session) do not know
			//    how to process compressor ops
			// 2) if it's ON, then all sessions should load compressor right away
			// 3) Same logic applies for "delayed" mode
			// Maybe in the future we will need to enabled (and figure how to do it safely) "delayed" -> "on" change.
			// We could do "off" -> "on" transition too, if all clients start loading compressor (but not using it initially) and
			// do so for a while - this will allow clients to eventually disregard "off" setting (when it's safe so) and start
			// using compressor in future sessions.
			// Everyting is possible, but it needs to be designed and executed carefully, when such need arises.
			idCompressorMode = metadata?.documentSchema?.runtime
				?.idCompressorMode as IdCompressorMode;

			// This is the only exception to the rule above - we have proper plumbing to load ID compressor on schema change
			// event. It is loaded async (relative to op processing), so this conversion is only safe for off -> delayed conversion!
			// Clients do not expect ID compressor ops unless ID compressor is On for them, and that could be achieved only through
			// explicit schema change, i.e. only if explicitSchemaControl is on.
			// Note: it would be better if we throw on combination of options (explicitSchemaControl = off, desiredIdCompressorMode === "delayed")
			// that is not supported. But our service tests are oblivious to these problems and throwing here will cause a ton of failures
			// We ignored incompatible ID compressor changes from the start (they were sticky), so that's not a new problem being introduced...
			if (
				idCompressorMode === undefined &&
				desiredIdCompressorMode === "delayed" &&
				explicitSchemaControl
			) {
				idCompressorMode = desiredIdCompressorMode;
			}
		} else {
			idCompressorMode = desiredIdCompressorMode;
		}

		const createIdCompressorFn = async () => {
			const { createIdCompressor, deserializeIdCompressor, createSessionId } = await import(
				"@fluidframework/id-compressor/internal"
			);

			/**
			 * Because the IdCompressor emits so much telemetry, this function is used to sample
			 * approximately 5% of all clients. Only the given percentage of sessions will emit telemetry.
			 */
			const idCompressorEventSampler: IEventSampler = (() => {
				const isIdCompressorTelemetryEnabled = Math.random() < 0.05;
				return {
					sample: () => {
						return isIdCompressorTelemetryEnabled;
					},
				};
			})();

			const compressorLogger = createSampledLogger(logger, idCompressorEventSampler);
			const pendingLocalState = context.pendingLocalState as IPendingRuntimeState;

			if (pendingLocalState?.pendingIdCompressorState !== undefined) {
				return deserializeIdCompressor(
					pendingLocalState.pendingIdCompressorState,
					compressorLogger,
				);
			} else if (serializedIdCompressor !== undefined) {
				return deserializeIdCompressor(
					serializedIdCompressor,
					createSessionId(),
					compressorLogger,
				);
			} else {
				return createIdCompressor(compressorLogger);
			}
		};

		const disableCompression = mc.config.getBoolean(
			"Fluid.ContainerRuntime.CompressionDisabled",
		);
		const compressionLz4 =
			disableCompression !== true &&
			compressionOptions.minimumBatchSizeInBytes !== Infinity &&
			compressionOptions.compressionAlgorithm === "lz4";

		const documentSchemaController = new DocumentsSchemaController(
			existing,
			protocolSequenceNumber,
			metadata?.documentSchema,
			{
				explicitSchemaControl,
				compressionLz4,
				idCompressorMode,
				opGroupingEnabled: enableGroupedBatching,
				disallowedVersions: [],
			},
			(schema) => {
				runtime.onSchemaChange(schema);
			},
		);

		const featureGatesForTelemetry: Record<string, boolean | number | undefined> = {
			disableCompression,
		};

		const runtime = new containerRuntimeCtor(
			context,
			registry,
			metadata,
			electedSummarizerData,
			chunks ?? [],
			aliases ?? [],
			{
				summaryOptions,
				gcOptions,
				loadSequenceNumberVerification,
				flushMode,
				compressionOptions,
				maxBatchSizeInBytes,
				chunkSizeInBytes,
				// Requires<> drops undefined from IdCompressorType
				enableRuntimeIdCompressor: enableRuntimeIdCompressor as "on" | "delayed",
				enableGroupedBatching,
				explicitSchemaControl,
			},
			containerScope,
			logger,
			existing,
			blobManagerSnapshot,
			context.storage,
			createIdCompressorFn,
			documentSchemaController,
			featureGatesForTelemetry,
			provideEntryPoint,
			requestHandler,
			undefined, // summaryConfiguration
		);

		runtime.blobManager.trackPendingStashedUploads().then(
			() => {
				// make sure we didn't reconnect before the promise resolved
				if (runtime.delayConnectClientId !== undefined && !runtime.disposed) {
					runtime.delayConnectClientId = undefined;
					runtime.setConnectionStateCore(true, runtime.delayConnectClientId);
				}
			},
			(error) => runtime.closeFn(error),
		);

		// Apply stashed ops with a reference sequence number equal to the sequence number of the snapshot,
		// or zero. This must be done before Container replays saved ops.
		await runtime.pendingStateManager.applyStashedOpsAt(runtimeSequenceNumber ?? 0);

		// Initialize the base state of the runtime before it's returned.
		await runtime.initializeBaseState();

		return runtime;
	}

	public readonly options: Record<string | number, any>;
	private imminentClosure: boolean = false;

	private readonly _getClientId: () => string | undefined;
	public get clientId(): string | undefined {
		return this._getClientId();
	}

	public readonly clientDetails: IClientDetails;

	public get storage(): IDocumentStorageService {
		return this._storage;
	}

	public get containerRuntime() {
		return this;
	}

	private readonly submitFn: (
		type: MessageType,
		contents: any,
		batch: boolean,
		appData?: any,
	) => number;
	/**
	 * Although current IContainerContext guarantees submitBatchFn, it is not available on older loaders.
	 */
	private readonly submitBatchFn:
		| ((batch: IBatchMessage[], referenceSequenceNumber?: number) => number)
		| undefined;
	private readonly submitSummaryFn: (
		summaryOp: ISummaryContent,
		referenceSequenceNumber?: number,
	) => number;
	private readonly submitSignalFn: (content: ISignalEnvelope, targetClientId?: string) => void;
	public readonly disposeFn: (error?: ICriticalContainerError) => void;
	public readonly closeFn: (error?: ICriticalContainerError) => void;

	public get flushMode(): FlushMode {
		return this._flushMode;
	}

	public get scope(): FluidObject {
		return this.containerScope;
	}

	public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry {
		return this.registry;
	}

	private readonly _getAttachState: () => AttachState;
	public get attachState(): AttachState {
		return this._getAttachState();
	}

	/**
	 * Current session schema - defines what options are on & off.
	 * It's overlap of document schema (controlled by summary & ops) and options controlling this session.
	 * For example, document schema might have compression ON, but feature gates / runtime options turn it Off.
	 * In such case it will be off in session schema (i.e. this session should not use compression), but this client
	 * has to deal with compressed ops as other clients might send them.
	 * And in reverse, session schema can have compression Off, but feature gates / runtime options want it On.
	 * In such case it will be off in session schema, however this client will propose change to schema, and once / if
	 * this op rountrips, compression will be On. Client can't send compressed ops until it's change in schema.
	 */
	public get sessionSchema() {
		return this.documentsSchemaController.sessionSchema.runtime;
	}

	private _idCompressor: (IIdCompressor & IIdCompressorCore) | undefined;

	// We accumulate Id compressor Ops while Id compressor is not loaded yet (only for "delayed" mode)
	// Once it loads, it will process all such ops and we will stop accumulating further ops - ops will be processes as they come in.
	private pendingIdCompressorOps: IdCreationRange[] = [];

	// Id Compressor serializes final state (see getPendingLocalState()). As result, it needs to skip all ops that preceeded that state
	// (such ops will be marked by Loader layer as savedOp === true)
	// That said, in "delayed" mode it's possible that Id Compressor was never initialized before getPendingLocalState() is called.
	// In such case we have to process all ops, including those marked with savedOp === true.
	private readonly skipSavedCompressorOps: boolean;

	public get idCompressorMode() {
		return this.sessionSchema.idCompressorMode;
	}
	/**
	 * See IContainerRuntimeBase.idCompressor() for details.
	 */
	public get idCompressor() {
		// Expose ID Compressor only if it's On from the start.
		// If container uses delayed mode, then we can only expose generateDocumentUniqueId() and nothing else.
		// That's because any other usage will require immidiate loading of ID Compressor in next sessions in order
		// to reason over such things as session ID space.
		if (this.idCompressorMode === "on") {
			assert(
				this._idCompressor !== undefined,
				0x8ea /* compressor should have been loaded */,
			);
			return this._idCompressor;
		}
	}

	/**
	 * True if we have ID compressor loading in-flight (async operation). Useful only for
	 * this.idCompressorMode === "delayed" mode
	 */
	protected _loadIdCompressor: Promise<void> | undefined;

	/**
	 * See IContainerRuntimeBase.generateDocumentUniqueId() for details.
	 */
	public generateDocumentUniqueId() {
		return this._idCompressor?.generateDocumentUniqueId() ?? uuid();
	}

	public get IFluidHandleContext(): IFluidHandleContext {
		return this.handleContext;
	}
	private readonly handleContext: ContainerFluidHandleContext;

	/**
	 * This is a proxy to the delta manager provided by the container context (innerDeltaManager). It restricts certain
	 * accesses such as sets "read-only" mode for the summarizer client. This is the default delta manager that should
	 * be used unless the innerDeltaManager is required.
	 */
	public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	/**
	 * The delta manager provided by the container context. By default, using the default delta manager (proxy)
	 * should be sufficient. This should be used only if necessary. For example, for validating and propagating connected
	 * events which requires access to the actual real only info, this is needed.
	 */
	private readonly innerDeltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

	// internal logger for ContainerRuntime. Use this.logger for stores, summaries, etc.
	private readonly mc: MonitoringContext;

	private readonly summarizerClientElection?: SummarizerClientElection;
	/**
	 * summaryManager will only be created if this client is permitted to spawn a summarizing client
	 * It is created only by interactive client, i.e. summarizer client, as well as non-interactive bots
	 * do not create it (see SummarizerClientElection.clientDetailsPermitElection() for details)
	 */
	private readonly summaryManager?: SummaryManager;
	private readonly summaryCollection: SummaryCollection;

	private readonly summarizerNode: IRootSummarizerNodeWithGC;

	private readonly logger: ITelemetryLoggerExt;

	private readonly maxConsecutiveReconnects: number;
	private readonly defaultMaxConsecutiveReconnects = 7;

	private _orderSequentiallyCalls: number = 0;
	private readonly _flushMode: FlushMode;
	private flushTaskExists = false;

	private _connected: boolean;

	private consecutiveReconnects = 0;

	/**
	 * Used to delay transition to "connected" state while we upload
	 * attachment blobs that were added while disconnected
	 */
	private delayConnectClientId?: string;

	private ensureNoDataModelChangesCalls = 0;

	/**
	 * Invokes the given callback and expects that no ops are submitted
	 * until execution finishes. If an op is submitted, an error will be raised.
	 *
	 * Can be disabled by feature gate `Fluid.ContainerRuntime.DisableOpReentryCheck`
	 *
	 * @param callback - the callback to be invoked
	 */
	public ensureNoDataModelChanges<T>(callback: () => T): T {
		this.ensureNoDataModelChangesCalls++;
		try {
			return callback();
		} finally {
			this.ensureNoDataModelChangesCalls--;
		}
	}

	public get connected(): boolean {
		return this._connected;
	}

	/** clientId of parent (non-summarizing) container that owns summarizer container */
	public get summarizerClientId(): string | undefined {
		return this.summarizerClientElection?.electedClientId;
	}

	private _disposed = false;
	public get disposed() {
		return this._disposed;
	}

	private dirtyContainer: boolean;
	private emitDirtyDocumentEvent = true;
	private readonly disableAttachReorder: boolean | undefined;
	private readonly closeSummarizerDelayMs: number;
	private readonly defaultTelemetrySignalSampleCount = 100;
	private readonly _perfSignalData: IPerfSignalReport = {
		signalsLost: 0,
		signalSequenceNumber: 0,
		signalTimestamp: 0,
		trackingSignalSequenceNumber: undefined,
	};

	/**
	 * Summarizer is responsible for coordinating when to send generate and send summaries.
	 * It is the main entry point for summary work.
	 * It is created only by summarizing container (i.e. one with clientType === "summarizer")
	 */
	private readonly _summarizer?: Summarizer;
	private readonly scheduleManager: ScheduleManager;
	private readonly blobManager: BlobManager;
	private readonly pendingStateManager: PendingStateManager;
	private readonly outbox: Outbox;
	private readonly garbageCollector: IGarbageCollector;

	private readonly channelCollection: ChannelCollection;
	private readonly remoteMessageProcessor: RemoteMessageProcessor;

	/** The last message processed at the time of the last summary. */
	private messageAtLastSummary: ISummaryMetadataMessage | undefined;

	private get summarizer(): Summarizer {
		assert(this._summarizer !== undefined, 0x257 /* "This is not summarizing container" */);
		return this._summarizer;
	}

	private readonly summariesDisabled: boolean;
	private isSummariesDisabled(): boolean {
		return this.summaryConfiguration.state === "disabled";
	}

	private readonly maxOpsSinceLastSummary: number;
	private getMaxOpsSinceLastSummary(): number {
		return this.summaryConfiguration.state !== "disabled"
			? this.summaryConfiguration.maxOpsSinceLastSummary
			: 0;
	}

	private readonly initialSummarizerDelayMs: number;
	private getInitialSummarizerDelayMs(): number {
		// back-compat: initialSummarizerDelayMs was moved from ISummaryRuntimeOptions
		//   to ISummaryConfiguration in 0.60.
		if (this.runtimeOptions.summaryOptions.initialSummarizerDelayMs !== undefined) {
			return this.runtimeOptions.summaryOptions.initialSummarizerDelayMs;
		}
		return this.summaryConfiguration.state !== "disabled"
			? this.summaryConfiguration.initialSummarizerDelayMs
			: 0;
	}

	private readonly createContainerMetadata: ICreateContainerMetadata;
	/**
	 * The summary number of the next summary that will be generated for this container. This is incremented every time
	 * a summary is generated.
	 */
	private nextSummaryNumber: number;

	/** If false, loading or using a Tombstoned object should merely log, not fail */
	public get gcTombstoneEnforcementAllowed(): boolean {
		return this.garbageCollector.tombstoneEnforcementAllowed;
	}

	/** If true, throw an error when a tombstone data store is used. */
	public get gcThrowOnTombstoneUsage(): boolean {
		return this.garbageCollector.throwOnTombstoneUsage;
	}

	/**
	 * GUID to identify a document in telemetry
	 * ! Note: should not be used for anything other than telemetry and is not considered a stable GUID
	 */
	private readonly telemetryDocumentId: string;

	/**
	 * Whether this client is the summarizer client itself (type is summarizerClientType)
	 */
	private readonly isSummarizerClient: boolean;

	/**
	 * The id of the version used to initially load this runtime, or undefined if it's newly created.
	 */
	private readonly loadedFromVersionId: string | undefined;

	/**
	 * It a cache for holding mapping for loading groupIds with its snapshot from the service. Add expiry policy of 1 minute.
	 * Starting with 1 min and based on recorded usage we can tweak it later on.
	 */
	private readonly snapshotCacheForLoadingGroupIds = new PromiseCache<string, ISnapshot>({
		expiry: { policy: "absolute", durationMs: 60000 },
	});

	/***/
	protected constructor(
		context: IContainerContext,
		private readonly registry: IFluidDataStoreRegistry,
		private readonly metadata: IContainerRuntimeMetadata | undefined,
		electedSummarizerData: ISerializedElection | undefined,
		chunks: [string, string[]][],
		dataStoreAliasMap: [string, string][],
		private readonly runtimeOptions: Readonly<Required<IContainerRuntimeOptions>>,
		private readonly containerScope: FluidObject,
		// Create a custom ITelemetryBaseLogger to output telemetry events.
		public readonly baseLogger: ITelemetryBaseLogger,
		existing: boolean,
		blobManagerSnapshot: IBlobManagerLoadInfo,
		private readonly _storage: IDocumentStorageService,
		private readonly createIdCompressor: () => Promise<IIdCompressor & IIdCompressorCore>,
		private readonly documentsSchemaController: DocumentsSchemaController,
		featureGatesForTelemetry: Record<string, boolean | number | undefined>,
		provideEntryPoint: (containerRuntime: IContainerRuntime) => Promise<FluidObject>,
		private readonly requestHandler?: (
			request: IRequest,
			runtime: IContainerRuntime,
		) => Promise<IResponse>,
		private readonly summaryConfiguration: ISummaryConfiguration = {
			// the defaults
			...DefaultSummaryConfiguration,
			// the runtime configuration overrides
			...runtimeOptions.summaryOptions?.summaryConfigOverrides,
		},
	) {
		super();

		const {
			options,
			clientDetails,
			connected,
			baseSnapshot,
			submitFn,
			submitBatchFn,
			submitSummaryFn,
			submitSignalFn,
			disposeFn,
			closeFn,
			deltaManager,
			quorum,
			audience,
			loader,
			pendingLocalState,
			supportedFeatures,
			snapshotWithContents,
		} = context;

		this.logger = createChildLogger({ logger: this.baseLogger });
		this.mc = createChildMonitoringContext({
			logger: this.logger,
			namespace: "ContainerRuntime",
		});

		// If we support multiple algorithms in the future, then we would need to manage it here carefully.
		// We can use runtimeOptions.compressionOptions.compressionAlgorithm, but only if it's in the schema list!
		// If it's not in the list, then we will need to either use no compression, or fallback to some other (supported by format)
		// compression.
		const compressionOptions: ICompressionRuntimeOptions = {
			minimumBatchSizeInBytes: this.sessionSchema.compressionLz4
				? runtimeOptions.compressionOptions.minimumBatchSizeInBytes
				: Number.POSITIVE_INFINITY,
			compressionAlgorithm: CompressionAlgorithms.lz4,
		};

		this.innerDeltaManager = deltaManager;

		// Here we could wrap/intercept on these functions to block/modify outgoing messages if needed.
		// This makes ContainerRuntime the final gatekeeper for outgoing messages.
		this.submitFn = submitFn;
		this.submitBatchFn = submitBatchFn;
		this.submitSummaryFn = submitSummaryFn;
		this.submitSignalFn = submitSignalFn;

		// TODO: After IContainerContext.options is removed, we'll just create a new blank object {} here.
		// Values are generally expected to be set from the runtime side.
		this.options = options ?? {};
		this.clientDetails = clientDetails;
		this.isSummarizerClient = this.clientDetails.type === summarizerClientType;
		this.loadedFromVersionId = context.getLoadedFromVersion()?.id;
		this._getClientId = () => context.clientId;
		this._getAttachState = () => context.attachState;
		this.getAbsoluteUrl = async (relativeUrl: string) => {
			if (context.getAbsoluteUrl === undefined) {
				throw new Error("Driver does not implement getAbsoluteUrl");
			}
			if (this.attachState !== AttachState.Attached) {
				return undefined;
			}
			return context.getAbsoluteUrl(relativeUrl);
		};
		// TODO: Consider that the Container could just listen to these events itself, or even more appropriately maybe the
		// customer should observe dirty state on the runtime (the owner of dirty state) directly, rather than on the IContainer.
		this.on("dirty", () => context.updateDirtyContainerState(true));
		this.on("saved", () => context.updateDirtyContainerState(false));

		// In old loaders without dispose functionality, closeFn is equivalent but will also switch container to readonly mode
		this.disposeFn = disposeFn ?? closeFn;
		// In cases of summarizer, we want to dispose instead since consumer doesn't interact with this container
		this.closeFn = this.isSummarizerClient ? this.disposeFn : closeFn;

		let loadSummaryNumber: number;
		// Get the container creation metadata. For new container, we initialize these. For existing containers,
		// get the values from the metadata blob.
		if (existing) {
			this.createContainerMetadata = {
				createContainerRuntimeVersion: metadata?.createContainerRuntimeVersion,
				createContainerTimestamp: metadata?.createContainerTimestamp,
			};
			// summaryNumber was renamed from summaryCount. For older docs that haven't been opened for a long time,
			// the count is reset to 0.
			loadSummaryNumber = metadata?.summaryNumber ?? 0;
		} else {
			this.createContainerMetadata = {
				createContainerRuntimeVersion: pkgVersion,
				createContainerTimestamp: Date.now(),
			};
			loadSummaryNumber = 0;
		}
		this.nextSummaryNumber = loadSummaryNumber + 1;

		this.messageAtLastSummary = lastMessageFromMetadata(metadata);

		// Note that we only need to pull the *initial* connected state from the context.
		// Later updates come through calls to setConnectionState.
		this._connected = connected;

		this.mc.logger.sendTelemetryEvent({
			eventName: "GCFeatureMatrix",
			metadataValue: JSON.stringify(metadata?.gcFeatureMatrix),
			inputs: JSON.stringify({
				gcOptions_gcGeneration: this.runtimeOptions.gcOptions[gcGenerationOptionName],
			}),
		});

		this.telemetryDocumentId = metadata?.telemetryDocumentId ?? uuid();

		this.disableAttachReorder = this.mc.config.getBoolean(
			"Fluid.ContainerRuntime.disableAttachOpReorder",
		);
		const disableChunking = this.mc.config.getBoolean(
			"Fluid.ContainerRuntime.CompressionChunkingDisabled",
		);

		const opGroupingManager = new OpGroupingManager(
			{
				groupedBatchingEnabled: this.groupedBatchingEnabled,
				opCountThreshold:
					this.mc.config.getNumber("Fluid.ContainerRuntime.GroupedBatchingOpCount") ?? 2,
				reentrantBatchGroupingEnabled:
					this.mc.config.getBoolean("Fluid.ContainerRuntime.GroupedBatchingReentrancy") ??
					true,
			},
			this.mc.logger,
		);

		const opSplitter = new OpSplitter(
			chunks,
			this.submitBatchFn,
			disableChunking === true ? Number.POSITIVE_INFINITY : runtimeOptions.chunkSizeInBytes,
			runtimeOptions.maxBatchSizeInBytes,
			this.mc.logger,
		);

		this.remoteMessageProcessor = new RemoteMessageProcessor(
			opSplitter,
			new OpDecompressor(this.mc.logger),
			opGroupingManager,
		);

		const pendingRuntimeState = pendingLocalState as IPendingRuntimeState | undefined;
		this.pendingStateManager = new PendingStateManager(
			{
				applyStashedOp: this.applyStashedOp.bind(this),
				clientId: () => this.clientId,
				close: this.closeFn,
				connected: () => this.connected,
				reSubmit: (message: IPendingBatchMessage) => {
					this.reSubmit(message);
					this.flush();
				},
				reSubmitBatch: this.reSubmitBatch.bind(this),
				isActiveConnection: () => this.innerDeltaManager.active,
				isAttached: () => this.attachState !== AttachState.Detached,
			},
			pendingRuntimeState?.pending,
			this.logger,
		);

		let outerDeltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
		const useDeltaManagerOpsProxy =
			this.mc.config.getBoolean("Fluid.ContainerRuntime.DeltaManagerOpsProxy") !== false;
		// The summarizerDeltaManager Proxy is used to lie to the summarizer to convince it is in the right state as a summarizer client.
		const summarizerDeltaManagerProxy = new DeltaManagerSummarizerProxy(this.innerDeltaManager);
		outerDeltaManager = summarizerDeltaManagerProxy;

		// The DeltaManagerPendingOpsProxy is used to control the minimum sequence number
		// It allows us to lie to the layers below so that they can maintain enough local state for rebasing ops.
		if (useDeltaManagerOpsProxy) {
			const pendingOpsDeltaManagerProxy = new DeltaManagerPendingOpsProxy(
				summarizerDeltaManagerProxy,
				this.pendingStateManager,
			);
			outerDeltaManager = pendingOpsDeltaManagerProxy;
		}

		this.deltaManager = outerDeltaManager;

		this.handleContext = new ContainerFluidHandleContext("", this);

		if (this.summaryConfiguration.state === "enabled") {
			this.validateSummaryHeuristicConfiguration(this.summaryConfiguration);
		}

		this.summariesDisabled = this.isSummariesDisabled();
		this.maxOpsSinceLastSummary = this.getMaxOpsSinceLastSummary();
		this.initialSummarizerDelayMs = this.getInitialSummarizerDelayMs();

		this.maxConsecutiveReconnects =
			this.mc.config.getNumber(maxConsecutiveReconnectsKey) ??
			this.defaultMaxConsecutiveReconnects;

		if (
			runtimeOptions.flushMode === (FlushModeExperimental.Async as unknown as FlushMode) &&
			supportedFeatures?.get("referenceSequenceNumbers") !== true
		) {
			// The loader does not support reference sequence numbers, falling back on FlushMode.TurnBased
			this.mc.logger.sendErrorEvent({ eventName: "FlushModeFallback" });
			this._flushMode = FlushMode.TurnBased;
		} else {
			this._flushMode = runtimeOptions.flushMode;
		}

		if (context.attachState === AttachState.Attached) {
			const maxSnapshotCacheDurationMs = this._storage?.policies?.maximumCacheDurationMs;
			if (
				maxSnapshotCacheDurationMs !== undefined &&
				maxSnapshotCacheDurationMs > 5 * 24 * 60 * 60 * 1000
			) {
				// This is a runtime enforcement of what's already explicit in the policy's type itself,
				// which dictates the value is either undefined or exactly 5 days in ms.
				// As long as the actual value is less than 5 days, the assumptions GC makes here are valid.
				throw new UsageError("Driver's maximumCacheDurationMs policy cannot exceed 5 days");
			}
		}

		this.garbageCollector = GarbageCollector.create({
			runtime: this,
			gcOptions: this.runtimeOptions.gcOptions,
			baseSnapshot,
			baseLogger: this.mc.logger,
			existing,
			metadata,
			createContainerMetadata: this.createContainerMetadata,
			isSummarizerClient: this.isSummarizerClient,
			getNodePackagePath: async (nodePath: string) => this.getGCNodePackagePath(nodePath),
			getLastSummaryTimestampMs: () => this.messageAtLastSummary?.timestamp,
			readAndParseBlob: async <T>(id: string) => readAndParse<T>(this.storage, id),
			submitMessage: (message: ContainerRuntimeGCMessage) => this.submit(message),
			sessionExpiryTimerStarted: pendingRuntimeState?.sessionExpiryTimerStarted,
		});

		const loadedFromSequenceNumber = this.deltaManager.initialSequenceNumber;
		this.summarizerNode = createRootSummarizerNodeWithGC(
			createChildLogger({ logger: this.logger, namespace: "SummarizerNode" }),
			// Summarize function to call when summarize is called. Summarizer node always tracks summary state.
			async (fullTree: boolean, trackState: boolean, telemetryContext?: ITelemetryContext) =>
				this.summarizeInternal(fullTree, trackState, telemetryContext),
			// Latest change sequence number, no changes since summary applied yet
			loadedFromSequenceNumber,
			// Summary reference sequence number, undefined if no summary yet
			baseSnapshot !== undefined ? loadedFromSequenceNumber : undefined,
			{
				// Must set to false to prevent sending summary handle which would be pointing to
				// a summary with an older protocol state.
				canReuseHandle: false,
				// If GC should not run, let the summarizer node know so that it does not track GC state.
				gcDisabled: !this.garbageCollector.shouldRunGC,
			},
			// Function to get GC data if needed. This will always be called by the root summarizer node to get GC data.
			async (fullGC?: boolean) => this.getGCDataInternal(fullGC),
			// Function to get the GC details from the base snapshot we loaded from.
			async () => this.garbageCollector.getBaseGCDetails(),
		);

		if (baseSnapshot) {
			this.summarizerNode.updateBaseSummaryState(baseSnapshot);
		}

		const parentContext = wrapContext(this);

		// Due to a mismatch between different layers in terms of
		// what is the interface of passing signals, we need the
		// downstream stores to wrap the signal.
		parentContext.submitSignal = (type: string, content: unknown, targetClientId?: string) => {
			const envelope1 = content as IEnvelope;
			const envelope2 = this.createNewSignalEnvelope(
				envelope1.address,
				type,
				envelope1.contents,
			);
			return this.submitSignalFn(envelope2, targetClientId);
		};

		let snapshot: ISnapshot | ISnapshotTree | undefined = getSummaryForDatastores(
			baseSnapshot,
			metadata,
		);
		if (snapshot !== undefined && snapshotWithContents !== undefined) {
			snapshot = {
				...snapshotWithContents,
				snapshotTree: snapshot,
			};
		}

		this.channelCollection = new ChannelCollection(
			snapshot,
			parentContext,
			this.mc.logger,
			(props) => this.garbageCollector.nodeUpdated(props),
			(path: string) => this.garbageCollector.isNodeDeleted(path),
			new Map<string, string>(dataStoreAliasMap),
			async (runtime: ChannelCollection) => provideEntryPoint,
		);

		this.blobManager = new BlobManager({
			routeContext: this.handleContext,
			snapshot: blobManagerSnapshot,
			getStorage: () => this.storage,
			sendBlobAttachOp: (localId: string, blobId?: string) => {
				if (!this.disposed) {
					this.submit(
						{ type: ContainerMessageType.BlobAttach, contents: undefined },
						undefined,
						{
							localId,
							blobId,
						},
					);
				}
			},
			blobRequested: (blobPath: string) =>
				this.garbageCollector.nodeUpdated({
					node: { type: "Blob", path: blobPath },
					reason: "Loaded",
				}),
			isBlobDeleted: (blobPath: string) => this.garbageCollector.isNodeDeleted(blobPath),
			runtime: this,
			stashedBlobs: pendingRuntimeState?.pendingAttachmentBlobs,
			closeContainer: (error?: ICriticalContainerError) => this.closeFn(error),
		});

		this.scheduleManager = new ScheduleManager(
			this.innerDeltaManager,
			this,
			() => this.clientId,
			createChildLogger({ logger: this.logger, namespace: "ScheduleManager" }),
		);

		const disablePartialFlush = this.mc.config.getBoolean(
			"Fluid.ContainerRuntime.DisablePartialFlush",
		);

		const legacySendBatchFn = makeLegacySendBatchFn(this.submitFn, this.innerDeltaManager);

		this.outbox = new Outbox({
			shouldSend: () => this.canSendOps(),
			pendingStateManager: this.pendingStateManager,
			submitBatchFn: this.submitBatchFn,
			legacySendBatchFn,
			compressor: new OpCompressor(this.mc.logger),
			splitter: opSplitter,
			config: {
				compressionOptions,
				maxBatchSizeInBytes: runtimeOptions.maxBatchSizeInBytes,
				disablePartialFlush: disablePartialFlush === true,
			},
			logger: this.mc.logger,
			groupingManager: opGroupingManager,
			getCurrentSequenceNumbers: () => ({
				referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
				clientSequenceNumber: this._processedClientSequenceNumber,
			}),
			reSubmit: this.reSubmit.bind(this),
			opReentrancy: () => this.ensureNoDataModelChangesCalls > 0,
			closeContainer: this.closeFn,
		});

		this._quorum = quorum;
		this._quorum.on("removeMember", (clientId: string) => {
			this.remoteMessageProcessor.clearPartialMessagesFor(clientId);
		});

		this._audience = audience;
		if (audience.getSelf === undefined) {
			// back-compat, added in 2.0 RC3.
			// Purpose: deal with cases when we run against old loader that does not have newly added capabilities
			audience.getSelf = () => {
				const clientId = this._getClientId();
				return clientId === undefined
					? undefined
					: ({
							clientId,
							client: audience.getMember(clientId),
					  } satisfies ISelf);
			};

			let oldClientId = this.clientId;
			this.on("connected", () => {
				const clientId = this.clientId;
				assert(clientId !== undefined, 0x975 /* can't be undefined */);
				(audience as unknown as TypedEventEmitter<IAudienceEvents>).emit(
					"selfChanged",
					{ clientId: oldClientId },
					{ clientId, client: audience.getMember(clientId) },
				);
				oldClientId = clientId;
			});
		}

		const closeSummarizerDelayOverride = this.mc.config.getNumber(
			"Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs",
		);
		this.closeSummarizerDelayMs = closeSummarizerDelayOverride ?? defaultCloseSummarizerDelayMs;
		this.summaryCollection = new SummaryCollection(this.deltaManager, this.logger);

		this.dirtyContainer =
			this.attachState !== AttachState.Attached || this.hasPendingMessages();
		context.updateDirtyContainerState(this.dirtyContainer);

		if (this.summariesDisabled) {
			this.mc.logger.sendTelemetryEvent({ eventName: "SummariesDisabled" });
		} else {
			const orderedClientLogger = createChildLogger({
				logger: this.logger,
				namespace: "OrderedClientElection",
			});
			const orderedClientCollection = new OrderedClientCollection(
				orderedClientLogger,
				this.innerDeltaManager,
				this._quorum,
			);
			const orderedClientElectionForSummarizer = new OrderedClientElection(
				orderedClientLogger,
				orderedClientCollection,
				electedSummarizerData ?? this.innerDeltaManager.lastSequenceNumber,
				SummarizerClientElection.isClientEligible,
				this.mc.config.getBoolean(
					"Fluid.ContainerRuntime.OrderedClientElection.EnablePerformanceEvents",
				),
			);

			this.summarizerClientElection = new SummarizerClientElection(
				orderedClientLogger,
				this.summaryCollection,
				orderedClientElectionForSummarizer,
				this.maxOpsSinceLastSummary,
			);

			if (this.isSummarizerClient) {
				this._summarizer = new Summarizer(
					this /* ISummarizerRuntime */,
					() => this.summaryConfiguration,
					this /* ISummarizerInternalsProvider */,
					this.handleContext,
					this.summaryCollection,
					async (runtime: IConnectableRuntime) =>
						RunWhileConnectedCoordinator.create(
							runtime,
							// Summarization runs in summarizer client and needs access to the real (non-proxy) active
							// information. The proxy delta manager would always return false for summarizer client.
							() => this.innerDeltaManager.active,
						),
				);
			} else if (SummarizerClientElection.clientDetailsPermitElection(this.clientDetails)) {
				// Only create a SummaryManager and SummarizerClientElection
				// if summaries are enabled and we are not the summarizer client.
				const defaultAction = () => {
					if (this.summaryCollection.opsSinceLastAck > this.maxOpsSinceLastSummary) {
						this.mc.logger.sendTelemetryEvent({ eventName: "SummaryStatus:Behind" });
						// unregister default to no log on every op after falling behind
						// and register summary ack handler to re-register this handler
						// after successful summary
						this.summaryCollection.once(MessageType.SummaryAck, () => {
							this.mc.logger.sendTelemetryEvent({
								eventName: "SummaryStatus:CaughtUp",
							});
							// we've caught up, so re-register the default action to monitor for
							// falling behind, and unregister ourself
							this.summaryCollection.on("default", defaultAction);
						});
						this.summaryCollection.off("default", defaultAction);
					}
				};

				this.summaryCollection.on("default", defaultAction);

				// Create the SummaryManager and mark the initial state
				this.summaryManager = new SummaryManager(
					this.summarizerClientElection,
					this, // IConnectedState
					this.summaryCollection,
					this.logger,
					this.formCreateSummarizerFn(loader),
					new Throttler(
						60 * 1000, // 60 sec delay window
						30 * 1000, // 30 sec max delay
						// throttling function increases exponentially (0ms, 40ms, 80ms, 160ms, etc)
						formExponentialFn({ coefficient: 20, initialDelay: 0 }),
					),
					{
						initialDelayMs: this.initialSummarizerDelayMs,
					},
				);
				this.summaryManager.on("summarize", (eventProps) => {
					this.emit("summarize", eventProps);
				});
				this.summaryManager.start();
			}
		}

		// logging hardware telemetry
		this.logger.sendTelemetryEvent({
			eventName: "DeviceSpec",
			...getDeviceSpec(),
		});

		this.mc.logger.sendTelemetryEvent({
			eventName: "ContainerLoadStats",
			...this.createContainerMetadata,
			...this.channelCollection.containerLoadStats,
			summaryNumber: loadSummaryNumber,
			summaryFormatVersion: metadata?.summaryFormatVersion,
			disableIsolatedChannels: metadata?.disableIsolatedChannels,
			gcVersion: metadata?.gcFeature,
			options: JSON.stringify(runtimeOptions),
			idCompressorModeMetadata: metadata?.documentSchema?.runtime?.idCompressorMode,
			idCompressorMode: this.idCompressorMode,
			sessionRuntimeSchema: JSON.stringify(this.sessionSchema),
			featureGates: JSON.stringify({
				...featureGatesForTelemetry,
				disableChunking,
				disableAttachReorder: this.disableAttachReorder,
				disablePartialFlush,
				closeSummarizerDelayOverride,
			}),
			telemetryDocumentId: this.telemetryDocumentId,
			groupedBatchingEnabled: this.groupedBatchingEnabled,
			initialSequenceNumber: this.deltaManager.initialSequenceNumber,
		});

		ReportOpPerfTelemetry(this.clientId, this.deltaManager, this, this.logger);
		BindBatchTracker(this, this.logger);

		this.entryPoint = new LazyPromise(async () => {
			if (this.isSummarizerClient) {
				assert(
					this._summarizer !== undefined,
					0x5bf /* Summarizer object is undefined in a summarizer client */,
				);
				return this._summarizer;
			}
			return provideEntryPoint(this);
		});

		// If we loaded from pending state, then we need to skip any ops that are already accounted in such
		// saved state, i.e. all the ops marked by Loader layer sa savedOp === true.
		this.skipSavedCompressorOps = pendingRuntimeState?.pendingIdCompressorState !== undefined;
	}

	public onSchemaChange(schema: IDocumentSchemaCurrent) {
		this.logger.sendTelemetryEvent({
			eventName: "SchemaChangeAccept",
			sessionRuntimeSchema: JSON.stringify(schema),
		});

		// Most of the settings will be picked up only by new sessions (i.e. after reload).
		// We can make it better in the future (i.e. start to use op compression right away), but for simplicity
		// this is not done.
		// But ID compressor is special. It's possible, that in future, we will remove "stickiness" of ID compressor setting
		// and will allow to start using it. If that were to happen, we want to ensure that we do not break eventual consistency
		// promises. To do so, we need to initialize id compressor right away.
		// As it's implemented right now (with async initialization), this will only work for "off" -> "delayed" transitions.
		// Anything else is too risky, and requires ability to initialize ID compressor synchronously!
		if (schema.runtime.idCompressorMode !== undefined) {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.loadIdCompressor();
		}
	}

	public getCreateChildSummarizerNodeFn(id: string, createParam: CreateChildSummarizerNodeParam) {
		return (
			summarizeInternal: SummarizeInternalFn,
			getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
		) =>
			this.summarizerNode.createChild(
				summarizeInternal,
				id,
				createParam,
				undefined,
				getGCDataFn,
			);
	}

	public deleteChildSummarizerNode(id: string) {
		return this.summarizerNode.deleteChild(id);
	}

	/* IFluidParentContext APIs that should not be called on Root */
	public makeLocallyVisible() {
		assert(false, 0x8eb /* should not be called */);
	}

	public setChannelDirty(address: string) {
		assert(false, 0x909 /* should not be called */);
	}

	/**
	 * Initializes the state from the base snapshot this container runtime loaded from.
	 */
	private async initializeBaseState(): Promise<void> {
		if (
			this.idCompressorMode === "on" ||
			(this.idCompressorMode === "delayed" && this.connected)
		) {
			this._idCompressor = await this.createIdCompressor();
			// This is called from loadRuntime(), long before we process any ops, so there should be no ops accumulated yet.
			assert(this.pendingIdCompressorOps.length === 0, 0x8ec /* no pending ops */);
		}

		await this.garbageCollector.initializeBaseState();
	}

	public dispose(error?: Error): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		this.mc.logger.sendTelemetryEvent(
			{
				eventName: "ContainerRuntimeDisposed",
				isDirty: this.isDirty,
				lastSequenceNumber: this.deltaManager.lastSequenceNumber,
				attachState: this.attachState,
			},
			error,
		);

		if (this.summaryManager !== undefined) {
			this.summaryManager.dispose();
		}
		this.garbageCollector.dispose();
		this._summarizer?.dispose();
		this.channelCollection.dispose();
		this.pendingStateManager.dispose();
		this.emit("dispose");
		this.removeAllListeners();
	}

	/**
	 * Api to fetch the snapshot from the service for a loadingGroupIds.
	 * @param loadingGroupIds - LoadingGroupId for which the snapshot is asked for.
	 * @param pathParts - Parts of the path, which we want to extract from the snapshot tree.
	 * @returns - snapshotTree and the sequence number of the snapshot.
	 */
	public async getSnapshotForLoadingGroupId(
		loadingGroupIds: string[],
		pathParts: string[],
	): Promise<{ snapshotTree: ISnapshotTree; sequenceNumber: number }> {
		const sortedLoadingGroupIds = loadingGroupIds.sort();
		assert(
			this.storage.getSnapshot !== undefined,
			0x8ed /* getSnapshot api should be defined if used */,
		);
		let loadedFromCache = true;
		// Lookup up in the cache, if not present then make the network call as multiple datastores could
		// be in same loading group. So, once we have fetched the snapshot for that loading group on
		// any request, then cache that as same group could be requested in future too.
		const snapshot = await this.snapshotCacheForLoadingGroupIds.addOrGet(
			sortedLoadingGroupIds.join(),
			async () => {
				assert(
					this.storage.getSnapshot !== undefined,
					0x8ee /* getSnapshot api should be defined if used */,
				);
				loadedFromCache = false;
				return this.storage.getSnapshot({
					cacheSnapshot: false,
					scenarioName: "snapshotForLoadingGroupId",
					loadingGroupIds: sortedLoadingGroupIds,
				});
			},
		);

		this.logger.sendTelemetryEvent({
			eventName: "GroupIdSnapshotFetched",
			details: JSON.stringify({
				fromCache: loadedFromCache,
				loadingGroupIds: loadingGroupIds.join(","),
			}),
		});
		// Find the snapshotTree inside the returned snapshot based on the path as given in the request.
		const hasIsolatedChannels = rootHasIsolatedChannels(this.metadata);
		const snapshotTreeForPath = this.getSnapshotTreeForPath(
			snapshot.snapshotTree,
			pathParts,
			hasIsolatedChannels,
		);
		assert(snapshotTreeForPath !== undefined, 0x8ef /* no snapshotTree for the path */);
		const snapshotSeqNumber = snapshot.sequenceNumber;
		assert(snapshotSeqNumber !== undefined, 0x8f0 /* snapshotSeqNumber should be present */);

		// This assert fires if we get a snapshot older than the snapshot we loaded from. This is a service issue.
		// Snapshots should only move forward. If we observe an older snapshot than the one we loaded from, then likely
		// the file has been overwritten or service lost data.
		if (snapshotSeqNumber < this.deltaManager.initialSequenceNumber) {
			throw DataProcessingError.create(
				"Downloaded snapshot older than snapshot we loaded from",
				"getSnapshotForLoadingGroupId",
				undefined,
				{
					loadingGroupIds: sortedLoadingGroupIds.join(","),
					snapshotSeqNumber,
					initialSequenceNumber: this.deltaManager.initialSequenceNumber,
				},
			);
		}

		// If the snapshot is ahead of the last seq number of the delta manager, then catch up before
		// returning the snapshot.
		if (snapshotSeqNumber > this.deltaManager.lastSequenceNumber) {
			// If this is a summarizer client, which is trying to load a group and it finds that there is
			// another snapshot from which the summarizer loaded and it is behind, then just give up as
			// the summarizer state is not up to date.
			// This should be a recoverable scenario and shouldn't happen as we should process the ack first.
			if (this.isSummarizerClient) {
				throw new Error(
					"Summarizer client behind, loaded newer snapshot with loadingGroupId",
				);
			}

			// We want to catchup from sequenceNumber to targetSequenceNumber
			const props: ITelemetryGenericEventExt = {
				eventName: "GroupIdSnapshotCatchup",
				loadingGroupIds: sortedLoadingGroupIds.join(","),
				targetSequenceNumber: snapshotSeqNumber, // This is so we reuse some columns in telemetry
				sequenceNumber: this.deltaManager.lastSequenceNumber, // This is so we reuse some columns in telemetry
			};

			const event = PerformanceEvent.start(this.mc.logger, {
				...props,
			});
			// If the inbound deltas queue is paused or disconnected, we expect a reconnect and unpause
			// as long as it's not a summarizer client.
			if (this.deltaManager.inbound.paused) {
				props.inboundPaused = this.deltaManager.inbound.paused; // reusing telemetry
			}
			const defP = new Deferred<boolean>();
			this.deltaManager.on("op", (message: ISequencedDocumentMessage) => {
				if (message.sequenceNumber >= snapshotSeqNumber) {
					defP.resolve(true);
				}
			});
			await defP.promise;
			event.end(props);
		}
		return { snapshotTree: snapshotTreeForPath, sequenceNumber: snapshotSeqNumber };
	}

	/**
	 * Api to find a snapshot tree inside a bigger snapshot tree based on the path in the pathParts array.
	 * @param snapshotTree - snapshot tree to look into.
	 * @param pathParts - Part of the path, which we want to extract from the snapshot tree.
	 * @param hasIsolatedChannels - whether the channels are present inside ".channels" subtree. Older
	 * snapshots will not have trees inside ".channels", so check that.
	 * @returns - requested snapshot tree based on the path parts.
	 */
	private getSnapshotTreeForPath(
		snapshotTree: ISnapshotTree,
		pathParts: string[],
		hasIsolatedChannels: boolean,
	): ISnapshotTree | undefined {
		let childTree = snapshotTree;
		for (const part of pathParts) {
			if (hasIsolatedChannels) {
				childTree = childTree?.trees[channelsTreeName];
			}
			childTree = childTree?.trees[part];
		}
		return childTree;
	}

	/**
	 * Notifies this object about the request made to the container.
	 * @param request - Request made to the handler.
	 * @deprecated Will be removed in future major release. This method needs to stay private until LTS version of Loader moves to "2.0.0-internal.7.0.0".
	 */
	// @ts-expect-error expected to be used by LTS Loaders and Containers
	private async request(request: IRequest): Promise<IResponse> {
		try {
			const parser = RequestParser.create(request);
			const id = parser.pathParts[0];

			if (id === summarizerRequestUrl && parser.pathParts.length === 1) {
				if (this._summarizer !== undefined) {
					return {
						status: 200,
						mimeType: "fluid/object",
						value: this.summarizer,
					};
				}
				return create404Response(request);
			}
			if (this.requestHandler !== undefined) {
				// eslint-disable-next-line @typescript-eslint/return-await -- Adding an await here causes test failures
				return this.requestHandler(parser, this);
			}

			return create404Response(request);
		} catch (error) {
			return exceptionToResponse(error);
		}
	}

	/**
	 * Resolves URI representing handle
	 * @param request - Request made to the handler.
	 */
	public async resolveHandle(request: IRequest): Promise<IResponse> {
		try {
			const requestParser = RequestParser.create(request);
			const id = requestParser.pathParts[0];

			if (id === "_channels") {
				// eslint-disable-next-line @typescript-eslint/return-await -- Adding an await here causes test failures
				return this.resolveHandle(requestParser.createSubRequest(1));
			}

			if (id === BlobManager.basePath && requestParser.isLeaf(2)) {
				const blob = await this.blobManager.getBlob(requestParser.pathParts[1]);
				return blob
					? {
							status: 200,
							mimeType: "fluid/object",
							value: blob,
					  }
					: create404Response(request);
			} else if (requestParser.pathParts.length > 0) {
				return await this.channelCollection.request(request);
			}

			return create404Response(request);
		} catch (error) {
			return exceptionToResponse(error);
		}
	}

	/**
	 * {@inheritDoc @fluidframework/container-definitions#IRuntime.getEntryPoint}
	 */
	public async getEntryPoint(): Promise<FluidObject> {
		return this.entryPoint;
	}
	private readonly entryPoint: LazyPromise<FluidObject>;

	private internalId(maybeAlias: string): string {
		return this.channelCollection.internalId(maybeAlias);
	}

	/** Adds the container's metadata to the given summary tree. */
	private addMetadataToSummary(summaryTree: ISummaryTreeWithStats) {
		// The last message processed at the time of summary. If there are no new messages, use the message from the
		// last summary.
		const message =
			extractSummaryMetadataMessage(this.deltaManager.lastMessage) ??
			this.messageAtLastSummary;

		const documentSchema = this.documentsSchemaController.summarizeDocumentSchema(
			this.deltaManager.lastSequenceNumber,
		);

		// Is document schema explicit control on?
		const explicitSchemaControl = documentSchema?.runtime.explicitSchemaControl;

		const metadata: IContainerRuntimeMetadata = {
			...this.createContainerMetadata,
			// Increment the summary number for the next summary that will be generated.
			summaryNumber: this.nextSummaryNumber++,
			summaryFormatVersion: 1,
			...this.garbageCollector.getMetadata(),
			telemetryDocumentId: this.telemetryDocumentId,
			// If explicit document schema control is not on, use legacy way to supply last message (using 'message' property).
			// Otherwise use new 'lastMessage' property, but also put content into the 'message' property that cases old
			// runtimes (that preceed document schema control capabilities) to close container on load due to mismatch in
			// last message's sequence number.
			// See also lastMessageFromMetadata()
			message: explicitSchemaControl
				? ({ sequenceNumber: -1 } as any as ISummaryMetadataMessage)
				: message,
			lastMessage: explicitSchemaControl ? message : undefined,
			documentSchema,
		};

		addBlobToSummary(summaryTree, metadataBlobName, JSON.stringify(metadata));
	}

	protected addContainerStateToSummary(
		summaryTree: ISummaryTreeWithStats,
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	) {
		this.addMetadataToSummary(summaryTree);

		if (this._idCompressor) {
			const idCompressorState = JSON.stringify(this._idCompressor.serialize(false));
			addBlobToSummary(summaryTree, idCompressorBlobName, idCompressorState);
		}

		if (this.remoteMessageProcessor.partialMessages.size > 0) {
			const content = JSON.stringify([...this.remoteMessageProcessor.partialMessages]);
			addBlobToSummary(summaryTree, chunksBlobName, content);
		}

		const dataStoreAliases = this.channelCollection.aliases;
		if (dataStoreAliases.size > 0) {
			addBlobToSummary(summaryTree, aliasBlobName, JSON.stringify([...dataStoreAliases]));
		}

		if (this.summarizerClientElection) {
			const electedSummarizerContent = JSON.stringify(
				this.summarizerClientElection?.serialize(),
			);
			addBlobToSummary(summaryTree, electedSummarizerBlobName, electedSummarizerContent);
		}

		const blobManagerSummary = this.blobManager.summarize();
		// Some storage (like git) doesn't allow empty tree, so we can omit it.
		// and the blob manager can handle the tree not existing when loading
		if (Object.keys(blobManagerSummary.summary.tree).length > 0) {
			addSummarizeResultToSummary(summaryTree, blobsTreeName, blobManagerSummary);
		}

		const gcSummary = this.garbageCollector.summarize(fullTree, trackState, telemetryContext);
		if (gcSummary !== undefined) {
			addSummarizeResultToSummary(summaryTree, gcTreeKey, gcSummary);
		}
	}

	// Track how many times the container tries to reconnect with pending messages.
	// This happens when the connection state is changed and we reset the counter
	// when we are able to process a local op or when there are no pending messages.
	// If this counter reaches a max, it's a good indicator that the container
	// is not making progress and it is stuck in a retry loop.
	private shouldContinueReconnecting(): boolean {
		if (this.maxConsecutiveReconnects <= 0) {
			// Feature disabled, we never stop reconnecting
			return true;
		}

		if (!this.hasPendingMessages()) {
			// If there are no pending messages, we can always reconnect
			this.resetReconnectCount();
			return true;
		}

		if (this.consecutiveReconnects === Math.floor(this.maxConsecutiveReconnects / 2)) {
			// If we're halfway through the max reconnects, send an event in order
			// to better identify false positives, if any. If the rate of this event
			// matches Container Close count below, we can safely cut down
			// maxConsecutiveReconnects to half.
			this.mc.logger.sendTelemetryEvent({
				eventName: "ReconnectsWithNoProgress",
				attempts: this.consecutiveReconnects,
				pendingMessages: this.pendingMessagesCount,
			});
		}

		return this.consecutiveReconnects < this.maxConsecutiveReconnects;
	}

	private resetReconnectCount() {
		this.consecutiveReconnects = 0;
	}

	private replayPendingStates() {
		// We need to be able to send ops to replay states
		if (!this.canSendOps()) {
			return;
		}

		// We need to temporary clear the dirty flags and disable
		// dirty state change events to detect whether replaying ops
		// has any effect.

		// Save the old state, reset to false, disable event emit
		const oldState = this.dirtyContainer;
		this.dirtyContainer = false;

		assert(this.emitDirtyDocumentEvent, 0x127 /* "dirty document event not set on replay" */);
		this.emitDirtyDocumentEvent = false;
		let newState: boolean;

		try {
			this.submitIdAllocationOpIfNeeded(true);
			// replay the ops
			this.pendingStateManager.replayPendingStates();
		} finally {
			// Save the new start and restore the old state, re-enable event emit
			newState = this.dirtyContainer;
			this.dirtyContainer = oldState;
			this.emitDirtyDocumentEvent = true;
		}

		// Officially transition from the old state to the new state.
		this.updateDocumentDirtyState(newState);
	}

	/**
	 * Parse an op's type and actual content from given serialized content
	 * ! Note: this format needs to be in-line with what is set in the "ContainerRuntime.submit(...)" method
	 */
	// TODO: markfields: confirm Local- versus Outbound- ContainerRuntimeMessage typing
	private parseLocalOpContent(serializedContents?: string): LocalContainerRuntimeMessage {
		assert(serializedContents !== undefined, 0x6d5 /* content must be defined */);
		const message: LocalContainerRuntimeMessage = JSON.parse(serializedContents);
		assert(message.type !== undefined, 0x6d6 /* incorrect op content format */);
		return message;
	}

	private async applyStashedOp(serializedOpContent: string): Promise<unknown> {
		// Need to parse from string for back-compat
		const opContents = this.parseLocalOpContent(serializedOpContent);
		switch (opContents.type) {
			case ContainerMessageType.FluidDataStoreOp:
			case ContainerMessageType.Attach:
			case ContainerMessageType.Alias:
				return this.channelCollection.applyStashedOp(opContents);
			case ContainerMessageType.IdAllocation:
				// IDs allocation ops in stashed state are ignored because the tip state of the compressor
				// is serialized into the pending state. This is done because generation of new IDs during
				// stashed op application (or, later, resubmit) must generate new IDs and if the compressor
				// was loaded from a state serialized at the same time as the summary tree in the stashed state
				// then it would generate IDs that collide with any in later stashed ops.
				// In the future, IdCompressor could be extended to have an "applyStashedOp" or similar method
				// and the runtime could filter out all ID allocation ops from the stashed state and apply them
				// before applying the rest of the stashed ops. This would accomplish the same thing but with
				// better performance in future incremental stashed state creation.
				assert(
					this.idCompressorMode !== undefined,
					0x8f1 /* ID compressor should be in use */,
				);
				return;
			case ContainerMessageType.DocumentSchemaChange:
				return;
			case ContainerMessageType.BlobAttach:
				return;
			case ContainerMessageType.Rejoin:
				throw new Error("rejoin not expected here");
			case ContainerMessageType.GC:
				// GC op is only sent in summarizer which should never have stashed ops.
				throw new LoggingError("GC op not expected to be stashed in summarizer");
			default: {
				// This should be extremely rare for stashed ops.
				// It would require a newer runtime stashing ops and then an older one applying them,
				// e.g. if an app rolled back its container version
				const compatBehavior = opContents.compatDetails?.behavior;
				if (!compatBehaviorAllowsMessageType(opContents.type, compatBehavior)) {
					const error = DataProcessingError.create(
						"Stashed runtime message of unexpected type",
						"applyStashedOp",
						undefined /* sequencedMessage */,
						{
							messageDetails: JSON.stringify({
								type: opContents.type,
								compatBehavior,
							}),
						},
					);
					this.closeFn(error);
					throw error;
				}
				// Note: Even if its compat behavior allows it, we don't know how to apply this stashed op.
				// All we can do is ignore it (similar to on process).
			}
		}
	}

	private async loadIdCompressor() {
		if (
			this._idCompressor === undefined &&
			this.idCompressorMode !== undefined &&
			this._loadIdCompressor === undefined
		) {
			this._loadIdCompressor = this.createIdCompressor()
				.then((compressor) => {
					// Finalize any ranges we received while the compressor was turned off.
					const ops = this.pendingIdCompressorOps;
					this.pendingIdCompressorOps = [];
					for (const range of ops) {
						compressor.finalizeCreationRange(range);
					}
					assert(this.pendingIdCompressorOps.length === 0, 0x976 /* No new ops added */);
					this._idCompressor = compressor;
				})
				.catch((error) => {
					this.logger.sendErrorEvent({ eventName: "IdCompressorDelayedLoad" }, error);
					throw error;
				});
		}
		return this._loadIdCompressor;
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		// Validate we have consistent state
		const currentClientId = this._audience.getSelf()?.clientId;
		assert(clientId === currentClientId, 0x977 /* input clientId does not match Audience */);
		assert(
			this.clientId === currentClientId,
			0x978 /* this.clientId does not match Audience */,
		);

		if (connected && this.idCompressorMode === "delayed") {
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			this.loadIdCompressor();
		}
		if (connected === false && this.delayConnectClientId !== undefined) {
			this.delayConnectClientId = undefined;
			this.mc.logger.sendTelemetryEvent({
				eventName: "UnsuccessfulConnectedTransition",
			});
			// Don't propagate "disconnected" event because we didn't propagate the previous "connected" event
			return;
		}

		if (!connected) {
			this.documentsSchemaController.onDisconnect();
		}

		// If there are stashed blobs in the pending state, we need to delay
		// propagation of the "connected" event until we have uploaded them to
		// ensure we don't submit ops referencing a blob that has not been uploaded
		const connecting = connected && !this._connected;
		if (connecting && this.blobManager.hasPendingStashedUploads()) {
			assert(
				!this.delayConnectClientId,
				0x791 /* Connect event delay must be canceled before subsequent connect event */,
			);
			assert(!!clientId, 0x792 /* Must have clientId when connecting */);
			this.delayConnectClientId = clientId;
			return;
		}

		this.setConnectionStateCore(connected, clientId);
	}

	private setConnectionStateCore(connected: boolean, clientId?: string) {
		assert(
			!this.delayConnectClientId,
			0x394 /* connect event delay must be cleared before propagating connect event */,
		);
		this.verifyNotClosed();

		// There might be no change of state due to Container calling this API after loading runtime.
		const changeOfState = this._connected !== connected;
		const reconnection = changeOfState && !connected;

		// We need to flush the ops currently collected by Outbox to preserve original order.
		// This flush NEEDS to happen before we set the ContainerRuntime to "connected".
		// We want these ops to get to the PendingStateManager without sending to service and have them return to the Outbox upon calling "replayPendingStates".
		if (changeOfState && connected) {
			this.flush();
		}

		this._connected = connected;

		if (!connected) {
			this._perfSignalData.signalsLost = 0;
			this._perfSignalData.signalTimestamp = 0;
			this._perfSignalData.trackingSignalSequenceNumber = undefined;
		} else {
			assert(
				this.attachState === AttachState.Attached,
				0x3cd /* Connection is possible only if container exists in storage */,
			);
		}

		// Fail while disconnected
		if (reconnection) {
			this.consecutiveReconnects++;

			if (!this.shouldContinueReconnecting()) {
				this.closeFn(
					DataProcessingError.create(
						"Runtime detected too many reconnects with no progress syncing local ops.",
						"setConnectionState",
						undefined,
						{
							dataLoss: 1,
							attempts: this.consecutiveReconnects,
							pendingMessages: this.pendingMessagesCount,
						},
					),
				);
				return;
			}
		}

		if (changeOfState) {
			this.replayPendingStates();
		}

		this.channelCollection.setConnectionState(connected, clientId);
		this.garbageCollector.setConnectionState(connected, clientId);

		raiseConnectedEvent(this.mc.logger, this, connected, clientId);
	}

	public async notifyOpReplay(message: ISequencedDocumentMessage) {
		await this.pendingStateManager.applyStashedOpsAt(message.sequenceNumber);
	}

	public process(messageArg: ISequencedDocumentMessage, local: boolean) {
		this.verifyNotClosed();

		// Whether or not the message appears to be a runtime message from an up-to-date client.
		// It may be a legacy runtime message (ie already unpacked and ContainerMessageType)
		// or something different, like a system message.
		const modernRuntimeMessage = messageArg.type === MessageType.Operation;

		// Do shallow copy of message, as the processing flow will modify it.
		// There might be multiple container instances receiving the same message.
		// We do not need to make a deep copy. Each layer will just replace message.contents itself,
		// but will not modify the contents object (likely it will replace it on the message).
		const messageCopy = { ...messageArg };
		const savedOp = (messageCopy.metadata as ISavedOpMetadata)?.savedOp;
		for (const message of this.remoteMessageProcessor.process(messageCopy)) {
			const msg: MessageWithContext = modernRuntimeMessage
				? {
						// Cast it since we expect it to be this based on modernRuntimeMessage computation above.
						// There is nothing really ensuring that anytime original message.type is Operation that
						// the result messages will be so. In the end modern bool being true only directs to
						// throw error if ultimately unrecognized without compat details saying otherwise.
						message: message as InboundSequencedContainerRuntimeMessage,
						local,
						modernRuntimeMessage,
				  }
				: // Unrecognized message will be ignored.
				  {
						message,
						local,
						modernRuntimeMessage,
				  };
			msg.savedOp = savedOp;

			// ensure that we observe any re-entrancy, and if needed, rebase ops
			this.ensureNoDataModelChanges(() => this.processCore(msg));
		}
	}

	private _processedClientSequenceNumber: number | undefined;

	/**
	 * Direct the message to the correct subsystem for processing, and implement other side effects
	 */
	private processCore(messageWithContext: MessageWithContext) {
		const { message, local } = messageWithContext;

		// Intercept to reduce minimum sequence number to the delta manager's minimum sequence number.
		// Sequence numbers are not guaranteed to follow any sort of order. Re-entrancy is one of those situations
		if (
			this.deltaManager.minimumSequenceNumber <
			messageWithContext.message.minimumSequenceNumber
		) {
			messageWithContext.message.minimumSequenceNumber =
				this.deltaManager.minimumSequenceNumber;
		}

		// Surround the actual processing of the operation with messages to the schedule manager indicating
		// the beginning and end. This allows it to emit appropriate events and/or pause the processing of new
		// messages once a batch has been fully processed.
		this.scheduleManager.beforeOpProcessing(message);

		this._processedClientSequenceNumber = message.clientSequenceNumber;

		try {
			// See commit that added this assert for more details.
			// These calls should be made for all but chunked ops:
			// 1) this.pendingStateManager.processPendingLocalMessage() below
			// 2) this.resetReconnectCount() below
			assert(
				message.type !== ContainerMessageType.ChunkedOp,
				0x93b /* we should never get here with chunked ops */,
			);

			let localOpMetadata: unknown;
			if (local && messageWithContext.modernRuntimeMessage) {
				localOpMetadata = this.pendingStateManager.processPendingLocalMessage(
					messageWithContext.message,
				);
			}

			// If there are no more pending messages after processing a local message,
			// the document is no longer dirty.
			if (!this.hasPendingMessages()) {
				this.updateDocumentDirtyState(false);
			}

			this.validateAndProcessRuntimeMessage(messageWithContext, localOpMetadata);

			this.emit("op", message, messageWithContext.modernRuntimeMessage);

			this.scheduleManager.afterOpProcessing(undefined, message);

			if (local) {
				// If we have processed a local op, this means that the container is
				// making progress and we can reset the counter for how many times
				// we have consecutively replayed the pending states
				this.resetReconnectCount();
			}
		} catch (e) {
			this.scheduleManager.afterOpProcessing(e, message);
			throw e;
		}
	}
	/**
	 * Assuming the given message is also a TypedContainerRuntimeMessage,
	 * checks its type and dispatches the message to the appropriate handler in the runtime.
	 * Throws a DataProcessingError if the message looks like but doesn't conform to a known TypedContainerRuntimeMessage type.
	 */
	private validateAndProcessRuntimeMessage(
		messageWithContext: MessageWithContext,
		localOpMetadata: unknown,
	): void {
		// TODO: destructure message and modernRuntimeMessage once using typescript 5.2.2+
		const { local } = messageWithContext;
		switch (messageWithContext.message.type) {
			case ContainerMessageType.Attach:
			case ContainerMessageType.Alias:
			case ContainerMessageType.FluidDataStoreOp:
				this.channelCollection.process(
					messageWithContext.message,
					local,
					localOpMetadata,
					(from, to) => this.garbageCollector.addedOutboundReference(from, to),
				);
				break;
			case ContainerMessageType.BlobAttach:
				this.blobManager.processBlobAttachOp(messageWithContext.message, local);
				break;
			case ContainerMessageType.IdAllocation:
				// Don't re-finalize the range if we're processing a "savedOp" in
				// stashed ops flow. The compressor is stashed with these ops already processed.
				// That said, in idCompressorMode === "delayed", we might not serialize ID compressor, and
				// thus we need to process all the ops.
				if (!(this.skipSavedCompressorOps && messageWithContext.savedOp === true)) {
					const range = messageWithContext.message.contents;
					// Some other client turned on the id compressor. If we have not turned it on,
					// put it in a pending queue and delay finalization.
					if (this._idCompressor === undefined) {
						assert(
							this.idCompressorMode !== undefined,
							0x93c /* id compressor should be enabled */,
						);
						this.pendingIdCompressorOps.push(range);
					} else {
						assert(
							this.pendingIdCompressorOps.length === 0,
							0x979 /* there should be no pending ops! */,
						);
						this._idCompressor.finalizeCreationRange(range);
					}
				}
				break;
			case ContainerMessageType.GC:
				this.garbageCollector.processMessage(messageWithContext.message, local);
				break;
			case ContainerMessageType.ChunkedOp:
				// From observability POV, we should not exppse the rest of the system (including "op" events on object) to these messages.
				// Also resetReconnectCount() would be wrong - see comment that was there before this change was made.
				assert(false, 0x93d /* should not even get here */);
			case ContainerMessageType.Rejoin:
				break;
			case ContainerMessageType.DocumentSchemaChange:
				this.documentsSchemaController.processDocumentSchemaOp(
					messageWithContext.message.contents,
					messageWithContext.local,
					messageWithContext.message.sequenceNumber,
				);
				break;
			default: {
				// If we didn't necessarily expect a runtime message type, then no worries - just return
				// e.g. this case applies to system ops, or legacy ops that would have fallen into the above cases anyway.
				if (!messageWithContext.modernRuntimeMessage) {
					return;
				}

				const compatBehavior = messageWithContext.message.compatDetails?.behavior;
				if (
					!compatBehaviorAllowsMessageType(
						messageWithContext.message.type,
						compatBehavior,
					)
				) {
					const { message } = messageWithContext;
					const error = DataProcessingError.create(
						// Former assert 0x3ce
						"Runtime message of unknown type",
						"OpProcessing",
						message,
						{
							local,
							messageDetails: JSON.stringify({
								type: message.type,
								contentType: typeof message.contents,
								compatBehavior,
								batch: (message.metadata as IBatchMetadata | undefined)?.batch,
								compression: message.compression,
							}),
						},
					);
					this.closeFn(error);
					throw error;
				}
			}
		}
	}

	/**
	 * Emits the Signal event and update the perf signal data.
	 * @param clientSignalSequenceNumber - is the client signal sequence number to be uploaded.
	 */
	private sendSignalTelemetryEvent(clientSignalSequenceNumber: number) {
		const duration = Date.now() - this._perfSignalData.signalTimestamp;
		this.mc.logger.sendPerformanceEvent({
			eventName: "SignalLatency",
			duration,
			signalsLost: this._perfSignalData.signalsLost,
		});

		this._perfSignalData.signalsLost = 0;
		this._perfSignalData.signalTimestamp = 0;
	}

	public processSignal(message: ISignalMessage, local: boolean) {
		const envelope = message.content as ISignalEnvelope;
		const transformed: IInboundSignalMessage = {
			clientId: message.clientId,
			content: envelope.contents.content,
			type: envelope.contents.type,
		};

		// Only collect signal telemetry for messages sent by the current client.
		if (message.clientId === this.clientId && this.connected) {
			// Check to see if the signal was lost.
			if (
				this._perfSignalData.trackingSignalSequenceNumber !== undefined &&
				envelope.clientSignalSequenceNumber >
					this._perfSignalData.trackingSignalSequenceNumber
			) {
				this._perfSignalData.signalsLost++;
				this._perfSignalData.trackingSignalSequenceNumber = undefined;
				this.mc.logger.sendErrorEvent({
					eventName: "SignalLost",
					type: envelope.contents.type,
					signalsLost: this._perfSignalData.signalsLost,
					trackingSequenceNumber: this._perfSignalData.trackingSignalSequenceNumber,
					clientSignalSequenceNumber: envelope.clientSignalSequenceNumber,
				});
			} else if (
				envelope.clientSignalSequenceNumber ===
				this._perfSignalData.trackingSignalSequenceNumber
			) {
				// only logging for the first connection and the trackingSignalSequenceNUmber.
				if (this.consecutiveReconnects === 0) {
					this.sendSignalTelemetryEvent(envelope.clientSignalSequenceNumber);
				}
				this._perfSignalData.trackingSignalSequenceNumber = undefined;
			}
		}

		if (envelope.address === undefined) {
			// No address indicates a container signal message.
			this.emit("signal", transformed, local);
			return;
		}

		// Due to a mismatch between different layers in terms of
		// what is the interface of passing signals, we need to adjust
		// the signal envelope before sending it to the datastores to be processed
		const envelope2: IEnvelope = {
			address: envelope.address,
			contents: transformed.content,
		};
		transformed.content = envelope2;

		this.channelCollection.processSignal(transformed, local);
	}

	/**
	 * Flush the pending ops manually.
	 * This method is expected to be called at the end of a batch.
	 */
	private flush(): void {
		assert(
			this._orderSequentiallyCalls === 0,
			0x24c /* "Cannot call `flush()` from `orderSequentially`'s callback" */,
		);

		this.outbox.flush();
		assert(this.outbox.isEmpty, 0x3cf /* reentrancy */);
	}

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#IContainerRuntimeBase.orderSequentially}
	 */
	public orderSequentially<T>(callback: () => T): T {
		let checkpoint: IBatchCheckpoint | undefined;
		let result: T;
		if (this.mc.config.getBoolean("Fluid.ContainerRuntime.EnableRollback")) {
			// Note: we are not touching any batches other than mainBatch here, for two reasons:
			// 1. It would not help, as other batches are flushed independently from main batch.
			// 2. There is no way to undo process of data store creation, blob creation, ID compressor ops, or other things tracked by other batches.
			checkpoint = this.outbox.checkpoint().mainBatch;
		}
		try {
			this._orderSequentiallyCalls++;
			result = callback();
		} catch (error) {
			if (checkpoint) {
				// This will throw and close the container if rollback fails
				try {
					checkpoint.rollback((message: BatchMessage) =>
						this.rollback(message.contents, message.localOpMetadata),
					);
				} catch (err) {
					const error2 = wrapError(err, (message) => {
						return DataProcessingError.create(
							`RollbackError: ${message}`,
							"checkpointRollback",
							undefined,
						) as DataProcessingError;
					});
					this.closeFn(error2);
					throw error2;
				}
			} else {
				this.closeFn(
					wrapError(
						error,
						(errorMessage) =>
							new GenericError(
								`orderSequentially callback exception: ${errorMessage}`,
								error,
								{
									orderSequentiallyCalls: this._orderSequentiallyCalls,
								},
							),
					),
				);
			}

			throw error; // throw the original error for the consumer of the runtime
		} finally {
			this._orderSequentiallyCalls--;
		}

		// We don't flush on TurnBased since we expect all messages in the same JS turn to be part of the same batch
		if (this.flushMode !== FlushMode.TurnBased && this._orderSequentiallyCalls === 0) {
			this.flush();
		}
		return result;
	}

	/**
	 * Returns the aliased data store's entryPoint, given the alias.
	 * @param alias - The alias for the data store.
	 * @returns The data store's entry point ({@link @fluidframework/core-interfaces#IFluidHandle}) if it exists and is aliased.
	 * Returns undefined if no data store has been assigned the given alias.
	 */
	public async getAliasedDataStoreEntryPoint(
		alias: string,
	): Promise<IFluidHandle<FluidObject> | undefined> {
		// Back-comapatibility:
		// There are old files that were created without using data store aliasing feature, but
		// used createRoot*DataStore*() (already removed) API. Such data stores will have isRoot = true,
		// and internalID provided by user. The expectation is that such files behave as new files, where
		// same data store instances created using aliasing feature.
		// Please also see note on name collisions in DataStores.createDataStoreId()
		await this.channelCollection.waitIfPendingAlias(alias);
		const internalId = this.internalId(alias);
		const context = await this.channelCollection.getDataStoreIfAvailable(internalId, {
			wait: false,
		});
		// If the data store is not available or not an alias, return undefined.
		if (context === undefined || !(await context.isRoot())) {
			return undefined;
		}

		const channel = await context.realize();
		if (channel.entryPoint === undefined) {
			throw new UsageError(
				"entryPoint must be defined on data store runtime for using getAliasedDataStoreEntryPoint",
			);
		}
		this.garbageCollector.nodeUpdated({
			node: { type: "DataStore", path: `/${internalId}` },
			reason: "Loaded",
			packagePath: context.packagePath,
		});
		return channel.entryPoint;
	}

	public createDetachedDataStore(
		pkg: Readonly<string[]>,
		loadingGroupId?: string,
	): IFluidDataStoreContextDetached {
		return this.channelCollection.createDetachedDataStore(pkg, loadingGroupId);
	}

	public async createDataStore(
		pkg: Readonly<string | string[]>,
		loadingGroupId?: string,
	): Promise<IDataStore> {
		const context = this.channelCollection.createDataStoreContext(
			Array.isArray(pkg) ? pkg : [pkg],
			undefined, // props
			loadingGroupId,
		);
		return channelToDataStore(
			await context.realize(),
			context.id,
			this.channelCollection,
			this.mc.logger,
		);
	}

	/**
	 * @deprecated 0.16 Issue #1537, #3631
	 */
	public async _createDataStoreWithProps(
		pkg: Readonly<string | string[]>,
		props?: any,
	): Promise<IDataStore> {
		const context = this.channelCollection.createDataStoreContext(
			Array.isArray(pkg) ? pkg : [pkg],
			props,
		);
		return channelToDataStore(
			await context.realize(),
			context.id,
			this.channelCollection,
			this.mc.logger,
		);
	}

	private canSendOps() {
		// Note that the real (non-proxy) delta manager is needed here to get the readonly info. This is because
		// container runtime's ability to send ops depend on the actual readonly state of the delta manager.
		return (
			this.connected && !this.innerDeltaManager.readOnlyInfo.readonly && !this.imminentClosure
		);
	}

	/**
	 * Are we in the middle of batching ops together?
	 */
	private currentlyBatching() {
		return this.flushMode !== FlushMode.Immediate || this._orderSequentiallyCalls !== 0;
	}

	private readonly _quorum: IQuorumClients;
	public getQuorum(): IQuorumClients {
		return this._quorum;
	}

	private readonly _audience: IAudience;
	public getAudience(): IAudience {
		return this._audience;
	}

	/**
	 * Returns true of container is dirty, i.e. there are some pending local changes that
	 * either were not sent out to delta stream or were not yet acknowledged.
	 */
	public get isDirty(): boolean {
		return this.dirtyContainer;
	}

	private isContainerMessageDirtyable({ type, contents }: OutboundContainerRuntimeMessage) {
		// Certain container runtime messages should not mark the container dirty such as the old built-in
		// AgentScheduler and Garbage collector messages.
		switch (type) {
			case ContainerMessageType.Attach: {
				const attachMessage = contents as InboundAttachMessage;
				if (attachMessage.id === agentSchedulerId) {
					return false;
				}
				break;
			}
			case ContainerMessageType.FluidDataStoreOp: {
				const envelope = contents;
				if (envelope.address === agentSchedulerId) {
					return false;
				}
				break;
			}
			case ContainerMessageType.IdAllocation:
			case ContainerMessageType.DocumentSchemaChange:
			case ContainerMessageType.GC: {
				return false;
			}
			default:
				break;
		}
		return true;
	}

	private createNewSignalEnvelope(
		address: string | undefined,
		type: string,
		content: any,
	): ISignalEnvelope {
		const newSequenceNumber = ++this._perfSignalData.signalSequenceNumber;
		const newEnvelope: ISignalEnvelope = {
			address,
			clientSignalSequenceNumber: newSequenceNumber,
			contents: { type, content },
		};

		// We should not track any signals in case we already have a tracking number.
		if (
			newSequenceNumber % this.defaultTelemetrySignalSampleCount === 1 &&
			this._perfSignalData.trackingSignalSequenceNumber === undefined
		) {
			this._perfSignalData.signalTimestamp = Date.now();
			this._perfSignalData.trackingSignalSequenceNumber = newSequenceNumber;
		}

		return newEnvelope;
	}

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal. Should be a JSON serializable object or primitive.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	public submitSignal(type: string, content: unknown, targetClientId?: string) {
		this.verifyNotClosed();
		const envelope = this.createNewSignalEnvelope(undefined /* address */, type, content);
		return this.submitSignalFn(envelope, targetClientId);
	}

	public setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void {
		if (attachState === AttachState.Attaching) {
			assert(
				this.attachState === AttachState.Attaching,
				0x12d /* "Container Context should already be in attaching state" */,
			);
		} else {
			assert(
				this.attachState === AttachState.Attached,
				0x12e /* "Container Context should already be in attached state" */,
			);
			this.emit("attached");
		}

		if (attachState === AttachState.Attached && !this.hasPendingMessages()) {
			this.updateDocumentDirtyState(false);
		}
		this.channelCollection.setAttachState(attachState);
	}

	/**
	 * Create a summary. Used when attaching or serializing a detached container.
	 *
	 * @param blobRedirectTable - A table passed during the attach process. While detached, blob upload is supported
	 * using IDs generated locally. After attach, these IDs cannot be used, so this table maps the old local IDs to the
	 * new storage IDs so requests can be redirected.
	 * @param telemetryContext - summary data passed through the layers for telemetry purposes
	 */
	public createSummary(
		blobRedirectTable?: Map<string, string>,
		telemetryContext?: ITelemetryContext,
	): ISummaryTree {
		if (blobRedirectTable) {
			this.blobManager.setRedirectTable(blobRedirectTable);
		}

		// We can finalize any allocated IDs since we're the only client
		const idRange = this._idCompressor?.takeNextCreationRange();
		if (idRange !== undefined) {
			assert(
				idRange.ids === undefined || idRange.ids.firstGenCount === 1,
				0x93e /* No other ranges should be taken while container is detached. */,
			);
			this._idCompressor?.finalizeCreationRange(idRange);
		}

		const summarizeResult = this.channelCollection.getAttachSummary(telemetryContext);
		// Wrap data store summaries in .channels subtree.
		wrapSummaryInChannelsTree(summarizeResult);

		this.addContainerStateToSummary(
			summarizeResult,
			true /* fullTree */,
			false /* trackState */,
			telemetryContext,
		);
		return summarizeResult.summary;
	}

	public readonly getAbsoluteUrl: (relativeUrl: string) => Promise<string | undefined>;

	private async summarizeInternal(
		fullTree: boolean,
		trackState: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummarizeInternalResult> {
		const summarizeResult = await this.channelCollection.summarize(
			fullTree,
			trackState,
			telemetryContext,
		);

		// Wrap data store summaries in .channels subtree.
		wrapSummaryInChannelsTree(summarizeResult);
		const pathPartsForChildren = [channelsTreeName];

		// Ensure that ID compressor had a chance to load, if we are using delayed mode.
		await this.loadIdCompressor();

		this.addContainerStateToSummary(summarizeResult, fullTree, trackState, telemetryContext);
		return {
			...summarizeResult,
			id: "",
			pathPartsForChildren,
		};
	}

	/**
	 * Returns a summary of the runtime at the current sequence number.
	 */
	public async summarize(options: {
		/** True to generate the full tree with no handle reuse optimizations; defaults to false */
		fullTree?: boolean;
		/** True to track the state for this summary in the SummarizerNodes; defaults to true */
		trackState?: boolean;
		/** Logger to use for correlated summary events */
		summaryLogger?: ITelemetryLoggerExt;
		/** True to run garbage collection before summarizing; defaults to true */
		runGC?: boolean;
		/** True to generate full GC data */
		fullGC?: boolean;
		/** True to run GC sweep phase after the mark phase */
		runSweep?: boolean;
	}): Promise<ISummaryTreeWithStats> {
		this.verifyNotClosed();

		const {
			fullTree = false,
			trackState = true,
			summaryLogger = this.mc.logger,
			runGC = this.garbageCollector.shouldRunGC,
			runSweep,
			fullGC,
		} = options;

		const telemetryContext = new TelemetryContext();
		// Add the options that are used to generate this summary to the telemetry context.
		telemetryContext.setMultiple("fluid_Summarize", "Options", {
			fullTree,
			trackState,
			runGC,
			fullGC,
			runSweep,
		});

		try {
			if (runGC) {
				await this.collectGarbage(
					{ logger: summaryLogger, runSweep, fullGC },
					telemetryContext,
				);
			}

			const { stats, summary } = await this.summarizerNode.summarize(
				fullTree,
				trackState,
				telemetryContext,
			);

			assert(
				summary.type === SummaryType.Tree,
				0x12f /* "Container Runtime's summarize should always return a tree" */,
			);

			return { stats, summary };
		} finally {
			summaryLogger.sendTelemetryEvent({
				eventName: "SummarizeTelemetry",
				details: telemetryContext.serialize(),
			});
		}
	}

	/**
	 * Before GC runs, called by the garbage collector to update any pending GC state. This is mainly used to notify
	 * the garbage collector of references detected since the last GC run. Most references are notified immediately
	 * but there can be some for which async operation is required (such as detecting new root data stores).
	 * @see IGarbageCollectionRuntime.updateStateBeforeGC
	 */
	public async updateStateBeforeGC() {
		return this.channelCollection.updateStateBeforeGC();
	}

	private async getGCDataInternal(fullGC?: boolean): Promise<IGarbageCollectionData> {
		return this.channelCollection.getGCData(fullGC);
	}

	/**
	 * Generates and returns the GC data for this container.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 * @see IGarbageCollectionRuntime.getGCData
	 */
	public async getGCData(fullGC?: boolean): Promise<IGarbageCollectionData> {
		const builder = new GCDataBuilder();
		const dsGCData = await this.summarizerNode.getGCData(fullGC);
		builder.addNodes(dsGCData.gcNodes);

		const blobsGCData = this.blobManager.getGCData(fullGC);
		builder.addNodes(blobsGCData.gcNodes);
		return builder.getGCData();
	}

	/**
	 * After GC has run, called to notify this container's nodes of routes that are used in it.
	 * @param usedRoutes - The routes that are used in all nodes in this Container.
	 * @see IGarbageCollectionRuntime.updateUsedRoutes
	 */
	public updateUsedRoutes(usedRoutes: readonly string[]) {
		// Update our summarizer node's used routes. Updating used routes in summarizer node before
		// summarizing is required and asserted by the the summarizer node. We are the root and are
		// always referenced, so the used routes is only self-route (empty string).
		this.summarizerNode.updateUsedRoutes([""]);

		const { dataStoreRoutes } = this.getDataStoreAndBlobManagerRoutes(usedRoutes);
		this.channelCollection.updateUsedRoutes(dataStoreRoutes);
	}

	/**
	 * After GC has run and identified nodes that are sweep ready, this is called to delete the sweep ready nodes.
	 * @param sweepReadyRoutes - The routes of nodes that are sweep ready and should be deleted.
	 * @returns The routes of nodes that were deleted.
	 */
	public deleteSweepReadyNodes(sweepReadyRoutes: readonly string[]): readonly string[] {
		const { dataStoreRoutes, blobManagerRoutes } =
			this.getDataStoreAndBlobManagerRoutes(sweepReadyRoutes);

		const deletedRoutes = this.channelCollection.deleteSweepReadyNodes(dataStoreRoutes);
		return deletedRoutes.concat(this.blobManager.deleteSweepReadyNodes(blobManagerRoutes));
	}

	/**
	 * This is called to update objects that are tombstones.
	 *
	 * A Tombstoned object has been unreferenced long enough that GC knows it won't be referenced again.
	 * Tombstoned objects are eventually deleted by GC.
	 *
	 * @param tombstonedRoutes - Data store and attachment blob routes that are tombstones in this Container.
	 */
	public updateTombstonedRoutes(tombstonedRoutes: readonly string[]) {
		const { blobManagerRoutes, dataStoreRoutes } =
			this.getDataStoreAndBlobManagerRoutes(tombstonedRoutes);
		this.blobManager.updateTombstonedRoutes(blobManagerRoutes);
		this.channelCollection.updateTombstonedRoutes(dataStoreRoutes);
	}

	/**
	 * Returns a server generated referenced timestamp to be used to track unreferenced nodes by GC.
	 */
	public getCurrentReferenceTimestampMs(): number | undefined {
		// Use the timestamp of the last message seen by this client as that is server generated. If no messages have
		// been processed, use the timestamp of the message from the last summary.
		return this.deltaManager.lastMessage?.timestamp ?? this.messageAtLastSummary?.timestamp;
	}

	/**
	 * Returns the type of the GC node. Currently, there are nodes that belong to the root ("/"), data stores or
	 * blob manager.
	 */
	public getNodeType(nodePath: string): GCNodeType {
		if (this.isBlobPath(nodePath)) {
			return GCNodeType.Blob;
		}
		return this.channelCollection.getGCNodeType(nodePath) ?? GCNodeType.Other;
	}

	/**
	 * Called by GC to retrieve the package path of the node with the given path. The node should belong to a
	 * data store or an attachment blob.
	 */
	public async getGCNodePackagePath(nodePath: string): Promise<readonly string[] | undefined> {
		// GC uses "/" when adding "root" references, e.g. for Aliasing or as part of Tombstone Auto-Recovery.
		// These have no package path so return a special value.
		if (nodePath === "/") {
			return ["_gcRoot"];
		}

		switch (this.getNodeType(nodePath)) {
			case GCNodeType.Blob:
				return [BlobManager.basePath];
			case GCNodeType.DataStore:
			case GCNodeType.SubDataStore:
				return this.channelCollection.getDataStorePackagePath(nodePath);
			default:
				assert(false, 0x2de /* "Package path requested for unsupported node type." */);
		}
	}

	/**
	 * Returns whether a given path is for attachment blobs that are in the format - "/BlobManager.basePath/...".
	 */
	private isBlobPath(path: string): boolean {
		const pathParts = path.split("/");
		if (pathParts.length < 2 || pathParts[1] !== BlobManager.basePath) {
			return false;
		}
		return true;
	}

	/**
	 * From a given list of routes, separate and return routes that belong to blob manager and data stores.
	 * @param routes - A list of routes that can belong to data stores or blob manager.
	 * @returns Two route lists - One that contains routes for blob manager and another one that contains routes
	 * for data stores.
	 */
	private getDataStoreAndBlobManagerRoutes(routes: readonly string[]) {
		const blobManagerRoutes: string[] = [];
		const dataStoreRoutes: string[] = [];
		for (const route of routes) {
			if (this.isBlobPath(route)) {
				blobManagerRoutes.push(route);
			} else {
				dataStoreRoutes.push(route);
			}
		}
		return { blobManagerRoutes, dataStoreRoutes };
	}

	/**
	 * Runs garbage collection and updates the reference / used state of the nodes in the container.
	 * @returns the statistics of the garbage collection run; undefined if GC did not run.
	 */
	public async collectGarbage(
		options: {
			/** Logger to use for logging GC events */
			logger?: ITelemetryLoggerExt;
			/** True to run GC sweep phase after the mark phase */
			runSweep?: boolean;
			/** True to generate full GC data */
			fullGC?: boolean;
		},
		telemetryContext?: ITelemetryContext,
	): Promise<IGCStats | undefined> {
		return this.garbageCollector.collectGarbage(options, telemetryContext);
	}

	/**
	 * Called when a new outbound reference is added to another node. This is used by garbage collection to identify
	 * all references added in the system.
	 * @param srcHandle - The handle of the node that added the reference.
	 * @param outboundHandle - The handle of the outbound node that is referenced.
	 */
	public addedGCOutboundReference(
		srcHandle: { absolutePath: string },
		outboundHandle: { absolutePath: string },
	) {
		this.garbageCollector.addedOutboundReference(
			srcHandle.absolutePath,
			outboundHandle.absolutePath,
		);
	}

	/**
	 * Generates the summary tree, uploads it to storage, and then submits the summarize op.
	 * This is intended to be called by the summarizer, since it is the implementation of
	 * ISummarizerInternalsProvider.submitSummary.
	 * It takes care of state management at the container level, including pausing inbound
	 * op processing, updating SummarizerNode state tracking, and garbage collection.
	 * @param options - options controlling how the summary is generated or submitted
	 */
	public async submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult> {
		const {
			fullTree = false,
			finalAttempt = false,
			summaryLogger,
			latestSummaryRefSeqNum,
		} = options;
		// The summary number for this summary. This will be updated during the summary process, so get it now and
		// use it for all events logged during this summary.
		const summaryNumber = this.nextSummaryNumber;
		let summaryRefSeqNum: number | undefined;
		const summaryNumberLogger = createChildLogger({
			logger: summaryLogger,
			properties: {
				all: {
					summaryNumber,
					referenceSequenceNumber: () => summaryRefSeqNum,
				},
			},
		});

		assert(this.outbox.isEmpty, 0x3d1 /* Can't trigger summary in the middle of a batch */);

		// If the container is dirty, i.e., there are pending unacked ops, the summary will not be eventual consistent
		// and it may even be incorrect. So, wait for the container to be saved with a timeout. If the container is not
		// saved within the timeout, check if it should be failed or can continue.
		if (this.isDirty) {
			const countBefore = this.pendingMessagesCount;
			// The timeout for waiting for pending ops can be overridden via configurations.
			const pendingOpsTimeout =
				this.mc.config.getNumber("Fluid.Summarizer.waitForPendingOpsTimeoutMs") ??
				defaultPendingOpsWaitTimeoutMs;
			await new Promise<void>((resolve, reject) => {
				const timeoutId = setTimeout(() => resolve(), pendingOpsTimeout);
				this.once("saved", () => {
					clearTimeout(timeoutId);
					resolve();
				});
				this.once("dispose", () => {
					clearTimeout(timeoutId);
					reject(new Error("Runtime is disposed while summarizing"));
				});
			});

			// Log that there are pending ops while summarizing. This will help us gather data on how often this
			// happens, whether we attempted to wait for these ops to be acked and what was the result.
			summaryNumberLogger.sendTelemetryEvent({
				eventName: "PendingOpsWhileSummarizing",
				saved: !this.isDirty,
				timeout: pendingOpsTimeout,
				countBefore,
				countAfter: this.pendingMessagesCount,
			});

			// There could still be pending ops. Check if summary should fail or continue.
			const pendingMessagesFailResult = await this.shouldFailSummaryOnPendingOps(
				summaryNumberLogger,
				this.deltaManager.lastSequenceNumber,
				this.deltaManager.minimumSequenceNumber,
				finalAttempt,
				true /* beforeSummaryGeneration */,
			);
			if (pendingMessagesFailResult !== undefined) {
				return pendingMessagesFailResult;
			}
		}

		const shouldPauseInboundSignal =
			this.mc.config.getBoolean(
				"Fluid.ContainerRuntime.SubmitSummary.disableInboundSignalPause",
			) !== true;
		const shouldValidatePreSummaryState =
			this.mc.config.getBoolean(
				"Fluid.ContainerRuntime.SubmitSummary.shouldValidatePreSummaryState",
			) === true;

		try {
			await this.deltaManager.inbound.pause();
			if (shouldPauseInboundSignal) {
				await this.deltaManager.inboundSignal.pause();
			}

			summaryRefSeqNum = this.deltaManager.lastSequenceNumber;
			const minimumSequenceNumber = this.deltaManager.minimumSequenceNumber;
			const message = `Summary @${summaryRefSeqNum}:${this.deltaManager.minimumSequenceNumber}`;
			const lastAck = this.summaryCollection.latestAck;

			const startSummaryResult = this.summarizerNode.startSummary(
				summaryRefSeqNum,
				summaryNumberLogger,
				latestSummaryRefSeqNum,
			);

			/**
			 * This was added to validate that the summarizer node tree has the same reference sequence number from the
			 * top running summarizer down to the lowest summarizer node.
			 *
			 * The order of mismatch numbers goes (validate sequence number)-(node sequence number).
			 * Generally the validate sequence number comes from the running summarizer and the node sequence number comes from the
			 * summarizer nodes.
			 */
			if (
				startSummaryResult.invalidNodes > 0 ||
				startSummaryResult.mismatchNumbers.size > 0
			) {
				summaryLogger.sendTelemetryEvent({
					eventName: "LatestSummaryRefSeqNumMismatch",
					details: {
						...startSummaryResult,
						mismatchNumbers: Array.from(startSummaryResult.mismatchNumbers),
					},
				});

				if (shouldValidatePreSummaryState && !finalAttempt) {
					return {
						stage: "base",
						referenceSequenceNumber: summaryRefSeqNum,
						minimumSequenceNumber,
						error: new RetriableSummaryError(
							`Summarizer node state inconsistent with summarizer state.`,
						),
					};
				}
			}

			// Helper function to check whether we should still continue between each async step.
			const checkContinue = (): { continue: true } | { continue: false; error: string } => {
				// Do not check for loss of connectivity directly! Instead leave it up to
				// RunWhileConnectedCoordinator to control policy in a single place.
				// This will allow easier change of design if we chose to. For example, we may chose to allow
				// summarizer to reconnect in the future.
				// Also checking for cancellation is a must as summary process may be abandoned for other reasons,
				// like loss of connectivity for main (interactive) client.
				if (options.cancellationToken.cancelled) {
					return { continue: false, error: "disconnected" };
				}
				// That said, we rely on submitSystemMessage() that today only works in connected state.
				// So if we fail here, it either means that RunWhileConnectedCoordinator does not work correctly,
				// OR that design changed and we need to remove this check and fix submitSystemMessage.
				assert(this.connected, 0x258 /* "connected" */);

				// Ensure that lastSequenceNumber has not changed after pausing.
				// We need the summary op's reference sequence number to match our summary sequence number,
				// otherwise we'll get the wrong sequence number stamped on the summary's .protocol attributes.
				if (this.deltaManager.lastSequenceNumber !== summaryRefSeqNum) {
					return {
						continue: false,
						error: `lastSequenceNumber changed before uploading to storage. ${this.deltaManager.lastSequenceNumber} !== ${summaryRefSeqNum}`,
					};
				}
				assert(
					summaryRefSeqNum === this.deltaManager.lastMessage?.sequenceNumber,
					0x395 /* it's one and the same thing */,
				);

				if (lastAck !== this.summaryCollection.latestAck) {
					return {
						continue: false,
						error: `Last summary changed while summarizing. ${this.summaryCollection.latestAck} !== ${lastAck}`,
					};
				}
				return { continue: true };
			};

			let continueResult = checkContinue();
			if (!continueResult.continue) {
				return {
					stage: "base",
					referenceSequenceNumber: summaryRefSeqNum,
					minimumSequenceNumber,
					error: new RetriableSummaryError(continueResult.error),
				};
			}

			const trace = Trace.start();
			let summarizeResult: ISummaryTreeWithStats;
			try {
				summarizeResult = await this.summarize({
					fullTree,
					trackState: true,
					summaryLogger: summaryNumberLogger,
					runGC: this.garbageCollector.shouldRunGC,
				});
			} catch (error) {
				return {
					stage: "base",
					referenceSequenceNumber: summaryRefSeqNum,
					minimumSequenceNumber,
					error: wrapError(error, (msg) => new RetriableSummaryError(msg)),
				};
			}

			// Validate that the summary generated by summarizer nodes is correct before uploading.
			const validateResult = this.summarizerNode.validateSummary();
			if (!validateResult.success) {
				const { success, ...loggingProps } = validateResult;
				const error = new RetriableSummaryError(
					validateResult.reason,
					validateResult.retryAfterSeconds,
					{ ...loggingProps },
				);
				return {
					stage: "base",
					referenceSequenceNumber: summaryRefSeqNum,
					minimumSequenceNumber,
					error,
				};
			}

			// If there are pending unacked ops, this summary attempt may fail as the uploaded
			// summary would be eventually inconsistent.
			const pendingMessagesFailResult = await this.shouldFailSummaryOnPendingOps(
				summaryNumberLogger,
				summaryRefSeqNum,
				minimumSequenceNumber,
				finalAttempt,
				false /* beforeSummaryGeneration */,
			);
			if (pendingMessagesFailResult !== undefined) {
				return pendingMessagesFailResult;
			}

			const { summary: summaryTree, stats: partialStats } = summarizeResult;

			// Now that we have generated the summary, update the message at last summary to the last message processed.
			this.messageAtLastSummary = this.deltaManager.lastMessage;

			// Counting dataStores and handles
			// Because handles are unchanged dataStores in the current logic,
			// summarized dataStore count is total dataStore count minus handle count
			const dataStoreTree = summaryTree.tree[channelsTreeName];

			assert(dataStoreTree.type === SummaryType.Tree, 0x1fc /* "summary is not a tree" */);
			const handleCount = Object.values(dataStoreTree.tree).filter(
				(value) => value.type === SummaryType.Handle,
			).length;
			const gcSummaryTreeStats = summaryTree.tree[gcTreeKey]
				? calculateStats(summaryTree.tree[gcTreeKey])
				: undefined;

			const summaryStats: IGeneratedSummaryStats = {
				dataStoreCount: this.channelCollection.size,
				summarizedDataStoreCount: this.channelCollection.size - handleCount,
				gcStateUpdatedDataStoreCount: this.garbageCollector.updatedDSCountSinceLastSummary,
				gcBlobNodeCount: gcSummaryTreeStats?.blobNodeCount,
				gcTotalBlobsSize: gcSummaryTreeStats?.totalBlobSize,
				summaryNumber,
				...partialStats,
			};
			const generateSummaryData: Omit<IGenerateSummaryTreeResult, "stage" | "error"> = {
				referenceSequenceNumber: summaryRefSeqNum,
				minimumSequenceNumber,
				summaryTree,
				summaryStats,
				generateDuration: trace.trace().duration,
			} as const;

			continueResult = checkContinue();
			if (!continueResult.continue) {
				return {
					stage: "generate",
					...generateSummaryData,
					error: new RetriableSummaryError(continueResult.error),
				};
			}

			const summaryContext =
				lastAck === undefined
					? {
							proposalHandle: undefined,
							ackHandle: this.loadedFromVersionId,
							referenceSequenceNumber: summaryRefSeqNum,
					  }
					: {
							proposalHandle: lastAck.summaryOp.contents.handle,
							ackHandle: lastAck.summaryAck.contents.handle,
							referenceSequenceNumber: summaryRefSeqNum,
					  };

			let handle: string;
			try {
				handle = await this.storage.uploadSummaryWithContext(
					summarizeResult.summary,
					summaryContext,
				);
			} catch (error) {
				return {
					stage: "generate",
					...generateSummaryData,
					error: wrapError(error, (msg) => new RetriableSummaryError(msg)),
				};
			}

			const parent = summaryContext.ackHandle;
			const summaryMessage: ISummaryContent = {
				handle,
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				head: parent!,
				message,
				parents: parent ? [parent] : [],
			};
			const uploadData = {
				...generateSummaryData,
				handle,
				uploadDuration: trace.trace().duration,
			} as const;

			continueResult = checkContinue();
			if (!continueResult.continue) {
				return {
					stage: "upload",
					...uploadData,
					error: new RetriableSummaryError(continueResult.error),
				};
			}

			let clientSequenceNumber: number;
			try {
				clientSequenceNumber = this.submitSummaryMessage(summaryMessage, summaryRefSeqNum);
			} catch (error) {
				return {
					stage: "upload",
					...uploadData,
					error: wrapError(error, (msg) => new RetriableSummaryError(msg)),
				};
			}

			const submitData = {
				stage: "submit",
				...uploadData,
				clientSequenceNumber,
				submitOpDuration: trace.trace().duration,
			} as const;

			try {
				this.summarizerNode.completeSummary(handle);
			} catch (error) {
				return {
					stage: "upload",
					...uploadData,
					error: wrapError(error, (msg) => new RetriableSummaryError(msg)),
				};
			}
			return submitData;
		} finally {
			// Cleanup wip summary in case of failure
			this.summarizerNode.clearSummary();

			// ! This needs to happen before we resume inbound queues to ensure heuristics are tracked correctly
			this._summarizer?.recordSummaryAttempt?.(summaryRefSeqNum);

			// Restart the delta manager
			this.deltaManager.inbound.resume();
			if (shouldPauseInboundSignal) {
				this.deltaManager.inboundSignal.resume();
			}
		}
	}

	/**
	 * This helper is called during summarization. If the container is dirty, it will return a failed summarize result
	 * (IBaseSummarizeResult) unless this is the final summarize attempt and SkipFailingIncorrectSummary option is set.
	 * @param logger - The logger to be used for sending telemetry.
	 * @param referenceSequenceNumber - The reference sequence number of the summary attempt.
	 * @param minimumSequenceNumber - The minimum sequence number of the summary attempt.
	 * @param finalAttempt - Whether this is the final summary attempt.
	 * @param beforeSummaryGeneration - Whether this is called before summary generation or after.
	 * @returns failed summarize result (IBaseSummarizeResult) if summary should be failed, undefined otherwise.
	 */
	private async shouldFailSummaryOnPendingOps(
		logger: ITelemetryLoggerExt,
		referenceSequenceNumber: number,
		minimumSequenceNumber: number,
		finalAttempt: boolean,
		beforeSummaryGeneration: boolean,
	): Promise<IBaseSummarizeResult | undefined> {
		if (!this.isDirty) {
			return;
		}

		// If "SkipFailingIncorrectSummary" option is true, don't fail the summary in the last attempt.
		// This is a fallback to make progress in documents where there are consistently pending ops in
		// the summarizer.
		if (
			finalAttempt &&
			this.mc.config.getBoolean("Fluid.Summarizer.SkipFailingIncorrectSummary")
		) {
			const error = DataProcessingError.create(
				"Pending ops during summarization",
				"submitSummary",
				undefined,
				{ pendingMessages: this.pendingMessagesCount },
			);
			logger.sendErrorEvent(
				{
					eventName: "SkipFailingIncorrectSummary",
					referenceSequenceNumber,
					minimumSequenceNumber,
					beforeGenerate: beforeSummaryGeneration,
				},
				error,
			);
		} else {
			// The retry delay when there are pending ops can be overridden via config so that we can adjust it
			// based on telemetry while we decide on a stable number.
			const retryDelayMs =
				this.mc.config.getNumber("Fluid.Summarizer.PendingOpsRetryDelayMs") ??
				defaultPendingOpsRetryDelayMs;
			const error = new RetriableSummaryError(
				"PendingOpsWhileSummarizing",
				retryDelayMs / 1000,
				{
					count: this.pendingMessagesCount,
					beforeGenerate: beforeSummaryGeneration,
				},
			);
			return {
				stage: "base",
				referenceSequenceNumber,
				minimumSequenceNumber,
				error,
			};
		}
	}

	private get pendingMessagesCount(): number {
		return this.pendingStateManager.pendingMessagesCount + this.outbox.messageCount;
	}

	private hasPendingMessages() {
		return this.pendingMessagesCount !== 0;
	}

	private updateDocumentDirtyState(dirty: boolean) {
		if (this.attachState !== AttachState.Attached) {
			assert(dirty, 0x3d2 /* Non-attached container is dirty */);
		} else {
			// Other way is not true = see this.isContainerMessageDirtyable()
			assert(
				!dirty || this.hasPendingMessages(),
				0x3d3 /* if doc is dirty, there has to be pending ops */,
			);
		}

		if (this.dirtyContainer === dirty) {
			return;
		}

		this.dirtyContainer = dirty;
		if (this.emitDirtyDocumentEvent) {
			this.emit(dirty ? "dirty" : "saved");
		}
	}

	public submitMessage(
		type:
			| ContainerMessageType.FluidDataStoreOp
			| ContainerMessageType.Alias
			| ContainerMessageType.Attach,
		contents: any,
		localOpMetadata: unknown = undefined,
	): void {
		this.submit({ type, contents }, localOpMetadata);
	}

	public async uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternal<ArrayBufferLike>> {
		this.verifyNotClosed();
		return this.blobManager.createBlob(blob, signal);
	}

	private submitIdAllocationOpIfNeeded(resubmitOutstandingRanges: boolean): void {
		if (this._idCompressor) {
			const idRange = resubmitOutstandingRanges
				? this._idCompressor.takeUnfinalizedCreationRange()
				: this._idCompressor.takeNextCreationRange();
			// Don't include the idRange if there weren't any Ids allocated
			if (idRange.ids !== undefined) {
				const idAllocationMessage: ContainerRuntimeIdAllocationMessage = {
					type: ContainerMessageType.IdAllocation,
					contents: idRange,
				};
				const idAllocationBatchMessage: BatchMessage = {
					contents: JSON.stringify(idAllocationMessage),
					referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
				};
				this.outbox.submitIdAllocation(idAllocationBatchMessage);
			}
		}
	}

	private submit(
		containerRuntimeMessage: OutboundContainerRuntimeMessage,
		localOpMetadata: unknown = undefined,
		metadata?: { localId: string; blobId?: string },
	): void {
		this.verifyNotClosed();

		// There should be no ops in detached container state!
		assert(
			this.attachState !== AttachState.Detached,
			0x132 /* "sending ops in detached container" */,
		);

		assert(
			metadata === undefined ||
				containerRuntimeMessage.type === ContainerMessageType.BlobAttach,
			0x93f /* metadata */,
		);

		const serializedContent = JSON.stringify(containerRuntimeMessage);

		// Note that the real (non-proxy) delta manager is used here to get the readonly info. This is because
		// container runtime's ability to submit ops depend on the actual readonly state of the delta manager.
		if (this.innerDeltaManager.readOnlyInfo.readonly) {
			this.mc.logger.sendTelemetryEvent({
				eventName: "SubmitOpInReadonly",
				connected: this.connected,
			});
		}

		const type = containerRuntimeMessage.type;
		assert(
			type !== ContainerMessageType.IdAllocation,
			"IdAllocation should be submitted directly to outbox.",
		);
		const message: BatchMessage = {
			contents: serializedContent,
			metadata,
			localOpMetadata,
			referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
		};

		try {
			this.submitIdAllocationOpIfNeeded(false);

			// Allow document schema controller to send a message if it needs to propose change in document schema.
			// If it needs to send a message, it will call provided callback with payload of such message and rely
			// on this callback to do actual sending.
			const contents = this.documentsSchemaController.maybeSendSchemaMessage();
			if (contents) {
				this.logger.sendTelemetryEvent({
					eventName: "SchemaChangeProposal",
					refSeq: contents.refSeq,
					version: contents.version,
					newRuntimeSchema: JSON.stringify(contents.runtime),
					sessionRuntimeSchema: JSON.stringify(this.sessionSchema),
					oldRuntimeSchema: JSON.stringify(this.metadata?.documentSchema?.runtime),
				});
				const msg: ContainerRuntimeDocumentSchemaMessage = {
					type: ContainerMessageType.DocumentSchemaChange,
					contents,
				};
				this.outbox.submit({
					contents: JSON.stringify(msg),
					referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
				});
			}

			if (type === ContainerMessageType.BlobAttach) {
				// BlobAttach ops must have their metadata visible and cannot be grouped (see opGroupingManager.ts)
				this.outbox.submitBlobAttach(message);
			} else {
				this.outbox.submit(message);
			}

			if (!this.currentlyBatching()) {
				this.flush();
			} else {
				this.scheduleFlush();
			}
		} catch (error) {
			this.closeFn(error as GenericError);
			throw error;
		}

		if (this.isContainerMessageDirtyable(containerRuntimeMessage)) {
			this.updateDocumentDirtyState(true);
		}
	}

	private scheduleFlush() {
		if (this.flushTaskExists) {
			return;
		}

		this.flushTaskExists = true;
		const flush = () => {
			this.flushTaskExists = false;
			try {
				this.flush();
			} catch (error) {
				this.closeFn(error as GenericError);
			}
		};

		switch (this.flushMode) {
			case FlushMode.TurnBased:
				// When in TurnBased flush mode the runtime will buffer operations in the current turn and send them as a single
				// batch at the end of the turn
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				Promise.resolve().then(flush);
				break;

			// FlushModeExperimental is experimental and not exposed directly in the runtime APIs
			case FlushModeExperimental.Async as unknown as FlushMode:
				// When in Async flush mode, the runtime will accumulate all operations across JS turns and send them as a single
				// batch when all micro-tasks are complete.
				// Compared to TurnBased, this flush mode will capture more ops into the same batch.
				setTimeout(flush, 0);
				break;

			default:
				assert(
					this._orderSequentiallyCalls > 0,
					0x587 /* Unreachable unless running under orderSequentially */,
				);
				break;
		}
	}

	private submitSummaryMessage(contents: ISummaryContent, referenceSequenceNumber: number) {
		this.verifyNotClosed();
		assert(
			this.connected,
			0x133 /* "Container disconnected when trying to submit system message" */,
		);

		// System message should not be sent in the middle of the batch.
		assert(this.outbox.isEmpty, 0x3d4 /* System op in the middle of a batch */);

		// back-compat: ADO #1385: Make this call unconditional in the future
		return this.submitSummaryFn !== undefined
			? this.submitSummaryFn(contents, referenceSequenceNumber)
			: this.submitFn(MessageType.Summarize, contents, false);
	}

	/**
	 * Throw an error if the runtime is closed.  Methods that are expected to potentially
	 * be called after dispose due to asynchrony should not call this.
	 */
	private verifyNotClosed() {
		if (this._disposed) {
			throw new Error("Runtime is closed");
		}
	}

	private reSubmitBatch(batch: IPendingBatchMessage[]) {
		this.orderSequentially(() => {
			for (const message of batch) {
				this.reSubmit(message);
			}
		});
		this.flush();
	}

	private reSubmit(message: IPendingBatchMessage) {
		// Need to parse from string for back-compat
		const containerRuntimeMessage = this.parseLocalOpContent(message.content);
		this.reSubmitCore(containerRuntimeMessage, message.localOpMetadata, message.opMetadata);
	}

	/**
	 * Finds the right store and asks it to resubmit the message. This typically happens when we
	 * reconnect and there are pending messages.
	 * ! Note: successfully resubmitting an op that has been successfully sequenced is not possible due to checks in the ConnectionStateHandler (Loader layer)
	 * @param message - The original LocalContainerRuntimeMessage.
	 * @param localOpMetadata - The local metadata associated with the original message.
	 */
	private reSubmitCore(
		message: LocalContainerRuntimeMessage,
		localOpMetadata: unknown,
		opMetadata: Record<string, unknown> | undefined,
	) {
		assert(
			!this.isSummarizerClient,
			0x8f2 /* Summarizer never reconnects so should never resubmit */,
		);
		switch (message.type) {
			case ContainerMessageType.FluidDataStoreOp:
			case ContainerMessageType.Attach:
			case ContainerMessageType.Alias:
				// For Operations, call resubmitDataStoreOp which will find the right store
				// and trigger resubmission on it.
				this.channelCollection.reSubmit(message.type, message.contents, localOpMetadata);
				break;
			case ContainerMessageType.IdAllocation: {
				// Allocation ops are never resubmitted/rebased. This is because they require special handling to
				// avoid being submitted out of order. For example, if the pending state manager contained
				// [idOp1, dataOp1, idOp2, dataOp2] and the resubmission of dataOp1 generated idOp3, that would be
				// placed into the outbox in the same batch as idOp1, but before idOp2 is resubmitted.
				// To avoid this, allocation ops are simply never resubmitted. Prior to invoking the pending state
				// manager to replay pending ops, the runtime will always submit a new allocation range that includes
				// all pending IDs. The resubmitted allocation ops are then ignored here.
				break;
			}
			case ContainerMessageType.BlobAttach:
				this.blobManager.reSubmit(opMetadata);
				break;
			case ContainerMessageType.Rejoin:
				this.submit(message);
				break;
			case ContainerMessageType.GC:
				this.submit(message);
				break;
			case ContainerMessageType.DocumentSchemaChange:
				// There is no need to resend this message. Document schema controller will properly resend it again (if needed)
				// on a first occasion (any ops sent after reconnect). There is a good chance, though, that it will not want to
				// send any ops, as some other client already changed schema.
				break;
			default: {
				// This case should be very rare - it would imply an op was stashed from a
				// future version of runtime code and now is being applied on an older version.
				const compatBehavior = message.compatDetails?.behavior;
				if (compatBehaviorAllowsMessageType(message.type, compatBehavior)) {
					// We do not ultimately resubmit it, to be consistent with this version of the code.
					this.logger.sendTelemetryEvent({
						eventName: "resubmitUnrecognizedMessageTypeAllowed",
						messageDetails: { type: message.type, compatBehavior },
					});
				} else {
					const error = DataProcessingError.create(
						"Resubmitting runtime message of unexpected type",
						"reSubmitCore",
						undefined /* sequencedMessage */,
						{
							messageDetails: JSON.stringify({
								type: message.type,
								compatBehavior,
							}),
						},
					);
					this.closeFn(error);
					throw error;
				}
			}
		}
	}

	private rollback(content: string | undefined, localOpMetadata: unknown) {
		// Need to parse from string for back-compat
		const { type, contents } = this.parseLocalOpContent(content);
		switch (type) {
			case ContainerMessageType.FluidDataStoreOp:
				// For operations, call rollbackDataStoreOp which will find the right store
				// and trigger rollback on it.
				this.channelCollection.rollback(type, contents, localOpMetadata);
				break;
			default:
				// Don't check message.compatDetails because this is for rolling back a local op so the type will be known
				throw new Error(`Can't rollback ${type}`);
		}
	}

	/** Implementation of ISummarizerInternalsProvider.refreshLatestSummaryAck */
	public async refreshLatestSummaryAck(options: IRefreshSummaryAckOptions) {
		const { proposalHandle, ackHandle, summaryRefSeq, summaryLogger } = options;
		// proposalHandle is always passed from RunningSummarizer.
		assert(proposalHandle !== undefined, 0x766 /* proposalHandle should be available */);
		const readAndParseBlob = async <T>(id: string) => readAndParse<T>(this.storage, id);
		const result = await this.summarizerNode.refreshLatestSummary(
			proposalHandle,
			summaryRefSeq,
		);

		/**
		 * When refreshing a summary ack, this check indicates a new ack of a summary that is newer than the
		 * current summary that is tracked, but this summarizer runtime did not produce/track that summary. Thus
		 * it needs to refresh its state. Today refresh is done by fetching the latest snapshot to update the cache
		 * and then close as the current main client is likely to be re-elected as the parent summarizer again.
		 */
		if (!result.isSummaryTracked && result.isSummaryNewer) {
			await this.fetchLatestSnapshotAndClose(
				summaryLogger,
				{
					eventName: "RefreshLatestSummaryAckFetch",
					ackHandle,
					targetSequenceNumber: summaryRefSeq,
				},
				readAndParseBlob,
			);
			return;
		}

		// Notify the garbage collector so it can update its latest summary state.
		await this.garbageCollector.refreshLatestSummary(result);
	}

	/**
	 * Fetches the latest snapshot from storage and closes the container. This is done in cases where
	 * the last known snapshot is older than the latest one. This will ensure that the latest snapshot
	 * is downloaded and we don't end up loading snapshot from cache.
	 */
	private async fetchLatestSnapshotAndClose(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEventExt,
		readAndParseBlob: ReadAndParseBlob,
	) {
		await PerformanceEvent.timedExecAsync(
			logger,
			event,
			async (perfEvent: {
				end: (arg0: {
					getVersionDuration?: number | undefined;
					getSnapshotDuration?: number | undefined;
					snapshotRefSeq?: number | undefined;
					snapshotVersion?: string | undefined;
				}) => void;
			}) => {
				const stats: {
					getVersionDuration?: number;
					getSnapshotDuration?: number;
					snapshotRefSeq?: number;
					snapshotVersion?: string;
				} = {};
				const trace = Trace.start();

				const versions = await this.storage.getVersions(
					null,
					1,
					"prefetchLatestSummaryBeforeClose",
					FetchSource.noCache,
				);
				assert(
					!!versions && !!versions[0],
					0x137 /* "Failed to get version from storage" */,
				);
				stats.getVersionDuration = trace.trace().duration;

				const maybeSnapshot = await this.storage.getSnapshotTree(versions[0]);
				assert(!!maybeSnapshot, 0x138 /* "Failed to get snapshot from storage" */);
				stats.getSnapshotDuration = trace.trace().duration;
				const latestSnapshotRefSeq = await seqFromTree(maybeSnapshot, readAndParseBlob);
				stats.snapshotRefSeq = latestSnapshotRefSeq;
				stats.snapshotVersion = versions[0].id;

				perfEvent.end(stats);
			},
		);

		await delay(this.closeSummarizerDelayMs);
		this._summarizer?.stop("latestSummaryStateStale");
		this.disposeFn();
	}

	public getPendingLocalState(props?: IGetPendingLocalStateProps): unknown {
		this.verifyNotClosed();

		if (this._orderSequentiallyCalls !== 0) {
			throw new UsageError("can't get state during orderSequentially");
		}
		this.imminentClosure ||= props?.notifyImminentClosure ?? false;

		const getSyncState = (
			pendingAttachmentBlobs?: IPendingBlobs,
		): IPendingRuntimeState | undefined => {
			const pending = this.pendingStateManager.getLocalState(props?.snapshotSequenceNumber);
			const sessionExpiryTimerStarted =
				props?.sessionExpiryTimerStarted ?? this.garbageCollector.sessionExpiryTimerStarted;

			const pendingIdCompressorState = this._idCompressor?.serialize(true);

			return {
				pending,
				pendingIdCompressorState,
				pendingAttachmentBlobs,
				sessionExpiryTimerStarted,
			};
		};
		const perfEvent = {
			eventName: "getPendingLocalState",
			notifyImminentClosure: props?.notifyImminentClosure,
		};
		const logAndReturnPendingState = (
			event: PerformanceEvent,
			pendingState?: IPendingRuntimeState,
		) => {
			event.end({
				attachmentBlobsSize: Object.keys(pendingState?.pendingAttachmentBlobs ?? {}).length,
				pendingOpsSize: pendingState?.pending?.pendingStates.length,
			});
			return pendingState;
		};

		// Flush pending batch.
		// getPendingLocalState() is only exposed through Container.closeAndGetPendingLocalState(), so it's safe
		// to close current batch.
		this.flush();

		return props?.notifyImminentClosure === true
			? PerformanceEvent.timedExecAsync(this.mc.logger, perfEvent, async (event) =>
					logAndReturnPendingState(
						event,
						getSyncState(
							await this.blobManager.attachAndGetPendingBlobs(
								props?.stopBlobAttachingSignal,
							),
						),
					),
			  )
			: PerformanceEvent.timedExec(this.mc.logger, perfEvent, (event) =>
					logAndReturnPendingState(event, getSyncState()),
			  );
	}

	public summarizeOnDemand(options: IOnDemandSummarizeOptions): ISummarizeResults {
		if (this.isSummarizerClient) {
			return this.summarizer.summarizeOnDemand(options);
		} else if (this.summaryManager !== undefined) {
			return this.summaryManager.summarizeOnDemand(options);
		} else {
			// If we're not the summarizer, and we don't have a summaryManager, we expect that
			// disableSummaries is turned on. We are throwing instead of returning a failure here,
			// because it is a misuse of the API rather than an expected failure.
			throw new UsageError(`Can't summarize, disableSummaries: ${this.summariesDisabled}`);
		}
	}

	public enqueueSummarize(options: IEnqueueSummarizeOptions): EnqueueSummarizeResult {
		if (this.isSummarizerClient) {
			return this.summarizer.enqueueSummarize(options);
		} else if (this.summaryManager !== undefined) {
			return this.summaryManager.enqueueSummarize(options);
		} else {
			// If we're not the summarizer, and we don't have a summaryManager, we expect that
			// generateSummaries is turned off. We are throwing instead of returning a failure here,
			// because it is a misuse of the API rather than an expected failure.
			throw new UsageError(`Can't summarize, disableSummaries: ${this.summariesDisabled}`);
		}
	}

	/**
	 * Forms a function that will create and retrieve a Summarizer.
	 */
	private formCreateSummarizerFn(loader: ILoader) {
		return async () => {
			return createSummarizer(loader, `/${summarizerRequestUrl}`);
		};
	}

	private validateSummaryHeuristicConfiguration(configuration: ISummaryConfigurationHeuristics) {
		// eslint-disable-next-line no-restricted-syntax
		for (const prop in configuration) {
			if (typeof configuration[prop] === "number" && configuration[prop] < 0) {
				throw new UsageError(
					`Summary heuristic configuration property "${prop}" cannot be less than 0`,
				);
			}
		}
		if (configuration.minIdleTime > configuration.maxIdleTime) {
			throw new UsageError(
				`"minIdleTime" [${configuration.minIdleTime}] cannot be greater than "maxIdleTime" [${configuration.maxIdleTime}]`,
			);
		}
	}

	private get groupedBatchingEnabled(): boolean {
		return this.sessionSchema.opGroupingEnabled === true;
	}
}
