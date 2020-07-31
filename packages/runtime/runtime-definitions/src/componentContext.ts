/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger, IDisposable } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IFluidLoadable,
    IFluidRouter,
    IProvideFluidHandleContext,
    IProvideFluidSerializer,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    ContainerWarning,
    ILoader,
    AttachState,
} from "@fluidframework/container-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    IClientDetails,
    ConnectionState,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
} from "@fluidframework/protocol-definitions";
import { IProvideFluidDataStoreRegistry } from "./componentRegistry";
import { IInboundSignalMessage } from "./protocol";

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

/**
 * A reduced set of functionality of IContainerRuntime that a component/component runtime will need
 * TODO: this should be merged into IFluidDataStoreContext
 */
export interface IContainerRuntimeBase extends
    EventEmitter,
    IProvideFluidHandleContext,
    IProvideFluidSerializer,
    /* TODO: Used by spaces. we should switch to IoC to provide the global registry */
    IProvideFluidDataStoreRegistry {

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

    on(event: "batchBegin", listener: (op: ISequencedDocumentMessage) => void): this;
    on(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
    on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void): this;
    on(event: "leader" | "notleader", listener: () => void): this;

    /**
     * @deprecated
     * Creates a new component.
     * @param pkgOrId - Package name if a second parameter is not provided. Otherwise an explicit ID.
     * @param pkg - Package name of the component. Optional and only required if specifying an explicit ID.
     * Remove once issue #1756 is closed
     */
    _createDataStore(pkgOrId: string, pkg?: string | string[]): Promise<IFluidDataStoreChannel>;

    /**
     * Creates data store. Returns router of data store. Data store is not bound to container,
     * store in such state is not persisted to storage (file). Storing a handle to this store
     * (or any of its parts, like DDS) into already attached DDS (or non-attached DDS that will eventually
     * gets attached to storage) will result in this store being attached to storage.
     * @param pkg - Package name of the data store factory
     */
    createDataStore(pkg: string | string[]): Promise<IFluidRouter>;

    /**
     * Get an absolute url for a provided container-relative request.
     * Returns undefined if the container or component isn't attached to storage.
     * @param relativeUrl - A relative request within the container
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;
}

/**
 * Minimal interface a component runtime need to provide for IFluidDataStoreContext to bind to control
 *
 * Functionality include attach, snapshot, op/signal processing, request routes,
 * and connection state notifications
 */
export interface IFluidDataStoreChannel extends
    IFluidRouter,
    Partial<IProvideFluidDataStoreRegistry>,
    IDisposable {

    readonly id: string;

    /**
     * Indicates the attachment state of the component to a host service.
     */
    readonly attachState: AttachState;

    /**
     * Called to bind the runtime to the container.
     * If the container is not attached to storage, then this would also be unknown to other clients.
     */
    bindToContext(): void;

    /**
     * Retrieves the snapshot used as part of the initial snapshot message
     */
    getAttachSnapshot(): ITreeEntry[];

    /**
     * Attaches the graph of the component.
     */
    attachGraph(): void;

    /**
     * Processes the op.
     */
    process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;

    /**
     * Processes the signal.
     */
    processSignal(message: any, local: boolean): void;

    /**
     * Generates a snapshot of the given component
     */
    snapshotInternal(fullTree?: boolean): Promise<ITreeEntry[]>;

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
     */
    setConnectionState(connected: boolean, clientId?: string);

    // Back-compat: supporting <= 0.16 components
    changeConnectionState?: (value: ConnectionState, clientId?: string) => void;

    /**
     * Ask the DDS to resubmit a message. This could be because we reconnected and this message was not acked.
     * @param type - The type of the original message.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    reSubmit(type: string, content: any, localOpMetadata: unknown);
}

export interface ISummaryTracker {
    /**
     * The reference sequence number of the most recent acked summary.
     */
    readonly referenceSequenceNumber: number;
    /**
     * The latest sequence number of change to this node or subtree.
     */
    readonly latestSequenceNumber: number;
    /**
     * Gets the id to use when summarizing, or undefined if it has changed.
     */
    getId(): Promise<string | undefined>;
    /**
     * Updates the latest sequence number representing change to this node or subtree.
     * @param latestSequenceNumber - new latest sequence number
     */
    updateLatestSequenceNumber(latestSequenceNumber: number): void;
    /**
     * Creates a child ISummaryTracker node based off information from its parent.
     * @param key - key of node for newly created child ISummaryTracker
     * @param latestSequenceNumber - initial value for latest sequence number of change
     */
    createOrGetChild(key: string, latestSequenceNumber: number): ISummaryTracker;
    /**
     * Retrives a child ISummaryTracker node based off the key.
     * @param key - key of the child ISummaryTracker node.
     * @returns - The child ISummaryTracker node.
     */
    getChild(key: string): ISummaryTracker | undefined;
}

/**
 * Represents the context for the component. It is used by the component runtime to
 * get information and call functionality to the container.
 */
export interface IFluidDataStoreContext extends EventEmitter {
    readonly documentId: string;
    readonly id: string;
    /**
     * The package path of the component as per the package factory.
     */
    readonly packagePath: readonly string[];
    /**
     * TODO: should remove after detachedNew is in place
     */
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string | undefined;
    readonly parentBranch: string | null;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly loader: ILoader;
    /**
     * Indicates the attachment state of the component to a host service.
     */
    readonly attachState: AttachState;

    readonly containerRuntime: IContainerRuntimeBase;
    /**
     * @deprecated 0.17 Issue #1888 Rename IHostRuntime to IContainerRuntime and refactor usages
     * Use containerRuntime instead of hostRuntime
     */
    readonly hostRuntime: IContainerRuntimeBase;
    readonly snapshotFn: (message: string) => Promise<void>;

    /**
     * @deprecated 0.16 Issue #1635 Use the IFluidDataStoreFactory creation methods instead to specify initial state
     */
    readonly createProps?: any;

    /**
     * Ambient services provided with the context
     */
    readonly scope: IFluidObject & IFluidObject;
    readonly summaryTracker: ISummaryTracker;

    on(event: "leader" | "notleader" | "attaching" | "attached", listener: () => void): this;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;

    /**
     * Report error in that happend in the component runtime layer to the container runtime layer
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
     * @deprecated 0.16 Issue #1537, issue #1756 Components
     *      should be created using IFluidDataStoreFactory methods instead
     * Creates a new component by using subregistries.
     * @param pkgOrId - Package name if a second parameter is not provided. Otherwise an explicit ID.
     *                  ID is being deprecated, so prefer passing undefined instead (the runtime will
     *                  generate an ID in this case).
     * @param pkg - Package name of the component. Optional and only required if specifying an explicit ID.
     */
    _createDataStore(
        pkgOrId: string | undefined,
        pkg?: string | string[],
    ): Promise<IFluidDataStoreChannel>;

    /**
     * Create a new component using subregistries with fallback.
     * @param pkg - Package name of the component
     * @param realizationFn - Optional function to call to realize the component over the context default
     * @returns A promise for a component that will have been initialized. Caller is responsible
     * for attaching the component to the provided runtime's container such as by storing its handle
     */
    createDataStoreWithRealizationFn(
        pkg: string,
        realizationFn?: (context: IFluidDataStoreContext) => void,
    ): Promise<IFluidObject & IFluidLoadable>;

    /**
     * Binds a runtime to the context.
     */
    bindRuntime(componentRuntime: IFluidDataStoreChannel): void;

    /**
     * Register the runtime to the container
     * @param componentRuntime - runtime to attach
     */
    bindToContext(componentRuntime: IFluidDataStoreChannel): void;

    /**
     * Call by IFluidDataStoreChannel, indicates that a channel is dirty and needs to be part of the summary.
     * @param address - The address of the channe that is dirty.
     */
    setChannelDirty(address: string): void;

    /**
     * Get an absolute url to the containe rbased on the provided relativeUrl.
     * Returns undefined if the container or component isn't attached to storage.
     * @param relativeUrl - A relative request within the container
     */
    getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;
}

/**
 * Legacy API to be removed from IFluidDataStoreContext
 *
 * Moving out of the main interface to force compilation error.
 * But the implementation is still in place as a transition so user can case to
 * the legacy interface and use it temporary if changing their code take some time.
 */
export interface IComponentContextLegacy extends IFluidDataStoreContext {
    /**
     * @deprecated 0.18. Should call IFluidDataStoreChannel.request directly
     * Make request to the component.
     * @param request - Request.
     */
    request(request: IRequest): Promise<IResponse>;
}
