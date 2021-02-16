/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IFluidRouter,
    IProvideFluidHandleContext,
    IFluidHandle,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IDeltaManager,
    ContainerWarning,
    ILoader,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import { IProvideFluidDataStoreFactory } from "./dataStoreFactory";
import { IProvideFluidDataStoreRegistry } from "./dataStoreRegistry";
import { IGarbageCollectionData, IGarbageCollectionSummaryDetails } from "./garbageCollection";
import { IInboundSignalMessage } from "./protocol";
import {
    CreateChildSummarizerNodeParam,
    IChannelSummarizeResult,
    ISummarizerNodeWithGC,
    SummarizeInternalFn,
} from "./summary";
import { ITaskManager } from "./agent";

/**
 * Runtime flush mode handling
 */
export enum FlushMode {
    /**
     * In automatic flush mode the runtime will immediately send all operations to the driver layer.
     */
    Automatic,

    /**
     * When in manual flush mode the runtime will buffer operations in the current turn and send them as a single
     * batch at the end of the turn. The flush call on the runtime can be used to force send the current batch.
     */
    Manual,
}

export interface IContainerRuntimeBaseEvents extends IEvent{

    (event: "batchBegin" | "op", listener: (op: ISequencedDocumentMessage) => void);
    (event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void);
    (event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void);
    (event: "leader" | "notleader", listener: () => void);
}

/**
 * A reduced set of functionality of IContainerRuntime that a data store context/data store runtime will need
 * TODO: this should be merged into IFluidDataStoreContext
 */
export interface IContainerRuntimeBase extends
    IEventProvider<IContainerRuntimeBaseEvents>,
    IProvideFluidHandleContext
{

    readonly logger: ITelemetryLogger;
    readonly clientDetails: IClientDetails;

    /**
     * Invokes the given callback and guarantees that all operations generated within the callback will be ordered
     * sequentially. Total size of all messages must be less than maxOpSize.
     */
    orderSequentially(callback: () => void): void;

    /**
     * Sets the flush mode for operations on the document.
     */
    setFlushMode(mode: FlushMode): void;

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
    _createDataStoreWithProps(pkg: string | string[], props?: any, id?: string): Promise<IFluidRouter>;

    /**
     * Creates data store. Returns router of data store. Data store is not bound to container,
     * store in such state is not persisted to storage (file). Storing a handle to this store
     * (or any of its parts, like DDS) into already attached DDS (or non-attached DDS that will eventually
     * gets attached to storage) will result in this store being attached to storage.
     * @param pkg - Package name of the data store factory
     */
    createDataStore(pkg: string | string[]): Promise<IFluidRouter>;

    /**
     * Creates detached data store context. only after context.attachRuntime() is called,
     * data store initialization is considered compete.
     */
    createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached;

    /**
     * Get an absolute url for a provided container-relative request.
     * Returns undefined if the container or data store isn't attached to storage.
     * @param relativeUrl - A relative request within the container
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;

    getTaskManager(): Promise<ITaskManager>;

    uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;
}

/**
 * Minimal interface a data store runtime need to provide for IFluidDataStoreContext to bind to control
 *
 * Functionality include attach, snapshot, op/signal processing, request routes,
 * and connection state notifications
 */
export interface IFluidDataStoreChannel extends
    IFluidRouter,
    IDisposable {

    readonly id: string;

    /**
     * Indicates the attachment state of the data store to a host service.
     */
    readonly attachState: AttachState;

    /**
     * Called to bind the runtime to the container.
     * If the container is not attached to storage, then this would also be unknown to other clients.
     */
    bindToContext(): void;

    /**
     * Retrieves the summary used as part of the initial summary message
     */
    getAttachSummary(): IChannelSummarizeResult;

    /**
     * Processes the op.
     */
    process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;

    /**
     * Processes the signal.
     */
    processSignal(message: any, local: boolean): void;

    /**
     * Generates a summary for the data store.
     * Introduced with summarizerNode - will be required in a future release.
     * @param fullTree - true to bypass optimizations and force a full summary tree.
     * @param trackState - This tells whether we should track state from this summary.
     */
    summarize(fullTree?: boolean, trackState?: boolean): Promise<IChannelSummarizeResult>;

    /**
     * Returns the data used for garbage collection. This includes a list of GC nodes that represent this context
     * including any of its children. Each node has a list of outbound routes to other GC nodes in the document.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;

    /**
     * After GC has run, called to notify this channel of routes that are used in it.
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
}

export type CreateChildSummarizerNodeFn = (
    summarizeInternal: SummarizeInternalFn,
    getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
    getInitialGCSummaryDetailsFn: () => Promise<IGarbageCollectionSummaryDetails>,
) => ISummarizerNodeWithGC;

export interface IFluidDataStoreContextEvents extends IEvent {
    (event: "leader" | "notleader" | "attaching" | "attached", listener: () => void);
}

/**
 * Represents the context for the data store. It is used by the data store runtime to
 * get information and call functionality to the container.
 */
export interface IFluidDataStoreContext extends
IEventProvider<IFluidDataStoreContextEvents>, Partial<IProvideFluidDataStoreRegistry> {
    readonly documentId: string;
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
    /**
     * TODO: should remove after detachedNew is in place
     */
    readonly existing: boolean;
    readonly options: ILoaderOptions;
    readonly clientId: string | undefined;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly storage: IDocumentStorageService;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly loader: ILoader;
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
    readonly scope: IFluidObject;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;

    /**
     * Report error in that happend in the data store runtime layer to the container runtime layer
     * @param err - the error object.
     */
    raiseContainerWarning(warning: ContainerWarning): void;

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
     * Register the runtime to the container
     */
    bindToContext(): void;

    /**
     * Call by IFluidDataStoreChannel, indicates that a channel is dirty and needs to be part of the summary.
     * @param address - The address of the channe that is dirty.
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
    getInitialGCSummaryDetails(): Promise<IGarbageCollectionSummaryDetails>;
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
