/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ITelemetryBaseLogger,
	ITelemetryGenericEvent,
	FluidObject,
	IFluidHandle,
	IFluidHandleContext,
	IRequest,
	IResponse,
	IProvideFluidHandleContext,
} from "@fluidframework/core-interfaces";
import {
	IAudience,
	IBatchMessage,
	IContainerContext,
	IDeltaManager,
	IRuntime,
	ICriticalContainerError,
	AttachState,
	ILoaderOptions,
	ILoader,
	LoaderHeader,
	IGetPendingLocalStateProps,
} from "@fluidframework/container-definitions";
import {
	IContainerRuntime,
	IContainerRuntimeEvents,
} from "@fluidframework/container-runtime-definitions";
import { assert, delay, LazyPromise } from "@fluidframework/core-utils";
import { Trace, TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	createChildLogger,
	createChildMonitoringContext,
	DataCorruptionError,
	DataProcessingError,
	GenericError,
	raiseConnectedEvent,
	PerformanceEvent,
	// eslint-disable-next-line import/no-deprecated
	TaggedLoggerAdapter,
	MonitoringContext,
	wrapError,
	ITelemetryLoggerExt,
	UsageError,
	LoggingError,
} from "@fluidframework/telemetry-utils";
import {
	DriverHeader,
	FetchSource,
	IDocumentStorageService,
	ISummaryContext,
} from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import {
	IClientDetails,
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISignalMessage,
	ISnapshotTree,
	ISummaryContent,
	ISummaryTree,
	MessageType,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	FlushMode,
	FlushModeExperimental,
	gcTreeKey,
	InboundAttachMessage,
	IFluidDataStoreContextDetached,
	IFluidDataStoreRegistry,
	IFluidDataStoreChannel,
	IGarbageCollectionData,
	IEnvelope,
	IInboundSignalMessage,
	ISignalEnvelope,
	NamedFluidDataStoreRegistryEntries,
	ISummaryTreeWithStats,
	ISummarizeInternalResult,
	CreateChildSummarizerNodeParam,
	SummarizeInternalFn,
	channelsTreeName,
	IDataStore,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import type {
	SerializedIdCompressorWithNoSession,
	IIdCompressor,
	IIdCompressorCore,
	IdCreationRange,
	SerializedIdCompressorWithOngoingSession,
} from "@fluidframework/id-compressor";
import {
	addBlobToSummary,
	addSummarizeResultToSummary,
	addTreeToSummary,
	RequestParser,
	create404Response,
	exceptionToResponse,
	GCDataBuilder,
	seqFromTree,
	calculateStats,
	TelemetryContext,
	ReadAndParseBlob,
	responseToException,
} from "@fluidframework/runtime-utils";
import { v4 as uuid } from "uuid";
import { ContainerFluidHandleContext } from "./containerHandleContext";
import { FluidDataStoreRegistry } from "./dataStoreRegistry";
import { ReportOpPerfTelemetry, IPerfSignalReport } from "./connectionTelemetry";
import {
	IPendingBatchMessage,
	IPendingLocalState,
	PendingStateManager,
} from "./pendingStateManager";
import { pkgVersion } from "./packageVersion";
import { BlobManager, IBlobManagerLoadInfo, IPendingBlobs } from "./blobManager";
import { DataStores, getSummaryForDatastores } from "./dataStores";
import {
	aliasBlobName,
	blobsTreeName,
	chunksBlobName,
	createRootSummarizerNodeWithGC,
	electedSummarizerBlobName,
	extractSummaryMetadataMessage,
	IContainerRuntimeMetadata,
	ICreateContainerMetadata,
	idCompressorBlobName,
	IRootSummarizerNodeWithGC,
	ISummaryMetadataMessage,
	metadataBlobName,
	Summarizer,
	SummaryManager,
	wrapSummaryInChannelsTree,
	SummaryCollection,
	ISerializedElection,
	OrderedClientCollection,
	OrderedClientElection,
	SummarizerClientElection,
	summarizerClientType,
	SubmitSummaryResult,
	IConnectableRuntime,
	IGeneratedSummaryStats,
	ISubmitSummaryOptions,
	ISummarizerInternalsProvider,
	ISummarizerRuntime,
	IRefreshSummaryAckOptions,
	RunWhileConnectedCoordinator,
	IGenerateSummaryTreeResult,
	RetriableSummaryError,
	IOnDemandSummarizeOptions,
	ISummarizeResults,
	IEnqueueSummarizeOptions,
	EnqueueSummarizeResult,
	ISummarizerEvents,
	IBaseSummarizeResult,
	ISummarizer,
} from "./summary";
import { formExponentialFn, Throttler } from "./throttler";
import {
	GarbageCollector,
	GCNodeType,
	gcGenerationOptionName,
	IGarbageCollector,
	IGCRuntimeOptions,
	IGCStats,
	trimLeadingAndTrailingSlashes,
} from "./gc";
import { channelToDataStore, IDataStoreAliasMessage, isDataStoreAliasMessage } from "./dataStore";
import { BindBatchTracker } from "./batchTracker";
import { ScheduleManager } from "./scheduleManager";
import {
	BatchMessage,
	IBatch,
	IBatchCheckpoint,
	OpCompressor,
	OpDecompressor,
	Outbox,
	OpSplitter,
	RemoteMessageProcessor,
	OpGroupingManager,
	getLongStack,
} from "./opLifecycle";
import { DeltaManagerSummarizerProxy } from "./deltaManagerSummarizerProxy";
import { IBatchMetadata, IIdAllocationMetadata } from "./metadata";
import {
	ContainerMessageType,
	type InboundSequencedContainerRuntimeMessage,
	type InboundSequencedContainerRuntimeMessageOrSystemMessage,
	type ContainerRuntimeIdAllocationMessage,
	type LocalContainerRuntimeMessage,
	type OutboundContainerRuntimeMessage,
	type UnknownContainerRuntimeMessage,
	ContainerRuntimeGCMessage,
} from "./messageTypes";

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
	 * If unspecified, the limit is 950 * 1024.
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
	readonly enableRuntimeIdCompressor?: boolean;

	/**
	 * If enabled, the runtime will block all attempts to send an op inside the
	 * {@link ContainerRuntime#ensureNoDataModelChanges} callback. The callback is used by
	 * {@link @fluidframework/shared-object-base#SharedObjectCore} for event handlers so enabling this
	 * will disallow modifying DDSes while handling DDS events.
	 *
	 * By default, the feature is disabled. If enabled from options, the `Fluid.ContainerRuntime.DisableOpReentryCheck`
	 * can be used to disable it at runtime.
	 */
	readonly enableOpReentryCheck?: boolean;
	/**
	 * If enabled, the runtime will group messages within a batch into a single
	 * message to be sent to the service.
	 * The grouping an ungrouping of such messages is handled by the "OpGroupingManager".
	 *
	 * By default, the feature is disabled. If enabled from options, the `Fluid.ContainerRuntime.DisableGroupedBatching`
	 * flag can be used to disable it at runtime.
	 *
	 * @experimental Not ready for use.
	 */
	readonly enableGroupedBatching?: boolean;
}

/**
 * Accepted header keys for requests coming to the runtime.
 * @internal
 */
export enum RuntimeHeaders {
	/** True to wait for a data store to be created and loaded before returning it. */
	wait = "wait",
	/** True if the request is coming from an IFluidHandle. */
	viaHandle = "viaHandle",
}

/** True if a tombstoned object should be returned without erroring
 * @alpha
 */
export const AllowTombstoneRequestHeaderKey = "allowTombstone"; // Belongs in the enum above, but avoiding the breaking change
/**
 * [IRRELEVANT IF throwOnInactiveLoad OPTION NOT SET] True if an inactive object should be returned without erroring
 * @internal
 */
export const AllowInactiveRequestHeaderKey = "allowInactive"; // Belongs in the enum above, but avoiding the breaking change

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
 * @deprecated use ContainerRuntimeMessageType instead
 * @internal
 */
export enum RuntimeMessage {
	FluidDataStoreOp = "component",
	Attach = "attach",
	ChunkedOp = "chunkedOp",
	BlobAttach = "blobAttach",
	Rejoin = "rejoin",
	Alias = "alias",
	Operation = "op",
}

/**
 * @deprecated please use version in driver-utils
 * @internal
 */
export function isRuntimeMessage(message: ISequencedDocumentMessage): boolean {
	return (Object.values(RuntimeMessage) as string[]).includes(message.type);
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
	  }
	| {
			message: InboundSequencedContainerRuntimeMessageOrSystemMessage;
			modernRuntimeMessage: false;
			local: boolean;
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
			runtimeOptions = {},
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

		const {
			summaryOptions = {},
			gcOptions = {},
			loadSequenceNumberVerification = "close",
			flushMode = defaultFlushMode,
			compressionOptions = defaultCompressionConfig,
			maxBatchSizeInBytes = defaultMaxBatchSizeInBytes,
			enableRuntimeIdCompressor = false,
			chunkSizeInBytes = defaultChunkSizeInBytes,
			enableOpReentryCheck = false,
			enableGroupedBatching = false,
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

		// Verify summary runtime sequence number matches protocol sequence number.
		const runtimeSequenceNumber = metadata?.message?.sequenceNumber;
		// When we load with pending state, we reuse an old snapshot so we don't expect these numbers to match
		if (!context.pendingLocalState && runtimeSequenceNumber !== undefined) {
			const protocolSequenceNumber = context.deltaManager.initialSequenceNumber;
			// Unless bypass is explicitly set, then take action when sequence numbers mismatch.
			if (
				loadSequenceNumberVerification !== "bypass" &&
				runtimeSequenceNumber !== protocolSequenceNumber
			) {
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

		const idCompressorEnabled =
			metadata?.idCompressorEnabled ?? runtimeOptions.enableRuntimeIdCompressor ?? false;
		let idCompressor: (IIdCompressor & IIdCompressorCore) | undefined;
		if (idCompressorEnabled) {
			const { createIdCompressor, deserializeIdCompressor, createSessionId } = await import(
				"@fluidframework/id-compressor"
			);

			const pendingLocalState = context.pendingLocalState as IPendingRuntimeState;

			if (pendingLocalState?.pendingIdCompressorState !== undefined) {
				idCompressor = deserializeIdCompressor(pendingLocalState.pendingIdCompressorState);
			} else if (serializedIdCompressor !== undefined) {
				idCompressor = deserializeIdCompressor(serializedIdCompressor, createSessionId());
			} else {
				idCompressor = createIdCompressor(logger);
			}
		}

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
				enableRuntimeIdCompressor,
				enableOpReentryCheck,
				enableGroupedBatching,
			},
			containerScope,
			logger,
			existing,
			blobManagerSnapshot,
			context.storage,
			idCompressor,
			provideEntryPoint,
			requestHandler,
			undefined, // summaryConfiguration
		);

		// Apply stashed ops with a reference sequence number equal to the sequence number of the snapshot,
		// or zero. This must be done before Container replays saved ops.
		await runtime.pendingStateManager.applyStashedOpsAt(runtimeSequenceNumber ?? 0);

		// Initialize the base state of the runtime before it's returned.
		await runtime.initializeBaseState();

		return runtime;
	}

	public readonly options: ILoaderOptions;
	private imminentClosure: boolean = false;

	private readonly _getClientId: () => string | undefined;
	public get clientId(): string | undefined {
		return this._getClientId();
	}

	public readonly clientDetails: IClientDetails;

	public get storage(): IDocumentStorageService {
		return this._storage;
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
	private readonly submitSignalFn: (content: any, targetClientId?: string) => void;
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

	public idCompressor: (IIdCompressor & IIdCompressorCore) | undefined;

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
	 * Tracks the number of detected reentrant ops to report,
	 * in order to self-throttle the telemetry events.
	 *
	 * This should be removed as part of ADO:2322
	 */
	private opReentryCallsToReport = 5;

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
	private readonly enableOpReentryCheck: boolean;
	private readonly disableAttachReorder: boolean | undefined;
	private readonly closeSummarizerDelayMs: number;
	/**
	 * If true, summary generated is validate before uploading it to the server. With single commit summaries,
	 * summaries will be accepted once uploaded, so they should be validated before upload. However, this can
	 * currently be controlled via a feature flag as its a new functionality.
	 */
	private readonly validateSummaryBeforeUpload: boolean;

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

	private readonly dataStores: DataStores;
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

	private readonly heuristicsDisabled: boolean;
	private isHeuristicsDisabled(): boolean {
		return this.summaryConfiguration.state === "disableHeuristics";
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
	 * If true, the runtime has access to an IdCompressor
	 */
	private readonly idCompressorEnabled: boolean;

	/**
	 * Whether this client is the summarizer client itself (type is summarizerClientType)
	 */
	private readonly isSummarizerClient: boolean;

	/**
	 * The id of the version used to initially load this runtime, or undefined if it's newly created.
	 */
	private readonly loadedFromVersionId: string | undefined;

	/***/
	protected constructor(
		context: IContainerContext,
		private readonly registry: IFluidDataStoreRegistry,
		metadata: IContainerRuntimeMetadata | undefined,
		electedSummarizerData: ISerializedElection | undefined,
		chunks: [string, string[]][],
		dataStoreAliasMap: [string, string][],
		private readonly runtimeOptions: Readonly<Required<IContainerRuntimeOptions>>,
		private readonly containerScope: FluidObject,
		public readonly logger: ITelemetryLoggerExt,
		existing: boolean,
		blobManagerSnapshot: IBlobManagerLoadInfo,
		private readonly _storage: IDocumentStorageService,
		idCompressor: (IIdCompressor & IIdCompressorCore) | undefined,
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
		} = context;

		this.innerDeltaManager = deltaManager;
		this.deltaManager = new DeltaManagerSummarizerProxy(this.innerDeltaManager);

		// Here we could wrap/intercept on these functions to block/modify outgoing messages if needed.
		// This makes ContainerRuntime the final gatekeeper for outgoing messages.
		this.submitFn = submitFn;
		this.submitBatchFn = submitBatchFn;
		this.submitSummaryFn = submitSummaryFn;
		this.submitSignalFn = submitSignalFn;

		this.options = options;
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

		this.mc = createChildMonitoringContext({
			logger: this.logger,
			namespace: "ContainerRuntime",
		});

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

			// Enabling the IdCompressor is a one-way operation and we only want to
			// allow new containers to turn it on
			this.idCompressorEnabled = metadata?.idCompressorEnabled ?? false;
		} else {
			this.createContainerMetadata = {
				createContainerRuntimeVersion: pkgVersion,
				createContainerTimestamp: Date.now(),
			};
			loadSummaryNumber = 0;

			this.idCompressorEnabled =
				this.mc.config.getBoolean("Fluid.ContainerRuntime.IdCompressorEnabled") ??
				idCompressor !== undefined;
		}
		this.nextSummaryNumber = loadSummaryNumber + 1;

		this.messageAtLastSummary = metadata?.message;

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

		this.handleContext = new ContainerFluidHandleContext("", this);

		if (this.summaryConfiguration.state === "enabled") {
			this.validateSummaryHeuristicConfiguration(this.summaryConfiguration);
		}

		const disableOpReentryCheck = this.mc.config.getBoolean(
			"Fluid.ContainerRuntime.DisableOpReentryCheck",
		);
		this.enableOpReentryCheck =
			runtimeOptions.enableOpReentryCheck === true &&
			// Allow for a break-glass config to override the options
			disableOpReentryCheck !== true;

		this.summariesDisabled = this.isSummariesDisabled();
		this.heuristicsDisabled = this.isHeuristicsDisabled();
		this.maxOpsSinceLastSummary = this.getMaxOpsSinceLastSummary();
		this.initialSummarizerDelayMs = this.getInitialSummarizerDelayMs();

		if (this.idCompressorEnabled) {
			this.idCompressor = idCompressor;
		}

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

		const pendingRuntimeState = pendingLocalState as IPendingRuntimeState | undefined;

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
				// Must set to true to throw on any data stores failure that was too severe to be handled.
				// We also are not decoding the base summaries at the root.
				throwOnFailure: true,
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

		this.dataStores = new DataStores(
			getSummaryForDatastores(baseSnapshot, metadata),
			this,
			(attachMsg) => this.submit({ type: ContainerMessageType.Attach, contents: attachMsg }),
			(id: string, createParam: CreateChildSummarizerNodeParam) =>
				(
					summarizeInternal: SummarizeInternalFn,
					getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
				) =>
					this.summarizerNode.createChild(
						summarizeInternal,
						id,
						createParam,
						undefined,
						getGCDataFn,
					),
			(id: string) => this.summarizerNode.deleteChild(id),
			this.mc.logger,
			(path: string, timestampMs: number, packagePath?: readonly string[]) =>
				this.garbageCollector.nodeUpdated(path, "Changed", timestampMs, packagePath),
			(path: string) => this.garbageCollector.isNodeDeleted(path),
			new Map<string, string>(dataStoreAliasMap),
		);

		this.blobManager = new BlobManager(
			this.handleContext,
			blobManagerSnapshot,
			() => this.storage,
			(localId: string, blobId?: string) => {
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
			(blobPath: string) => this.garbageCollector.nodeUpdated(blobPath, "Loaded"),
			(blobPath: string) => this.garbageCollector.isNodeDeleted(blobPath),
			this,
			pendingRuntimeState?.pendingAttachmentBlobs,
			(error?: ICriticalContainerError) => this.closeFn(error),
		);

		this.scheduleManager = new ScheduleManager(
			this.innerDeltaManager,
			this,
			() => this.clientId,
			createChildLogger({ logger: this.logger, namespace: "ScheduleManager" }),
		);

		this.pendingStateManager = new PendingStateManager(
			{
				applyStashedOp: this.applyStashedOp.bind(this),
				clientId: () => this.clientId,
				close: this.closeFn,
				connected: () => this.connected,
				reSubmit: this.reSubmit.bind(this),
				reSubmitBatch: this.reSubmitBatch.bind(this),
				isActiveConnection: () => this.innerDeltaManager.active,
			},
			pendingRuntimeState?.pending,
			this.logger,
		);

		const disableCompression = this.mc.config.getBoolean(
			"Fluid.ContainerRuntime.CompressionDisabled",
		);
		const compressionOptions =
			disableCompression === true
				? {
						minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
						compressionAlgorithm: CompressionAlgorithms.lz4,
				  }
				: runtimeOptions.compressionOptions;

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

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this._audience = audience!;

		const closeSummarizerDelayOverride = this.mc.config.getNumber(
			"Fluid.ContainerRuntime.Test.CloseSummarizerDelayOverrideMs",
		);
		this.closeSummarizerDelayMs = closeSummarizerDelayOverride ?? defaultCloseSummarizerDelayMs;
		this.validateSummaryBeforeUpload =
			this.mc.config.getBoolean("Fluid.Summarizer.ValidateSummaryBeforeUpload") ?? false;

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
					this.heuristicsDisabled,
				);
				this.summaryManager.on("summarize", (eventProps) => {
					this.emit("summarize", eventProps);
				});
				this.summaryManager.start();
			}
		}

		// logging hardware telemetry
		logger.sendTelemetryEvent({
			eventName: "DeviceSpec",
			...getDeviceSpec(),
		});

		this.mc.logger.sendTelemetryEvent({
			eventName: "ContainerLoadStats",
			...this.createContainerMetadata,
			...this.dataStores.containerLoadStats,
			summaryNumber: loadSummaryNumber,
			summaryFormatVersion: metadata?.summaryFormatVersion,
			disableIsolatedChannels: metadata?.disableIsolatedChannels,
			gcVersion: metadata?.gcFeature,
			options: JSON.stringify(runtimeOptions),
			featureGates: JSON.stringify({
				disableCompression,
				disableOpReentryCheck,
				disableChunking,
				disableAttachReorder: this.disableAttachReorder,
				disablePartialFlush,
				idCompressorEnabled: this.idCompressorEnabled,
				closeSummarizerDelayOverride,
			}),
			telemetryDocumentId: this.telemetryDocumentId,
			groupedBatchingEnabled: this.groupedBatchingEnabled,
		});

		ReportOpPerfTelemetry(this.clientId, this.deltaManager, this.logger);
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
	}

	/**
	 * Initializes the state from the base snapshot this container runtime loaded from.
	 */
	private async initializeBaseState(): Promise<void> {
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
		this.dataStores.dispose();
		this.pendingStateManager.dispose();
		this.emit("dispose");
		this.removeAllListeners();
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
				// Differentiate between requesting the dataStore directly, or one of its children
				const requestForChild = !requestParser.isLeaf(1);
				const dataStore = await this.getDataStoreFromRequest(id, request, requestForChild);

				const subRequest = requestParser.createSubRequest(1);
				// We always expect createSubRequest to include a leading slash, but asserting here to protect against
				// unintentionally modifying the url if that changes.
				assert(
					subRequest.url.startsWith("/"),
					0x126 /* "Expected createSubRequest url to include a leading slash" */,
				);
				// eslint-disable-next-line @typescript-eslint/return-await -- Adding an await here causes test failures
				return dataStore.request(subRequest);
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
		return this.dataStores.aliases.get(maybeAlias) ?? maybeAlias;
	}

	private async getDataStoreFromRequest(
		id: string,
		request: IRequest,
		requestForChild: boolean,
	): Promise<IFluidDataStoreChannel> {
		const headerData: RuntimeHeaderData = {};
		if (typeof request.headers?.[RuntimeHeaders.wait] === "boolean") {
			headerData.wait = request.headers[RuntimeHeaders.wait];
		}
		if (typeof request.headers?.[RuntimeHeaders.viaHandle] === "boolean") {
			headerData.viaHandle = request.headers[RuntimeHeaders.viaHandle];
		}
		if (typeof request.headers?.[AllowTombstoneRequestHeaderKey] === "boolean") {
			headerData.allowTombstone = request.headers[AllowTombstoneRequestHeaderKey];
		}
		if (typeof request.headers?.[AllowInactiveRequestHeaderKey] === "boolean") {
			headerData.allowInactive = request.headers[AllowInactiveRequestHeaderKey];
		}

		// We allow Tombstone requests for sub-DataStore objects
		if (requestForChild) {
			headerData.allowTombstone = true;
		}

		await this.dataStores.waitIfPendingAlias(id);
		const internalId = this.internalId(id);
		const dataStoreContext = await this.dataStores.getDataStore(internalId, headerData);

		// Remove query params, leading and trailing slashes from the url. This is done to make sure the format is
		// the same as GC nodes id.
		const urlWithoutQuery = trimLeadingAndTrailingSlashes(request.url.split("?")[0]);
		// Get the initial snapshot details which contain the data store package path.
		const details = await dataStoreContext.getInitialSnapshotDetails();

		// Note that this will throw if the data store is inactive or tombstoned and throwing on incorrect usage
		// is configured.
		this.garbageCollector.nodeUpdated(
			`/${urlWithoutQuery}`,
			"Loaded",
			undefined /* timestampMs */,
			details.pkg,
			request,
			headerData,
		);
		return dataStoreContext.realize();
	}

	/** Adds the container's metadata to the given summary tree. */
	private addMetadataToSummary(summaryTree: ISummaryTreeWithStats) {
		const metadata: IContainerRuntimeMetadata = {
			...this.createContainerMetadata,
			// Increment the summary number for the next summary that will be generated.
			summaryNumber: this.nextSummaryNumber++,
			summaryFormatVersion: 1,
			...this.garbageCollector.getMetadata(),
			// The last message processed at the time of summary. If there are no new messages, use the message from the
			// last summary.
			message:
				extractSummaryMetadataMessage(this.deltaManager.lastMessage) ??
				this.messageAtLastSummary,
			telemetryDocumentId: this.telemetryDocumentId,
			idCompressorEnabled: this.idCompressorEnabled ? true : undefined,
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

		if (this.idCompressorEnabled) {
			assert(
				this.idCompressor !== undefined,
				0x67a /* IdCompressor should be defined if enabled */,
			);
			const idCompressorState = JSON.stringify(this.idCompressor.serialize(false));
			addBlobToSummary(summaryTree, idCompressorBlobName, idCompressorState);
		}

		if (this.remoteMessageProcessor.partialMessages.size > 0) {
			const content = JSON.stringify([...this.remoteMessageProcessor.partialMessages]);
			addBlobToSummary(summaryTree, chunksBlobName, content);
		}

		const dataStoreAliases = this.dataStores.aliases;
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
			addTreeToSummary(summaryTree, blobsTreeName, blobManagerSummary);
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

	private resetReconnectCount(message?: ISequencedDocumentMessage) {
		// Chunked ops don't count towards making progress as they are sent
		// in their own batches before the originating batch is sent.
		// Therefore, receiving them while attempting to send the originating batch
		// does not mean that the container is making any progress.
		if (message?.type !== ContainerMessageType.ChunkedOp) {
			this.consecutiveReconnects = 0;
		}
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
				return this.dataStores.applyStashedOp(opContents.contents);
			case ContainerMessageType.Attach:
				return this.dataStores.applyStashedAttachOp(opContents.contents);
			case ContainerMessageType.IdAllocation:
				assert(
					this.idCompressor !== undefined,
					0x67b /* IdCompressor should be defined if enabled */,
				);
				return;
			case ContainerMessageType.Alias:
			case ContainerMessageType.BlobAttach:
				return;
			case ContainerMessageType.ChunkedOp:
				throw new Error("chunkedOp not expected here");
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
						"Stashed runtime message of unknown type",
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
			}
		}
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		if (connected === false && this.delayConnectClientId !== undefined) {
			this.delayConnectClientId = undefined;
			this.mc.logger.sendTelemetryEvent({
				eventName: "UnsuccessfulConnectedTransition",
			});
			// Don't propagate "disconnected" event because we didn't propagate the previous "connected" event
			return;
		}

		// If there are stashed blobs in the pending state, we need to delay
		// propagation of the "connected" event until we have uploaded them to
		// ensure we don't submit ops referencing a blob that has not been uploaded
		const connecting = connected && !this._connected;
		if (connecting && this.blobManager.hasPendingStashedBlobs()) {
			assert(
				!this.delayConnectClientId,
				0x791 /* Connect event delay must be canceled before subsequent connect event */,
			);
			assert(!!clientId, 0x792 /* Must have clientId when connecting */);
			this.delayConnectClientId = clientId;
			this.blobManager.processStashedChanges().then(
				() => {
					// make sure we didn't reconnect before the promise resolved
					if (this.delayConnectClientId === clientId && !this.disposed) {
						this.delayConnectClientId = undefined;
						this.setConnectionStateCore(connected, clientId);
					}
				},
				(error) => this.closeFn(error),
			);
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

		this.dataStores.setConnectionState(connected, clientId);
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
		for (const message of this.remoteMessageProcessor.process(messageCopy)) {
			if (modernRuntimeMessage) {
				this.processCore({
					// Cast it since we expect it to be this based on modernRuntimeMessage computation above.
					// There is nothing really ensuring that anytime original message.type is Operation that
					// the result messages will be so. In the end modern bool being true only directs to
					// throw error if ultimately unrecognized without compat details saying otherwise.
					message: message as InboundSequencedContainerRuntimeMessage,
					local,
					modernRuntimeMessage,
				});
			} else {
				// Unrecognized message will be ignored.
				this.processCore({ message, local, modernRuntimeMessage });
			}
		}
	}

	private _processedClientSequenceNumber: number | undefined;

	/**
	 * Direct the message to the correct subsystem for processing, and implement other side effects
	 */
	private processCore(messageWithContext: MessageWithContext) {
		const { message, local } = messageWithContext;
		// Surround the actual processing of the operation with messages to the schedule manager indicating
		// the beginning and end. This allows it to emit appropriate events and/or pause the processing of new
		// messages once a batch has been fully processed.
		this.scheduleManager.beforeOpProcessing(message);

		this._processedClientSequenceNumber = message.clientSequenceNumber;

		try {
			let localOpMetadata: unknown;
			if (
				local &&
				messageWithContext.modernRuntimeMessage &&
				message.type !== ContainerMessageType.ChunkedOp
			) {
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
				this.resetReconnectCount(message);
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
				this.dataStores.processAttachMessage(messageWithContext.message, local);
				break;
			case ContainerMessageType.Alias:
				this.dataStores.processAliasMessage(
					messageWithContext.message,
					localOpMetadata,
					local,
				);
				break;
			case ContainerMessageType.FluidDataStoreOp:
				this.dataStores.processFluidDataStoreOp(
					messageWithContext.message,
					local,
					localOpMetadata,
				);
				break;
			case ContainerMessageType.BlobAttach:
				this.blobManager.processBlobAttachOp(messageWithContext.message, local);
				break;
			case ContainerMessageType.IdAllocation:
				assert(
					this.idCompressor !== undefined,
					0x67c /* IdCompressor should be defined if enabled */,
				);

				// Don't re-finalize the range if we're processing a "savedOp" in
				// stashed ops flow. The compressor is stashed with these ops already processed.
				if (
					(messageWithContext.message.metadata as IIdAllocationMetadata)?.savedOp !== true
				) {
					this.idCompressor.finalizeCreationRange(messageWithContext.message.contents);
				}
				break;
			case ContainerMessageType.GC:
				this.garbageCollector.processMessage(messageWithContext.message, local);
				break;
			case ContainerMessageType.ChunkedOp:
			case ContainerMessageType.Rejoin:
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

		this.dataStores.processSignal(envelope.address, transformed, local);
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

	public orderSequentially<T>(callback: () => T): T {
		let checkpoint: IBatchCheckpoint | undefined;
		let result: T;
		if (this.mc.config.getBoolean("Fluid.ContainerRuntime.EnableRollback")) {
			// Note: we are not touching this.pendingAttachBatch here, for two reasons:
			// 1. It would not help, as we flush attach ops as they become available.
			// 2. There is no way to undo process of data store creation.
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
				// pre-0.58 error message: orderSequentiallyCallbackException
				this.closeFn(new GenericError("orderSequentially callback exception", error));
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
		await this.dataStores.waitIfPendingAlias(alias);
		const internalId = this.internalId(alias);
		const context = await this.dataStores.getDataStoreIfAvailable(internalId, { wait: false });
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
		this.garbageCollector.nodeUpdated(
			`/${internalId}`,
			"Loaded",
			undefined /* timestampMs */,
			context.packagePath,
		);
		return channel.entryPoint;
	}

	public createDetachedRootDataStore(
		pkg: Readonly<string[]>,
		rootDataStoreId: string,
	): IFluidDataStoreContextDetached {
		if (rootDataStoreId.includes("/")) {
			throw new UsageError(`Id cannot contain slashes: '${rootDataStoreId}'`);
		}
		return this.dataStores.createDetachedDataStoreCore(pkg, true, rootDataStoreId);
	}

	public createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached {
		return this.dataStores.createDetachedDataStoreCore(pkg, false);
	}

	public async createDataStore(pkg: string | string[]): Promise<IDataStore> {
		const id = uuid();
		return channelToDataStore(
			await this.dataStores
				._createFluidDataStoreContext(Array.isArray(pkg) ? pkg : [pkg], id)
				.realize(),
			id,
			this,
			this.dataStores,
			this.mc.logger,
		);
	}

	/**
	 * @deprecated 0.16 Issue #1537, #3631
	 */
	public async _createDataStoreWithProps(
		pkg: string | string[],
		props?: any,
		id = uuid(),
	): Promise<IDataStore> {
		return channelToDataStore(
			await this.dataStores
				._createFluidDataStoreContext(Array.isArray(pkg) ? pkg : [pkg], id, props)
				.realize(),
			id,
			this,
			this.dataStores,
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
	 * @param content - Content of the signal.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	public submitSignal(type: string, content: any, targetClientId?: string) {
		this.verifyNotClosed();
		const envelope = this.createNewSignalEnvelope(undefined /* address */, type, content);
		return this.submitSignalFn(envelope, targetClientId);
	}

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	public submitDataStoreSignal(
		address: string,
		type: string,
		content: any,
		targetClientId?: string,
	) {
		const envelope = this.createNewSignalEnvelope(address, type, content);
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
		this.dataStores.setAttachState(attachState);
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

		const summarizeResult = this.dataStores.createSummary(telemetryContext);
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
		const summarizeResult = await this.dataStores.summarize(
			fullTree,
			trackState,
			telemetryContext,
		);

		// Wrap data store summaries in .channels subtree.
		wrapSummaryInChannelsTree(summarizeResult);
		const pathPartsForChildren = [channelsTreeName];

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
			this.mc.logger.sendTelemetryEvent({
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
		return this.dataStores.updateStateBeforeGC();
	}

	private async getGCDataInternal(fullGC?: boolean): Promise<IGarbageCollectionData> {
		return this.dataStores.getGCData(fullGC);
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
		this.dataStores.updateUsedRoutes(dataStoreRoutes);
	}

	/**
	 * This is called to update objects whose routes are unused.
	 * @param unusedRoutes - Data store and attachment blob routes that are unused in this Container.
	 */
	public updateUnusedRoutes(unusedRoutes: readonly string[]) {
		const { blobManagerRoutes, dataStoreRoutes } =
			this.getDataStoreAndBlobManagerRoutes(unusedRoutes);
		this.blobManager.updateUnusedRoutes(blobManagerRoutes);
		this.dataStores.updateUnusedRoutes(dataStoreRoutes);
	}

	/**
	 * @deprecated Replaced by deleteSweepReadyNodes.
	 */
	public deleteUnusedNodes(unusedRoutes: readonly string[]): string[] {
		throw new Error("deleteUnusedRoutes should not be called");
	}

	/**
	 * After GC has run and identified nodes that are sweep ready, this is called to delete the sweep ready nodes.
	 * @param sweepReadyRoutes - The routes of nodes that are sweep ready and should be deleted.
	 * @returns The routes of nodes that were deleted.
	 */
	public deleteSweepReadyNodes(sweepReadyRoutes: readonly string[]): readonly string[] {
		const { dataStoreRoutes, blobManagerRoutes } =
			this.getDataStoreAndBlobManagerRoutes(sweepReadyRoutes);

		const deletedRoutes = this.dataStores.deleteSweepReadyNodes(dataStoreRoutes);
		return deletedRoutes.concat(this.blobManager.deleteSweepReadyNodes(blobManagerRoutes));
	}

	/**
	 * This is called to update objects that are tombstones.
	 * @param tombstonedRoutes - Data store and attachment blob routes that are tombstones in this Container.
	 */
	public updateTombstonedRoutes(tombstonedRoutes: readonly string[]) {
		const { blobManagerRoutes, dataStoreRoutes } =
			this.getDataStoreAndBlobManagerRoutes(tombstonedRoutes);
		this.blobManager.updateTombstonedRoutes(blobManagerRoutes);
		this.dataStores.updateTombstonedRoutes(dataStoreRoutes);
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
		return this.dataStores.getGCNodeType(nodePath) ?? GCNodeType.Other;
	}

	/**
	 * Called by GC to retrieve the package path of the node with the given path. The node should belong to a
	 * data store or an attachment blob.
	 */
	public async getGCNodePackagePath(nodePath: string): Promise<readonly string[] | undefined> {
		switch (this.getNodeType(nodePath)) {
			case GCNodeType.Blob:
				return [BlobManager.basePath];
			case GCNodeType.DataStore:
			case GCNodeType.SubDataStore:
				return this.dataStores.getDataStorePackagePath(nodePath);
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
	public addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle) {
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
		const { fullTree = false, finalAttempt = false, refreshLatestAck, summaryLogger } = options;
		// The summary number for this summary. This will be updated during the summary process, so get it now and
		// use it for all events logged during this summary.
		const summaryNumber = this.nextSummaryNumber;
		const summaryNumberLogger = createChildLogger({
			logger: summaryLogger,
			properties: {
				all: { summaryNumber },
			},
		});

		assert(this.outbox.isEmpty, 0x3d1 /* Can't trigger summary in the middle of a batch */);

		// We close the summarizer and download a new snapshot and reload the container
		let latestSnapshotVersionId: string | undefined;
		if (refreshLatestAck === true) {
			return this.prefetchLatestSummaryThenClose(
				createChildLogger({
					logger: summaryNumberLogger,
					properties: { all: { safeSummary: true } },
				}),
			);
		}

		// If the container is dirty, i.e., there are pending unacked ops, the summary will not be eventual consistent
		// and it may even be incorrect. So, wait for the container to be saved with a timeout. If the container is not
		// saved within the timeout, check if it should be failed or can continue.
		if (this.validateSummaryBeforeUpload && this.isDirty) {
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

		let summaryRefSeqNum: number | undefined;

		try {
			await this.deltaManager.inbound.pause();
			if (shouldPauseInboundSignal) {
				await this.deltaManager.inboundSignal.pause();
			}

			summaryRefSeqNum = this.deltaManager.lastSequenceNumber;
			const minimumSequenceNumber = this.deltaManager.minimumSequenceNumber;
			const message = `Summary @${summaryRefSeqNum}:${this.deltaManager.minimumSequenceNumber}`;
			const lastAck = this.summaryCollection.latestAck;

			this.summarizerNode.startSummary(summaryRefSeqNum, summaryNumberLogger);

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
					error: continueResult.error,
				};
			}

			const trace = Trace.start();
			let summarizeResult: ISummaryTreeWithStats;
			// If the GC state needs to be reset, we need to force a full tree summary and update the unreferenced
			// state of all the nodes.
			const forcedFullTree = this.garbageCollector.summaryStateNeedsReset;
			try {
				summarizeResult = await this.summarize({
					fullTree: fullTree || forcedFullTree,
					trackState: true,
					summaryLogger: summaryNumberLogger,
					runGC: this.garbageCollector.shouldRunGC,
				});
			} catch (error) {
				return {
					stage: "base",
					referenceSequenceNumber: summaryRefSeqNum,
					minimumSequenceNumber,
					error,
				};
			}

			// If validateSummaryBeforeUpload is true, validate that the summary generated is correct before uploading.
			if (this.validateSummaryBeforeUpload) {
				// Validate that the summaries generated by summarize nodes is correct.
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
				dataStoreCount: this.dataStores.size,
				summarizedDataStoreCount: this.dataStores.size - handleCount,
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
				forcedFullTree,
			} as const;

			continueResult = checkContinue();
			if (!continueResult.continue) {
				return { stage: "generate", ...generateSummaryData, error: continueResult.error };
			}

			// It may happen that the lastAck it not correct due to missing summaryAck in case of single commit
			// summary. So if the previous summarizer closes just after submitting the summary and before
			// submitting the summaryOp then we can't rely on summaryAck. So in case we have
			// latestSnapshotVersionId from storage and it does not match with the lastAck ackHandle, then use
			// the one fetched from storage as parent as that is the latest.
			let summaryContext: ISummaryContext;
			if (
				lastAck?.summaryAck.contents.handle !== latestSnapshotVersionId &&
				latestSnapshotVersionId !== undefined
			) {
				summaryContext = {
					proposalHandle: undefined,
					ackHandle: latestSnapshotVersionId,
					referenceSequenceNumber: summaryRefSeqNum,
				};
			} else if (lastAck === undefined) {
				summaryContext = {
					proposalHandle: undefined,
					ackHandle: this.loadedFromVersionId,
					referenceSequenceNumber: summaryRefSeqNum,
				};
			} else {
				summaryContext = {
					proposalHandle: lastAck.summaryOp.contents.handle,
					ackHandle: lastAck.summaryAck.contents.handle,
					referenceSequenceNumber: summaryRefSeqNum,
				};
			}

			let handle: string;
			try {
				handle = await this.storage.uploadSummaryWithContext(
					summarizeResult.summary,
					summaryContext,
				);
			} catch (error) {
				return { stage: "generate", ...generateSummaryData, error };
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
				return { stage: "upload", ...uploadData, error: continueResult.error };
			}

			let clientSequenceNumber: number;
			try {
				clientSequenceNumber = this.submitSummaryMessage(summaryMessage, summaryRefSeqNum);
			} catch (error) {
				return { stage: "upload", ...uploadData, error };
			}

			const submitData = {
				stage: "submit",
				...uploadData,
				clientSequenceNumber,
				submitOpDuration: trace.trace().duration,
			} as const;

			try {
				// If validateSummaryBeforeUpload is false, the summary should be validated in this step.
				this.summarizerNode.completeSummary(
					handle,
					!this.validateSummaryBeforeUpload /* validate */,
				);
			} catch (error) {
				return { stage: "upload", ...uploadData, error };
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

	public submitDataStoreOp(
		id: string,
		contents: any,
		localOpMetadata: unknown = undefined,
	): void {
		const envelope: IEnvelope = {
			address: id,
			contents,
		};
		this.submit(
			{ type: ContainerMessageType.FluidDataStoreOp, contents: envelope },
			localOpMetadata,
		);
	}

	public submitDataStoreAliasOp(contents: any, localOpMetadata: unknown): void {
		const aliasMessage = contents as IDataStoreAliasMessage;
		if (!isDataStoreAliasMessage(aliasMessage)) {
			throw new UsageError("malformedDataStoreAliasMessage");
		}

		this.submit({ type: ContainerMessageType.Alias, contents }, localOpMetadata);
	}

	public async uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>> {
		this.verifyNotClosed();
		return this.blobManager.createBlob(blob, signal);
	}

	private maybeSubmitIdAllocationOp(type: ContainerMessageType) {
		if (type !== ContainerMessageType.IdAllocation) {
			let idAllocationBatchMessage: BatchMessage | undefined;
			let idRange: IdCreationRange | undefined;
			if (this.idCompressorEnabled) {
				assert(
					this.idCompressor !== undefined,
					0x67d /* IdCompressor should be defined if enabled */,
				);
				idRange = this.idCompressor.takeNextCreationRange();
				// Don't include the idRange if there weren't any Ids allocated
				idRange = idRange?.ids !== undefined ? idRange : undefined;
			}

			if (idRange !== undefined) {
				const idAllocationMessage: ContainerRuntimeIdAllocationMessage = {
					type: ContainerMessageType.IdAllocation,
					contents: idRange,
				};
				idAllocationBatchMessage = {
					contents: JSON.stringify(idAllocationMessage),
					referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
					metadata: undefined,
					localOpMetadata: undefined,
					type: ContainerMessageType.IdAllocation,
				};
			}

			if (idAllocationBatchMessage !== undefined) {
				this.outbox.submitIdAllocation(idAllocationBatchMessage);
			}
		}
	}

	private submit(
		containerRuntimeMessage: OutboundContainerRuntimeMessage,
		localOpMetadata: unknown = undefined,
		metadata: Record<string, unknown> | undefined = undefined,
	): void {
		this.verifyNotClosed();
		this.verifyCanSubmitOps();

		// There should be no ops in detached container state!
		assert(
			this.attachState !== AttachState.Detached,
			0x132 /* "sending ops in detached container" */,
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
		const message: BatchMessage = {
			contents: serializedContent,
			type,
			metadata,
			localOpMetadata,
			referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
		};

		try {
			// Submit an IdAllocation op if any Ids have been generated since
			// the last op was submitted. Don't submit another if it's an IdAllocation
			// op as that means we're in resubmission flow and we don't want to send
			// IdRanges out of order.
			this.maybeSubmitIdAllocationOp(type);

			// If this is attach message for new data store, and we are in a batch, send this op out of order
			// Is it safe:
			//    Yes, this should be safe reordering. Newly created data stores are not visible through API surface.
			//    They become visible only when aliased, or handle to some sub-element of newly created datastore
			//    is stored in some DDS, i.e. only after some other op.
			// Why:
			//    Attach ops are large, and expensive to process. Plus there are scenarios where a lot of new data
			//    stores are created, causing issues like relay service throttling (too many ops) and catastrophic
			//    failure (batch is too large). Pushing them earlier and outside of main batch should alleviate
			//    these issues.
			// Cons:
			//    1. With large batches, relay service may throttle clients. Clients may disconnect while throttled.
			//    This change creates new possibility of a lot of newly created data stores never being referenced
			//    because client died before it had a change to submit the rest of the ops. This will create more
			//    garbage that needs to be collected leveraging GC (Garbage Collection) feature.
			//    2. Sending ops out of order means they are excluded from rollback functionality. This is not an issue
			//    today as rollback can't undo creation of data store. To some extent not sending them is a bigger
			//    issue than sending.
			// Please note that this does not change file format, so it can be disabled in the future if this
			// optimization no longer makes sense (for example, batch compression may make it less appealing).
			if (
				this.currentlyBatching() &&
				type === ContainerMessageType.Attach &&
				this.disableAttachReorder !== true
			) {
				this.outbox.submitAttach(message);
			} else if (type === ContainerMessageType.BlobAttach) {
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

	private verifyCanSubmitOps() {
		if (this.ensureNoDataModelChangesCalls > 0) {
			const errorMessage =
				"Op was submitted from within a `ensureNoDataModelChanges` callback";
			if (this.opReentryCallsToReport > 0) {
				this.mc.logger.sendTelemetryEvent(
					{ eventName: "OpReentry" },
					// We need to capture the call stack in order to inspect the source of this usage pattern
					getLongStack(() => new UsageError(errorMessage)),
				);
				this.opReentryCallsToReport--;
			}

			// Creating ops while processing ops can lead
			// to undefined behavior and events observed in the wrong order.
			// For example, we have two callbacks registered for a DDS, A and B.
			// Then if on change #1 callback A creates change #2, the invocation flow will be:
			//
			// A because of #1
			// A because of #2
			// B because of #2
			// B because of #1
			//
			// The runtime must enforce op coherence by not allowing ops to be submitted
			// while ops are being processed.
			if (this.enableOpReentryCheck) {
				throw new UsageError(errorMessage);
			}
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
		switch (message.type) {
			case ContainerMessageType.FluidDataStoreOp:
				// For Operations, call resubmitDataStoreOp which will find the right store
				// and trigger resubmission on it.
				this.dataStores.resubmitDataStoreOp(message.contents, localOpMetadata);
				break;
			case ContainerMessageType.Attach:
			case ContainerMessageType.Alias:
			case ContainerMessageType.IdAllocation: {
				this.submit(message, localOpMetadata);
				break;
			}
			case ContainerMessageType.ChunkedOp:
				throw new Error(`chunkedOp not expected here`);
			case ContainerMessageType.BlobAttach:
				this.blobManager.reSubmit(opMetadata);
				break;
			case ContainerMessageType.Rejoin:
				this.submit(message);
				break;
			case ContainerMessageType.GC:
				// GC op is only sent in summarizer which should never reconnect.
				throw new LoggingError("GC op not expected to be resubmitted in summarizer");
			default: {
				// This case should be very rare - it would imply an op was stashed from a
				// future version of runtime code and now is being applied on an older version
				const compatBehavior = message.compatDetails?.behavior;
				if (compatBehaviorAllowsMessageType(message.type, compatBehavior)) {
					this.logger.sendTelemetryEvent({
						eventName: "resubmitUnrecognizedMessageTypeAllowed",
						messageDetails: { type: message.type, compatBehavior },
					});
				} else {
					const error = DataProcessingError.create(
						"Resubmitting runtime message of unknown type",
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
				this.dataStores.rollbackDataStoreOp(contents, localOpMetadata);
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
			const fetchResult = await this.fetchLatestSnapshotFromStorage(
				summaryLogger,
				{
					eventName: "RefreshLatestSummaryAckFetch",
					ackHandle,
					targetSequenceNumber: summaryRefSeq,
				},
				readAndParseBlob,
			);

			/**
			 * If the fetched snapshot is older than the one for which the ack was received, close the container.
			 * This should never happen because an ack should be sent after the latest summary is updated in the server.
			 * However, there are couple of scenarios where it's possible:
			 * 1. A file was modified externally resulting in modifying the snapshot's sequence number. This can lead to
			 * the document being unusable and we should not proceed.
			 * 2. The server DB failed after the ack was sent which may delete the corresponding snapshot. Ideally, in
			 * such cases, the file will be rolled back along with the ack and we will eventually reach a consistent
			 * state.
			 */
			if (fetchResult.latestSnapshotRefSeq < summaryRefSeq) {
				const error = DataProcessingError.create(
					"Fetched snapshot is older than the received ack",
					"RefreshLatestSummaryAck",
					undefined /* sequencedMessage */,
					{
						ackHandle,
						summaryRefSeq,
						fetchedSnapshotRefSeq: fetchResult.latestSnapshotRefSeq,
					},
				);
				this.disposeFn(error);
				throw error;
			}

			await this.closeStaleSummarizer("RefreshLatestSummaryAckFetch");
			return;
		}

		// Notify the garbage collector so it can update its latest summary state.
		await this.garbageCollector.refreshLatestSummary(result);
	}

	/**
	 * Fetches the latest snapshot from storage to refresh the cache as a performance optimization and closes the
	 * summarizer to reload from new state.
	 * @param summaryLogger - logger to use when fetching snapshot from storage
	 * @returns a generic summarization error
	 */
	private async prefetchLatestSummaryThenClose(
		summaryLogger: ITelemetryLoggerExt,
	): Promise<IBaseSummarizeResult> {
		const readAndParseBlob = async <T>(id: string) => readAndParse<T>(this.storage, id);

		// This is a performance optimization as the same parent is likely to be elected again, and would use its
		// cache to fetch the snapshot instead of the network.
		await this.fetchLatestSnapshotFromStorage(
			summaryLogger,
			{
				eventName: "RefreshLatestSummaryFromServerFetch",
			},
			readAndParseBlob,
		);

		await this.closeStaleSummarizer("RefreshLatestSummaryFromServerFetch");

		return {
			stage: "base",
			error: "summary state stale - Unsupported option 'refreshLatestAck'",
			referenceSequenceNumber: this.deltaManager.lastSequenceNumber,
			minimumSequenceNumber: this.deltaManager.minimumSequenceNumber,
		};
	}

	private async closeStaleSummarizer(codePath: string): Promise<void> {
		// Delay before restarting summarizer to prevent the summarizer from restarting too frequently.
		await delay(this.closeSummarizerDelayMs);
		this._summarizer?.stop("latestSummaryStateStale");
		this.disposeFn();
	}

	/**
	 * Downloads the latest snapshot from storage.
	 * By default, it also closes the container after downloading the snapshot. However, this may be
	 * overridden via options.
	 */
	private async fetchLatestSnapshotFromStorage(
		logger: ITelemetryLoggerExt,
		event: ITelemetryGenericEvent,
		readAndParseBlob: ReadAndParseBlob,
	): Promise<{ snapshotTree: ISnapshotTree; versionId: string; latestSnapshotRefSeq: number }> {
		return PerformanceEvent.timedExecAsync(
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
				return {
					snapshotTree: maybeSnapshot,
					versionId: versions[0].id,
					latestSnapshotRefSeq,
				};
			},
		);
	}

	public async getPendingLocalState(props?: IGetPendingLocalStateProps): Promise<unknown> {
		return PerformanceEvent.timedExecAsync(
			this.mc.logger,
			{
				eventName: "getPendingLocalState",
				notifyImminentClosure: props?.notifyImminentClosure,
			},
			async (event) => {
				this.verifyNotClosed();
				// in case imminentClosure is set to true by future code, we don't
				// try to change its value
				if (!this.imminentClosure) {
					this.imminentClosure = props?.notifyImminentClosure ?? this.imminentClosure;
				}
				const stopBlobAttachingSignal = props?.stopBlobAttachingSignal;
				if (this._orderSequentiallyCalls !== 0) {
					throw new UsageError("can't get state during orderSequentially");
				}
				// Flush pending batch.
				// getPendingLocalState() is only exposed through Container.closeAndGetPendingLocalState(), so it's safe
				// to close current batch.
				this.flush();
				const pendingAttachmentBlobs = this.imminentClosure
					? await this.blobManager.attachAndGetPendingBlobs(stopBlobAttachingSignal)
					: undefined;
				const pending = this.pendingStateManager.getLocalState();
				if (!pendingAttachmentBlobs && !this.hasPendingMessages()) {
					return; // no pending state to save
				}

				const pendingIdCompressorState = this.idCompressor?.serialize(true);

				const pendingState: IPendingRuntimeState = {
					pending,
					pendingAttachmentBlobs,
					pendingIdCompressorState,
				};
				event.end({
					attachmentBlobsSize: Object.keys(pendingAttachmentBlobs ?? {}).length,
					pendingOpsSize: pending?.pendingStates.length,
				});
				return pendingState;
			},
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
		const killSwitch = this.mc.config.getBoolean(
			"Fluid.ContainerRuntime.DisableGroupedBatching",
		);
		return killSwitch !== true && this.runtimeOptions.enableGroupedBatching;
	}
}
