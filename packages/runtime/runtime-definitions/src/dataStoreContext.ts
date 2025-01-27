/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AttachState, IAudience } from "@fluidframework/container-definitions";
import type { IDeltaManager } from "@fluidframework/container-definitions/internal";
import type {
	FluidObject,
	IDisposable,
	IEvent,
	IEventProvider,
	IFluidHandle,
	IRequest,
	IResponse,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type {
	IFluidHandleInternal,
	IProvideFluidHandleContext,
} from "@fluidframework/core-interfaces/internal";
import type { IClientDetails, IQuorumClients } from "@fluidframework/driver-definitions";
import type {
	IDocumentStorageService,
	IDocumentMessage,
	ISnapshotTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import type {
	IFluidDataStoreFactory,
	IProvideFluidDataStoreFactory,
} from "./dataStoreFactory.js";
import type { IProvideFluidDataStoreRegistry } from "./dataStoreRegistry.js";
import type {
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
} from "./garbageCollectionDefinitions.js";
import type { IInboundSignalMessage, IRuntimeMessageCollection } from "./protocol.js";
import type {
	CreateChildSummarizerNodeParam,
	ISummarizerNodeWithGC,
	ISummaryTreeWithStats,
	ITelemetryContext,
	SummarizeInternalFn,
} from "./summary.js";

/**
 * Runtime flush mode handling
 * @legacy
 * @alpha
 */
export enum FlushMode {
	/**
	 * In Immediate flush mode the runtime will immediately send all operations to the driver layer.
	 *
	 * @deprecated This option will be removed in the next major version and should not be used. Use {@link FlushMode.TurnBased} instead, which is the default.
	 * See https://github.com/microsoft/FluidFramework/tree/main/packages/runtime/container-runtime/src/opLifecycle#how-batching-works
	 */
	Immediate,

	/**
	 * When in TurnBased flush mode the runtime will buffer operations in the current turn and send them as a single
	 * batch at the end of the turn. The flush call on the runtime can be used to force send the current batch.
	 */
	TurnBased,
}

/**
 * @internal
 */
export enum FlushModeExperimental {
	/**
	 * When in Async flush mode, the runtime will accumulate all operations across JS turns and send them as a single
	 * batch when all micro-tasks are complete.
	 *
	 * This feature requires a version of the loader which supports reference sequence numbers. If an older version of
	 * the loader is used, the runtime will fall back on FlushMode.TurnBased.
	 *
	 * @experimental - Not ready for use
	 */
	Async = 2,
}

/**
 * This tells the visibility state of a Fluid object. It basically tracks whether the object is not visible, visible
 * locally within the container only or visible globally to all clients.
 * @legacy
 * @alpha
 */
export const VisibilityState = {
	/**
	 * Indicates that the object is not visible. This is the state when an object is first created.
	 */
	NotVisible: "NotVisible",

	/**
	 * Indicates that the object is visible locally within the container. This is the state when an object is attached
	 * to the container's graph but the container itself isn't globally visible. The object's state goes from not
	 * visible to locally visible.
	 */
	LocallyVisible: "LocallyVisible",

	/**
	 * Indicates that the object is visible globally to all clients. This is the state of an object in 2 scenarios:
	 *
	 * 1. It is attached to the container's graph when the container is globally visible. The object's state goes from
	 * not visible to globally visible.
	 *
	 * 2. When a container becomes globally visible, all locally visible objects go from locally visible to globally
	 * visible.
	 */
	GloballyVisible: "GloballyVisible",
};
/**
 * @legacy
 * @alpha
 */
export type VisibilityState = (typeof VisibilityState)[keyof typeof VisibilityState];

/**
 * @legacy
 * @alpha
 * @sealed
 */
export interface IContainerRuntimeBaseEvents extends IEvent {
	/**
	 * Indicates the beginning of an incoming batch of ops
	 * @param op - The first op in the batch. Can be inspected to learn about the sequence numbers relevant for this batch.
	 */
	(event: "batchBegin", listener: (op: Omit<ISequencedDocumentMessage, "contents">) => void);
	/**
	 * Indicates the end of an incoming batch of ops
	 * @param error - If an error occurred while processing the batch, it is provided here.
	 * @param op - The last op in the batch. Can be inspected to learn about the sequence numbers relevant for this batch.
	 */
	(
		event: "batchEnd",
		listener: (error: unknown, op: Omit<ISequencedDocumentMessage, "contents">) => void,
	);
	/**
	 * Indicates that an incoming op has been processed.
	 * @param runtimeMessage - tells if op is runtime op. If it is, it was unpacked, i.e. its type and content
	 * represent internal container runtime type / content. i.e. A grouped batch of N ops will result in N "op" events
	 */
	(event: "op", listener: (op: ISequencedDocumentMessage, runtimeMessage?: boolean) => void);
	(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
	(event: "dispose", listener: () => void);
}

/**
 * Encapsulates the return codes of the aliasing API.
 *
 * 'Success' - the datastore has been successfully aliased. It can now be used.
 * 'Conflict' - there is already a datastore bound to the provided alias. To acquire it's entry point, use
 * the `IContainerRuntime.getAliasedDataStoreEntryPoint` function. The current datastore should be discarded
 * and will be garbage collected. The current datastore cannot be aliased to a different value.
 * 'AlreadyAliased' - the datastore has already been previously bound to another alias name.
 * @legacy
 * @alpha
 */
export type AliasResult = "Success" | "Conflict" | "AlreadyAliased";

/**
 * Exposes some functionality/features of a data store:
 * - Handle to the data store's entryPoint
 * - Fluid router for the data store
 * - Can be assigned an alias
 * @legacy
 * @alpha
 */
export interface IDataStore {
	/**
	 * Attempt to assign an alias to the datastore.
	 * If the operation succeeds, the datastore can be referenced
	 * by the supplied alias and will not be garbage collected.
	 *
	 * @param alias - Given alias for this datastore.
	 * @returns A promise with the {@link AliasResult}
	 */
	trySetAlias(alias: string): Promise<AliasResult>;

	/**
	 * Exposes a handle to the root object / entryPoint of the data store. Use this as the primary way of interacting
	 * with it.
	 */
	readonly entryPoint: IFluidHandleInternal<FluidObject>;
}

/**
 * A reduced set of functionality of IContainerRuntime that a data store context/data store runtime will need
 * TODO: this should be merged into IFluidDataStoreContext
 * @legacy
 * @alpha
 * @sealed
 */
export interface IContainerRuntimeBase extends IEventProvider<IContainerRuntimeBaseEvents> {
	readonly baseLogger: ITelemetryBaseLogger;
	readonly clientDetails: IClientDetails;
	readonly disposed: boolean;

	/**
	 * Invokes the given callback and guarantees that all operations generated within the callback will be ordered
	 * sequentially.
	 *
	 * If the callback throws an error, the container will close and the error will be logged.
	 */
	orderSequentially(callback: () => void): void;

	/**
	 * Submits a container runtime level signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal. Should be a JSON serializable object or primitive.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	submitSignal: (type: string, content: unknown, targetClientId?: string) => void;

	/**
	 * Creates a data store and returns an object that exposes a handle to the data store's entryPoint, and also serves
	 * as the data store's router. The data store is not bound to a container, and in such state is not persisted to
	 * storage (file). Storing the entryPoint handle (or any other handle inside the data store, e.g. for DDS) into an
	 * already attached DDS (or non-attached DDS that will eventually get attached to storage) will result in this
	 * store being attached to storage.
	 * @param pkg - Package name of the data store factory
	 * @param loadingGroupId - This represents the group of the datastore within a container or its snapshot.
	 * When not specified the datastore will belong to a `default` group. Read more about it in this
	 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/README.md | README}
	 */
	createDataStore(
		pkg: Readonly<string | string[]>,
		loadingGroupId?: string,
	): Promise<IDataStore>;

	/**
	 * Creates detached data store context. Only after context.attachRuntime() is called,
	 * data store initialization is considered complete.
	 * @param pkg - Package name of the data store factory
	 * @param loadingGroupId - This represents the group of the datastore within a container or its snapshot.
	 * When not specified the datastore will belong to a `default` group. Read more about it in this
	 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/README.md | README}.
	 */
	createDetachedDataStore(
		pkg: Readonly<string[]>,
		loadingGroupId?: string,
	): IFluidDataStoreContextDetached;

	/**
	 * Returns the aliased data store's entryPoint, given the alias.
	 * @param alias - The alias for the data store.
	 * @returns The data store's entry point ({@link @fluidframework/core-interfaces#IFluidHandle}) if it exists and is aliased.
	 * Returns undefined if no data store has been assigned the given alias.
	 */
	getAliasedDataStoreEntryPoint(alias: string): Promise<IFluidHandle<FluidObject> | undefined>;

	/**
	 * Get an absolute url for a provided container-relative request.
	 * Returns undefined if the container or data store isn't attached to storage.
	 * @param relativeUrl - A relative request within the container
	 */
	getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

	uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandle<ArrayBufferLike>>;

	/**
	 * Returns the current quorum.
	 */
	getQuorum(): IQuorumClients;

	/**
	 * Returns the current audience.
	 */
	getAudience(): IAudience;

	/**
	 * Generates a new ID that is guaranteed to be unique across all sessions for this container.
	 * It could be in compact form (non-negative integer, opportunistic), but it could also be UUID string.
	 * UUIDs generated will have low entropy in groups and will compress well.
	 * It can be leveraged anywhere in container where container unique IDs are required, i.e. any place
	 * that uses uuid() and stores result in container is likely candidate to start leveraging this API.
	 * If you always want to convert to string, instead of doing String(generateDocumentUniqueId()), consider
	 * doing encodeCompactIdToString(generateDocumentUniqueId()).
	 *
	 * @see {@link @fluidframework/id-compressor#IIdCompressor.generateDocumentUniqueId}
	 */
	generateDocumentUniqueId(): number | string;

	/**
	 * Api to fetch the snapshot from the service for a loadingGroupIds.
	 * @param loadingGroupIds - LoadingGroupId for which the snapshot is asked for.
	 * @param pathParts - Parts of the path, which we want to extract from the snapshot tree.
	 * @returns snapshotTree and the sequence number of the snapshot.
	 */
	getSnapshotForLoadingGroupId(
		loadingGroupIds: string[],
		pathParts: string[],
	): Promise<{ snapshotTree: ISnapshotTree; sequenceNumber: number }>;
}

/**
 * Minimal interface a data store runtime needs to provide for IFluidDataStoreContext to bind to control.
 *
 * Functionality include attach, snapshot, op/signal processing, request routes, expose an entryPoint,
 * and connection state notifications
 * @legacy
 * @alpha
 */
export interface IFluidDataStoreChannel extends IDisposable {
	/**
	 * Makes the data store channel visible in the container. Also, runs through its graph and attaches all
	 * bound handles that represent its dependencies in the container's graph.
	 */
	makeVisibleAndAttachGraph(): void;

	/**
	 * Synchronously retrieves the summary used as part of the initial summary message
	 */
	getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats;

	/**
	 * Synchronously retrieves GC Data (representing the outbound routes present) for the initial state of the DataStore
	 */
	getAttachGCData(telemetryContext?: ITelemetryContext): IGarbageCollectionData;

	/**
	 * Process messages for this channel. The messages here are contiguous messages in a batch.
	 * @param messageCollection - The collection of messages to process.
	 */
	processMessages(messageCollection: IRuntimeMessageCollection): void;

	/**
	 * Processes the signal.
	 */
	processSignal(message: IInboundSignalMessage, local: boolean): void;

	/**
	 * Generates a summary for the channel.
	 * Introduced with summarizerNode - will be required in a future release.
	 * @param fullTree - true to bypass optimizations and force a full summary tree.
	 * @param trackState - This tells whether we should track state from this summary.
	 * @param telemetryContext - summary data passed through the layers for telemetry purposes
	 */
	summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats>;

	/**
	 * Returns the data used for garbage collection. This includes a list of GC nodes that represent this context
	 * including any of its children. Each node has a list of outbound routes to other GC nodes in the document.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;

	/**
	 * After GC has run, called to notify this channel of routes that are used in it.
	 * @param usedRoutes - The routes that are used in this channel.
	 */
	updateUsedRoutes(usedRoutes: string[]): void;

	/**
	 * Notifies this object about changes in the connection state.
	 * @param value - New connection state.
	 * @param clientId - ID of the client. It's old ID when in disconnected state and
	 * it's new client ID when we are connecting or connected.
	 */
	setConnectionState(connected: boolean, clientId?: string);

	/**
	 * Ask the DDS to resubmit a message. This could be because we reconnected and this message was not acked.
	 * @param type - The type of the original message.
	 * @param content - The content of the original message.
	 * @param localOpMetadata - The local metadata associated with the original message.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO (#28746): breaking change
	reSubmit(type: string, content: any, localOpMetadata: unknown);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO (#28746): breaking change
	applyStashedOp(content: any): Promise<unknown>;

	/**
	 * Revert a local message.
	 * @param type - The type of the original message.
	 * @param content - The content of the original message.
	 * @param localOpMetadata - The local metadata associated with the original message.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO (#28746): breaking change
	rollback?(type: string, content: any, localOpMetadata: unknown): void;

	/**
	 * Exposes a handle to the root object / entryPoint of the component. Use this as the primary way of interacting
	 * with the component.
	 */
	readonly entryPoint: IFluidHandleInternal<FluidObject>;

	request(request: IRequest): Promise<IResponse>;

	setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void;
}

/**
 * @legacy
 * @alpha
 */
export type CreateChildSummarizerNodeFn = (
	summarizeInternal: SummarizeInternalFn,
	getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
	/**
	 * @deprecated The functionality to get base GC details has been moved to summarizer node.
	 */
	getBaseGCDetailsFn?: () => Promise<IGarbageCollectionDetailsBase>,
) => ISummarizerNodeWithGC;

/**
 * The state maintained for messages that are received when a channel isn't yet loaded.
 * @internal
 */
export interface IPendingMessagesState {
	messageCollections: IRuntimeMessageCollection[];
	pendingCount: number;
}

/**
 * Represents the context for the data store like objects. It is used by the data store runtime to
 * get information and call functionality to its parent.
 *
 * This layout is temporary, as {@link IFluidParentContext} and {@link IFluidDataStoreContext} will converge.
 *
 * @legacy
 * @alpha
 */
export interface IFluidParentContext
	extends IProvideFluidHandleContext,
		Partial<IProvideFluidDataStoreRegistry> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO (#28746): breaking change
	readonly options: Record<string | number, any>;
	readonly clientId: string | undefined;
	readonly connected: boolean;
	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	readonly storage: IDocumentStorageService;
	readonly baseLogger: ITelemetryBaseLogger;
	readonly clientDetails: IClientDetails;
	readonly idCompressor?: IIdCompressor;
	/**
	 * Represents the loading group to which the data store belongs to. Please refer to this readme for more context.
	 * {@link https://github.com/microsoft/FluidFramework/blob/main/packages/runtime/container-runtime/README.md | README}
	 */
	readonly loadingGroupId?: string;
	/**
	 * Indicates the attachment state of the data store to a host service.
	 */
	readonly attachState: AttachState;

	readonly containerRuntime: IContainerRuntimeBase;

	/**
	 * Ambient services provided with the context
	 */
	readonly scope: FluidObject;

	/**
	 * @deprecated this functionality has been removed.
	 */
	readonly gcThrowOnTombstoneUsage: boolean;
	/**
	 * @deprecated this functionality has been removed.
	 */
	readonly gcTombstoneEnforcementAllowed: boolean;

	/**
	 * Returns the current quorum.
	 */
	getQuorum(): IQuorumClients;

	/**
	 * Returns the current audience.
	 */
	getAudience(): IAudience;

	/**
	 * Submits the message to be sent to other clients.
	 * @param type - Type of the message.
	 * @param content - Content of the message.
	 * @param localOpMetadata - The local metadata associated with the message. This is kept locally and not sent to
	 * the server. This will be sent back when this message is received back from the server. This is also sent if
	 * we are asked to resubmit the message.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO (#28746): breaking change
	submitMessage(type: string, content: any, localOpMetadata: unknown): void;

	/**
	 * Submits the signal to be sent to other clients.
	 * @param type - Type of the signal.
	 * @param content - Content of the signal. Should be a JSON serializable object or primitive.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	submitSignal: (type: string, content: unknown, targetClientId?: string) => void;

	/**
	 * Called to make the data store locally visible in the container. This happens automatically for root data stores
	 * when they are marked as root. For non-root data stores, this happens when their handle is added to a visible DDS.
	 */
	makeLocallyVisible(): void;

	/**
	 * Get an absolute url to the container based on the provided relativeUrl.
	 * Returns undefined if the container or data store isn't attached to storage.
	 * @param relativeUrl - A relative request within the container
	 */
	getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

	getCreateChildSummarizerNodeFn(
		/**
		 * Initial id or path part of this node
		 */
		id: string,
		/**
		 * Information needed to create the node.
		 * If it is from a base summary, it will assert that a summary has been seen.
		 * Attach information if it is created from an attach op.
		 * If it is local, it will throw unsupported errors on calls to summarize.
		 */
		createParam: CreateChildSummarizerNodeParam,
	): CreateChildSummarizerNodeFn;

	deleteChildSummarizerNode(id: string): void;

	uploadBlob(
		blob: ArrayBufferLike,
		signal?: AbortSignal,
	): Promise<IFluidHandleInternal<ArrayBufferLike>>;

	/**
	 * Called by IFluidDataStoreChannel, indicates that a channel is dirty and needs to be part of the summary.
	 * @param address - The address of the channel that is dirty.
	 */
	setChannelDirty(address: string): void;

	/**
	 * Called when a new outbound reference is added to another node. This is used by garbage collection to identify
	 * all references added in the system.
	 *
	 * @param fromPath - The absolute path of the node that added the reference.
	 * @param toPath - The absolute path of the outbound node that is referenced.
	 * @param messageTimestampMs - The timestamp of the message that added the reference.
	 */
	addedGCOutboundRoute(fromPath: string, toPath: string, messageTimestampMs?: number): void;
}

/**
 * Represents the context for the data store. It is used by the data store runtime to
 * get information and call functionality to the container.
 * @legacy
 * @alpha
 */
export interface IFluidDataStoreContext extends IFluidParentContext {
	readonly id: string;
	/**
	 * A data store created by a client, is a local data store for that client. Also, when a detached container loads
	 * from a snapshot, all the data stores are treated as local data stores because at that stage the container
	 * still doesn't exists in storage and so the data store couldn't have been created by any other client.
	 * Value of this never changes even after the data store is attached.
	 * As implementer of data store runtime, you can use this property to check that this data store belongs to this
	 * client and hence implement any scenario based on that.
	 */
	readonly isLocalDataStore: boolean;
	/**
	 * The package path of the data store as per the package factory.
	 */
	readonly packagePath: readonly string[];
	readonly baseSnapshot: ISnapshotTree | undefined;

	/**
	 * @deprecated 0.16 Issue #1635, #3631
	 */
	// Seems like this can be removed now; the issues mentioned in the @deprecated tag are about _createDataStoreWithProps
	// which we finally removed in FF 2.20 (https://github.com/microsoft/FluidFramework/pull/22996).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO (#28746): breaking change
	readonly createProps?: any;

	/**
	 * @deprecated The functionality to get base GC details has been moved to summarizer node.
	 *
	 * Returns the GC details in the initial summary of this data store. This is used to initialize the data store
	 * and its children with the GC details from the previous summary.
	 */
	getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase>;

	/**
	 * Synchronously creates a detached child data store.
	 *
	 * The `createChildDataStore` method allows for the synchronous creation of a detached child data store. This is particularly
	 * useful in scenarios where immediate availability of the child data store is required, such as during the initialization
	 * of a parent data store, or when creation is in response to synchronous user input.
	 *
	 * In order for this function to succeed:
	 * 1. The parent data store's factory must also be an `IFluidDataStoreRegistry`.
	 * 2. The parent data store's registry must include the same instance as the provided child factory.
	 * 3. The parent data store's registry must synchronously provide the child factory via the `getSync` method.
	 * 4. The child factory must implement the `createDataStore` method.
	 *
	 * These invariants ensure that the child data store can also be created by a remote client running the same code as this client.
	 *
	 * @param childFactory - The factory of the data store to be created.
	 * @returns The created data store channel.
	 */
	createChildDataStore?<T extends IFluidDataStoreFactory>(
		childFactory: T,
	): ReturnType<Exclude<T["createDataStore"], undefined>>;
}

/**
 * @legacy
 * @alpha
 */
export interface IFluidDataStoreContextDetached extends IFluidDataStoreContext {
	/**
	 * Binds a runtime to the context.
	 */
	attachRuntime(
		factory: IProvideFluidDataStoreFactory,
		dataStoreRuntime: IFluidDataStoreChannel,
	): Promise<IDataStore>;
}
