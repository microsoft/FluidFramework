/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger, IDisposable } from "@microsoft/fluid-common-definitions";
import {
    IComponent,
    IComponentHandleContext,
    IComponentLoadable,
    IComponentRouter,
    IComponentSerializer,
    IProvideComponentHandleContext,
    IProvideComponentSerializer,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ILoader,
} from "@microsoft/fluid-container-definitions";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionState,
    IClientDetails,
    IDocumentMessage,
    IHelpMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";

import { IProvideComponentRegistry } from "./componentRegistry";
import { IInboundSignalMessage } from "./protocol";
import { IChannel } from ".";

/**
 * Represents the runtime for the component. Contains helper functions/state of the component.
 */
export interface IComponentRuntime extends
    EventEmitter,
    IComponentRouter,
    Partial<IProvideComponentRegistry>,
    IDisposable {
    readonly IComponentRouter: IComponentRouter;

    readonly IComponentSerializer: IComponentSerializer;

    readonly IComponentHandleContext: IComponentHandleContext;

    readonly options: any;

    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    readonly clientId: string | undefined;

    readonly id: string;

    readonly documentId: string;

    readonly existing: boolean;

    readonly parentBranch: string | null;

    readonly connectionState: ConnectionState;

    readonly connected: boolean;

    readonly loader: ILoader;

    readonly logger: ITelemetryLogger;

    /**
     * Returns if the runtime is attached.
     */
    isAttached: boolean;

    /**
     * Processes the op.
     */
    process(message: ISequencedDocumentMessage, local: boolean): void;

    /**
     * Processes the signal.
     */
    processSignal(message: any, local: boolean): void;

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
     */
    changeConnectionState(value: ConnectionState, clientId?: string);

    /**
     * Generates a snapshot of the given component
     */
    snapshotInternal(fullTree?: boolean): Promise<ITreeEntry[]>;

    /**
     * Retrieves the snapshot used as part of the initial snapshot message
     */
    getAttachSnapshot(): ITreeEntry[];

    /**
     * Called to attach the runtime to the container
     */
    attach(): void;

    /**
     * Returns the channel with the given id
     */
    getChannel(id: string): Promise<IChannel>;

    /**
     * Creates a new channel of the given type.
     * @param id - ID of the channel to be created.  A unique ID will be generated if left undefined.
     * @param type - Type of the channel.
     */
    createChannel(id: string | undefined, type: string): IChannel;

    /**
     * Registers the channel with the component runtime. If the runtime
     * is collaborative then we attach the channel to make it collaborative.
     */
    registerChannel(channel: IChannel): void;

    /**
     * Api for generating the snapshot of the component.
     * @param message - Message for the snapshot.
     */
    snapshot(message: string): Promise<void>;

    /**
     * Triggers a message to force a snapshot
     */
    save(message: string);

    // Blob related calls
    /**
     * Api to upload a blob of data.
     * @param file - blob to be uploaded.
     */
    uploadBlob(file: IGenericBlob): Promise<IGenericBlob>;

    /**
     * Submits the signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    submitSignal(type: string, content: any): void;

    /**
     * Api to get the blob for a particular id.
     * @param blobId - ID of the required blob.
     */
    getBlob(blobId: string): Promise<IGenericBlob | undefined>;

    /**
     * Api to get the blob metadata.
     */
    getBlobMetadata(): Promise<IGenericBlob[]>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;

    /**
     * Called by distributed data structures in disconnected state to notify about pending local changes.
     * All pending changes are automatically flushed by shared objects on connection.
     */
    notifyPendingMessages(): void;

    /**
     * Resolves when a local component is attached.
     */
    waitAttached(): Promise<void>;

    /**
     * Errors raised by distributed data structures
     */
    error(err: any): void;

    /**
     * Request an absolute url based on the provided request.
     * @param request - A relative request within the container
     */
    requestUrl(request: IRequest): Promise<IResponse>;
}

export interface IExperimentalComponentRuntime extends IComponentRuntime {
    readonly isExperimentalComponentRuntime: true;

    /**
     * Indicates whether the container is attached to storage.
     */
    isLocal(): boolean;
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
     * Fetches the snapshot tree of the previously acked summary.
     * back-compat: 0.14 uploadSummary
     */
    getSnapshotTree(): Promise<ISnapshotTree | undefined>;
    /**
     * Updates the latest sequence number representing change to this node or subtree.
     * @param latestSequenceNumber - new latest sequence number
     */
    updateLatestSequenceNumber(latestSequenceNumber: number): void;
    /**
     * Creates a child ISummaryTracker node based off information from its parent.
     * @param key - key of node for newly created child ISummaryTracker
     * @param latestSequenceNumber - inital value for latest sequence number of change
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
 * Represents the context for the component. This context is passed to the component runtime.
 */
export interface IComponentContext extends EventEmitter {
    readonly documentId: string;
    readonly id: string;
    /**
     * The package path of the component as per the package factory.
     */
    readonly packagePath: readonly string[];
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string | undefined;
    readonly parentBranch: string | null;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly loader: ILoader;
    readonly containerRuntime: IContainerRuntime;
    /**
     * @deprecated 0.17 Issue #1888 Rename IHostRuntime to IContainerRuntime and refactor usages
     * Use containerRuntime instead of hostRuntime
     */
    readonly hostRuntime: IContainerRuntime;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly createProps?: any;

    /**
     * Ambient services provided with the context
     */
    readonly scope: IComponent;

    readonly summaryTracker: ISummaryTracker;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;

    error(err: any): void;

    /**
     * Submits the message to be sent to other clients.
     * @param type - Type of the message.
     * @param content - Content of the message.
     */
    submitMessage(type: string, content: any): number;

    /**
     * Submits the signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    submitSignal(type: string, content: any): void;

    /**
     * @deprecated 0.16 Issue #1537, issue #1756 Components should be created using IComponentFactory methods instead
     * Creates a new component by using subregistries.
     * @param pkgOrId - Package name if a second parameter is not provided. Otherwise an explicit ID.
     *                  ID is being deprecated, so prefer passing undefined instead (the runtime will
     *                  generate an ID in this case).
     * @param pkg - Package name of the component. Optional and only required if specifying an explicit ID.
     * @param props - Properties to be passed to the instantiateComponent through the context.
     */
    createComponent(pkgOrId: string | undefined, pkg?: string | string[], props?: any):
    Promise<IComponentRuntime>;

    /**
     * Create a new component using subregistries with fallback.
     * @param pkg - Package name of the component
     * @param realizationFn - Optional function to call to realize the component over the context default
     * @returns A promise for a component that will have been initialized. Caller is responsible
     * for attaching the component to the provided runtime's container such as by storing its handle
     */
    createComponentWithRealizationFn(
        pkg: string,
        realizationFn?: (context: IComponentContext) => void,
    ): Promise<IComponent & IComponentLoadable>;

    /**
     * Make request to the component.
     * @param request - Request.
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Binds a runtime to the context.
     */
    bindRuntime(componentRuntime: IComponentRuntime): void;

    /**
     * Attaches the runtime to the container
     * @param componentRuntime - runtime to attach
     */
    attach(componentRuntime: IComponentRuntime): void;

    /**
     * Indicates that a channel is dirty and needs to be part of the summary.
     * @param address - The address of the channe that is dirty.
     */
    setChannelDirty(address: string): void;

    /**
     * Request an absolute url based on the provided request.
     * @param request - A relative request within the container
     */
    requestUrl(request: IRequest): Promise<IResponse>
}

export interface IExperimentalComponentContext extends IComponentContext {
    readonly isExperimentalComponentContext: true;

    /**
     * It is false if the container is not attached to storage and the component is attached to container.
     */
    isLocal(): boolean;
}

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

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideContainerRuntime>> { }
}

export const IContainerRuntime: keyof IProvideContainerRuntime = "IContainerRuntime";

export interface IProvideContainerRuntime {
    IContainerRuntime: IContainerRuntime;
}

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 */
export interface IContainerRuntime extends
    EventEmitter,
    IProvideComponentSerializer,
    IProvideComponentHandleContext,
    IProvideComponentRegistry,
    IProvideContainerRuntime {
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string | undefined;
    readonly clientDetails: IClientDetails;
    readonly parentBranch: string | null;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly loader: ILoader;
    readonly logger: ITelemetryLogger;
    readonly flushMode: FlushMode;
    readonly submitFn: (type: MessageType, contents: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly scope: IComponent;

    on(event: "batchBegin", listener: (op: ISequencedDocumentMessage) => void): this;
    on(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
    on(
        event: "dirtyDocument" | "disconnected" | "dispose" | "joining" | "savedDocument",
        listener: () => void): this;
    on(
        event: "connected" | "leader" | "noleader",
        listener: (clientId?: string) => void): this;
    on(event: "localHelp", listener: (message: IHelpMessage) => void): this;
    on(event: "op", listener: (message: ISequencedDocumentMessage) => void): this;
    on(event: "signal", listener: (message: IInboundSignalMessage, local: boolean) => void): this;
    on(
        event: "componentInstantiated",
        listener: (componentPkgName: string, registryPath: string, createNew: boolean) => void,
    ): this;

    /**
     * Returns the runtime of the component.
     * @param id - Id supplied during creating the component.
     * @param wait - True if you want to wait for it.
     */
    getComponentRuntime(id: string, wait?: boolean): Promise<IComponentRuntime>;

    /**
     * @deprecated
     * Creates a new component.
     * @param pkgOrId - Package name if a second parameter is not provided. Otherwise an explicit ID.
     * @param pkg - Package name of the component. Optional and only required if specifying an explicit ID.
     * Remove once issue #1756 is closed
     */
    createComponent(pkgOrId: string, pkg?: string | string[]): Promise<IComponentRuntime>;

    /**
     * @deprecated 0.16 Issue #1537
     *  Properties should be passed to the component factory method rather than to the runtime
     * Creates a new component with props
     * @param pkg - Package name of the component
     * @param props - properties to be passed to the instantiateComponent thru the context
     * @param id - Only supplied if the component is explicitly passing its ID, only used for default components
     * @remarks
     * Only used by aqueduct PrimedComponent to pass param to the instantiateComponent function thru the context.
     * Further change to the component create flow to split the local create vs remote instantiate make this deprecated.
     * @internal
     */
    _createComponentWithProps(pkg: string | string[], props?: any, id?: string): Promise<IComponentRuntime>;

    /**
     * Creates a new component using an optional realization function.  This API does not allow specifying
     * the component's id and insteads generates a uuid.  Consumers must save another reference to the
     * component, such as the handle.
     * @param pkg - Package name of the component
     * @param realizationFn - Optional function to call to realize the component over the context default
     */
    createComponentWithRealizationFn(
        pkg: string[],
        realizationFn?: (context: IComponentContext) => void,
    ): Promise<IComponentRuntime>;

    /**
     * Creates a new IComponentContext instance.  The caller completes construction of the the component by
     * calling IComponentContext.bindRuntime() when the component is prepared to begin processing ops.
     *
     * @param pkg - Package path for the component to be created
     * @param props - Properties to be passed to the instantiateComponent thru the context
     *  @deprecated 0.16 Issue #1537 Properties should be passed directly to the component's initialization
     *  or to the factory method rather than be stored in/passed from the context
     */
    createComponentContext(pkg: string[], props?: any): IComponentContext;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the current audience.
     */
    getAudience(): IAudience;

    /**
     * Used to raise an unrecoverable error on the runtime.
     */
    error(err: any): void;

    /**
     * Called by IComponentRuntime (on behalf of distributed data structure) in disconnected state to notify about
     * pending local changes. All pending changes are automatically flushed by shared objects on connection.
     */
    notifyPendingMessages(): void;

    /**
     * Used to notify the HostingRuntime that the ComponentRuntime has be instantiated.
     */
    notifyComponentInstantiated(componentContext: IComponentContext): void;

    /**
     * Returns true of document is dirty, i.e. there are some pending local changes that
     * either were not sent out to delta stream or were not yet acknowledged.
     */
    isDocumentDirty(): boolean;

    /**
     * Sets the flush mode for operations on the document.
     */
    setFlushMode(mode: FlushMode): void;

    /**
     * Flushes any ops currently being batched to the loader
     */
    flush(): void;

    /**
     * Invokes the given callback and guarantees that all operations generated within the callback will be ordered
     * sequentially. Total size of all messages must be less than maxOpSize.
     */
    orderSequentially(callback: () => void): void;

    /**
     * Executes a request against the runtime
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Submits the signal to be sent to other clients.
     * @param type - Type of the signal.
     * @param content - Content of the signal.
     */
    submitSignal(type: string, content: any): void;

    /**
     * Request an absolute url based on the provided request.
     * @param request - A relative request within the container
     */
    requestUrl(request: IRequest): Promise<IResponse>;
}

export interface IExperimentalContainerRuntime extends IContainerRuntime {

    isExperimentalContainerRuntime: true;

    /**
     * It is false if the container is not attached to storage and the component is attached to container.
     */
    isLocal(): boolean;
}
