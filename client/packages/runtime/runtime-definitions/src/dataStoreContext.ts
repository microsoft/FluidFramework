/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger, IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
import {
    IFluidRouter,
    IProvideFluidHandleContext,
    IFluidHandle,
    IRequest,
    IResponse,
    FluidObject,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IDeltaManager,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    IClientDetails,
    IDocumentMessage,
    IQuorumClients,
    ISequencedDocumentMessage,
    ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import { IProvideFluidDataStoreFactory } from "./dataStoreFactory";
import { IProvideFluidDataStoreRegistry } from "./dataStoreRegistry";
import {
    IGarbageCollectionData,
    IGarbageCollectionDetailsBase,
} from "./garbageCollection";
import { IInboundSignalMessage } from "./protocol";
import {
    CreateChildSummarizerNodeParam,
    ISummarizerNodeWithGC,
    ISummaryTreeWithStats,
    ITelemetryContext,
    SummarizeInternalFn,
} from "./summary";

/**
 * Runtime flush mode handling
 */
export enum FlushMode {
    /**
     * In Immediate flush mode the runtime will immediately send all operations to the driver layer.
     */
    Immediate,

    /**
     * When in TurnBased flush mode the runtime will buffer operations in the current turn and send them as a single
     * batch at the end of the turn. The flush call on the runtime can be used to force send the current batch.
     */
    TurnBased,
}

/**
 * This tells the visibility state of a Fluid object. It basically tracks whether the object is not visible, visible
 * locally within the container only or visible globally to all clients.
 */
export const VisibilityState = {
    /** Indicates that the object is not visible. This is the state when an object is first created. */
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
export type VisibilityState = typeof VisibilityState[keyof typeof VisibilityState];

export interface IContainerRuntimeBaseEvents extends IEvent{
    (event: "batchBegin", listener: (op: ISequencedDocumentMessage) => void);
    /**
     * @param runtimeMessage - tells if op is runtime op. If it is, it was unpacked, i.e. it's type and content
     * represent internal container runtime type / content.
     */
    (event: "op", listener: (op: ISequencedDocumentMessage, runtimeMessage?: boolean) => void);
    (event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void);
    (event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
}

/**
 * Encapsulates the return codes of the aliasing API.
 *
 * 'Success' - the datastore has been successfully aliased. It can now be used.
 * 'Conflict' - there is already a datastore bound to the provided alias. To acquire a handle to it,
 * use the `IContainerRuntime.getRootDataStore` function. The current datastore should be discarded
 * and will be garbage collected. The current datastore cannot be aliased to a different value.
 * 'AlreadyAliased' - the datastore has already been previously bound to another alias name.
 */
export type AliasResult = "Success" | "Conflict" | "AlreadyAliased";

/**
 * Exposes some functionality/features of a data store:
 * - Handle to the data store's entryPoint
 * - Fluid router for the data store
 * - Can be assigned an alias
 */
export interface IDataStore extends IFluidRouter {
    /**
     * Attempt to assign an alias to the datastore.
     * If the operation succeeds, the datastore can be referenced
     * by the supplied alias and will not be garbage collected.
     *
     * @param alias - Given alias for this datastore.
     */
    trySetAlias(alias: string): Promise<AliasResult>;

    /**
     * Exposes a handle to the root object / entryPoint of the data store. Use this as the primary way of interacting
     * with it. If this property is undefined (meaning that exposing the entryPoint hasn't been implemented in a
     * particular scenario) fall back to the current approach of requesting the root object through the request pattern.
     *
     * @remarks The plan is that eventually the data store will stop providing IFluidRouter functionality, this property
     * will become non-optional and return an IFluidHandle (no undefined) and will become the only way to access
     * the data store's entryPoint.
     */
    readonly entryPoint?: IFluidHandle<FluidObject>;
}

/**
 * A reduced set of functionality of IContainerRuntime that a data store context/data store runtime will need
 * TODO: this should be merged into IFluidDataStoreContext
 */
export interface IContainerRuntimeBase extends
    IEventProvider<IContainerRuntimeBaseEvents>,
    IProvideFluidHandleContext {

    readonly logger: ITelemetryBaseLogger;
    readonly clientDetails: IClientDetails;

    /**
     * Invokes the given callback and guarantees that all operations generated within the callback will be ordered
     * sequentially. Total size of all messages must be less than maxOpSize.
     */
    orderSequentially(callback: () => void): void;

    /**
     * Executes a request against the container runtime
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Submits a container runtime level signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    submitSignal(type: string, content: any): void;

    /**
    * @deprecated 0.16 Issue #1537, #3631
    * @internal
    */
    _createDataStoreWithProps(
        pkg: string | string[],
        props?: any,
        id?: string,
    ): Promise<IDataStore>;

    /**
     * Creates a data store and returns an object that exposes a handle to the data store's entryPoint, and also serves
     * as the data store's router. The data store is not bound to a container, and in such state is not persisted to
     * storage (file). Storing the entryPoint handle (or any other handle inside the data store, e.g. for DDS) into an
     * already attached DDS (or non-attached DDS that will eventually get attached to storage) will result in this
     * store being attached to storage.
     * @param pkg - Package name of the data store factory
     */
    createDataStore(pkg: string | string[]): Promise<IDataStore>;

    /**
     * Creates detached data store context. Only after context.attachRuntime() is called,
     * data store initialization is considered complete.
     */
    createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached;

    /**
     * Get an absolute url for a provided container-relative request.
     * Returns undefined if the container or data store isn't attached to storage.
     * @param relativeUrl - A relative request within the container
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

    uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorumClients;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;
}

/** @deprecated - Used only in deprecated API bindToContext */
export enum BindState {
    NotBound = "NotBound",
    Binding = "Binding",
    Bound = "Bound",
}

/**
 * Minimal interface a data store runtime needs to provide for IFluidDataStoreContext to bind to control.
 *
 * Functionality include attach, snapshot, op/signal processing, request routes, expose an entryPoint,
 * and connection state notifications
 */
export interface IFluidDataStoreChannel extends
    IFluidRouter,
    IDisposable {

    readonly id: string;

    /**
     * Indicates the attachment state of the channel to a host service.
     */
    readonly attachState: AttachState;

    readonly visibilityState?: VisibilityState;

    /**
     * Runs through the graph and attaches the bound handles. Then binds this runtime to the container.
     * @deprecated This will be removed in favor of {@link IFluidDataStoreChannel.makeVisibleAndAttachGraph}.
     */
    attachGraph(): void;

    /**
     * Makes the data store channel visible in the container. Also, runs through its graph and attaches all
     * bound handles that represent its dependencies in the container's graph.
     */
    makeVisibleAndAttachGraph(): void;

    /**
     * Retrieves the summary used as part of the initial summary message
     */
    getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats;

    /**
     * Processes the op.
     */
    process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;

    /**
     * Processes the signal.
     */
    processSignal(message: any, local: boolean): void;

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
    reSubmit(type: string, content: any, localOpMetadata: unknown);

    applyStashedOp(content: any): Promise<unknown>;

    /**
     * Revert a local message.
     * @param type - The type of the original message.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    rollback?(type: string, content: any, localOpMetadata: unknown): void;

    /**
     * Exposes a handle to the root object / entryPoint of the component. Use this as the primary way of interacting
     * with the component. If this property is undefined (meaning that exposing the entryPoint hasn't been implemented
     * in a particular scenario) fall back to the current approach of requesting the root object through the request
     * pattern.
     *
     * @remarks The plan is that eventually the component will stop providing IFluidRouter functionality, this property
     * will become non-optional and return an IFluidHandle (no undefined) and will become the only way to access
     * the component's entryPoint.
     */
    readonly entryPoint?: IFluidHandle<FluidObject>;
}

export type CreateChildSummarizerNodeFn = (
    summarizeInternal: SummarizeInternalFn,
    getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
    getBaseGCDetailsFn: () => Promise<IGarbageCollectionDetailsBase>,
) => ISummarizerNodeWithGC;

export interface IFluidDataStoreContextEvents extends IEvent {
    (event: "attaching" | "attached", listener: () => void);
}

/**
 * Represents the context for the data store. It is used by the data store runtime to
 * get information and call functionality to the container.
 */
export interface IFluidDataStoreContext extends
    IEventProvider<IFluidDataStoreContextEvents>,
    Partial<IProvideFluidDataStoreRegistry>,
    IProvideFluidHandleContext {
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
    readonly options: ILoaderOptions;
    readonly clientId: string | undefined;
    readonly connected: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly storage: IDocumentStorageService;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly logger: ITelemetryBaseLogger;
    readonly clientDetails: IClientDetails;
    /**
     * Indicates the attachment state of the data store to a host service.
     */
    readonly attachState: AttachState;

    readonly containerRuntime: IContainerRuntimeBase;

    /**
     * @deprecated 0.16 Issue #1635, #3631
     */
    readonly createProps?: any;

    /**
     * Ambient services provided with the context
     */
    readonly scope: FluidObject;

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
    submitMessage(type: string, content: any, localOpMetadata: unknown): void;

    /**
     * Submits the signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    submitSignal(type: string, content: any): void;

    /**
     * @deprecated - To be removed in favor of makeVisible.
     * Register the runtime to the container
     */
    bindToContext(): void;

    /**
     * Called to make the data store locally visible in the container. This happens automatically for root data stores
     * when they are marked as root. For non-root data stores, this happens when their handle is added to a visible DDS.
     */
    makeLocallyVisible(): void;

    /**
     * Call by IFluidDataStoreChannel, indicates that a channel is dirty and needs to be part of the summary.
     * @param address - The address of the channel that is dirty.
     */
    setChannelDirty(address: string): void;

    /**
     * Get an absolute url to the container based on the provided relativeUrl.
     * Returns undefined if the container or data store isn't attached to storage.
     * @param relativeUrl - A relative request within the container
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

    getCreateChildSummarizerNodeFn(
        /** Initial id or path part of this node */
        id: string,
        /**
         * Information needed to create the node.
         * If it is from a base summary, it will assert that a summary has been seen.
         * Attach information if it is created from an attach op.
         * If it is local, it will throw unsupported errors on calls to summarize.
         */
        createParam: CreateChildSummarizerNodeParam,
    ): CreateChildSummarizerNodeFn;

    uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>>;

    /**
     * Returns the GC details in the initial summary of this data store. This is used to initialize the data store
     * and its children with the GC details from the previous summary.
     */
    getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase>;

    /**
     * Called when a new outbound reference is added to another node. This is used by garbage collection to identify
     * all references added in the system.
     * @param srcHandle - The handle of the node that added the reference.
     * @param outboundHandle - The handle of the outbound node that is referenced.
     */
    addedGCOutboundReference?(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void;
}

export interface IFluidDataStoreContextDetached extends IFluidDataStoreContext {
    /**
     * Binds a runtime to the context.
     */
    attachRuntime(
        factory: IProvideFluidDataStoreFactory,
        dataStoreRuntime: IFluidDataStoreChannel,
    ): Promise<void>;
}
