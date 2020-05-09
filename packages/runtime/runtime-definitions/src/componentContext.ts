/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger, IDisposable } from "@microsoft/fluid-common-definitions";
import {
    IComponent,
    IComponentLoadable,
    IComponentRouter,
    IProvideComponentHandleContext,
    IProvideComponentSerializer,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    ILoader,
} from "@microsoft/fluid-container-definitions";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionState,
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import { IProvideComponentRegistry } from "./componentRegistry";
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
 * TODO: this should be merged into IComponentContext
 */
export interface IContainerRuntimeBase extends
    EventEmitter,
    IProvideComponentHandleContext,
    IProvideComponentSerializer,
    /* TODO: Used by spaces. we should switch to IoC to provide the global registry */
    IProvideComponentRegistry {

    readonly logger: ITelemetryLogger;
    readonly clientDetails: IClientDetails;

    /**
     * Called by IComponentRuntime (on behalf of distributed data structure) in disconnected state to notify about
     * pending local changes. All pending changes are automatically flushed by shared objects on connection.
     */
    notifyPendingMessages(): void;

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
    _createComponentWithProps(pkg: string | string[], props?: any, id?: string): Promise<IComponentRuntimeChannel>;

    /**
     * @deprecated
     * Creates a new component.
     * @param pkgOrId - Package name if a second parameter is not provided. Otherwise an explicit ID.
     * @param pkg - Package name of the component. Optional and only required if specifying an explicit ID.
     * Remove once issue #1756 is closed
     */
    createComponent(pkgOrId: string, pkg?: string | string[]): Promise<IComponentRuntimeChannel>;
}

/**
 * Minimal interface a component runtime need to provide for IComponentContext to bind to control
 *
 * Functionality include attach, snapshot, op/signal processing, request routes,
 * and connection state notifications
 */
export interface IComponentRuntimeChannel extends
    IComponentRouter,
    Partial<IProvideComponentRegistry>,
    IDisposable {

    readonly id: string;

    /**
     * Called to attach the runtime to the container
     */
    attach(): void;

    /**
     * Retrieves the snapshot used as part of the initial snapshot message
     */
    getAttachSnapshot(): ITreeEntry[];

    /**
     * Processes the op.
     */
    process(message: ISequencedDocumentMessage, local: boolean): void;

    /**
     * Processes the signal.
     */
    processSignal(message: any, local: boolean): void;

    /**
     * Generates a snapshot of the given component
     */
    error(err: any): void;

    snapshotInternal(fullTree?: boolean): Promise<ITreeEntry[]>;

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
     */
    changeConnectionState(value: ConnectionState, clientId?: string);
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
export interface IComponentContext extends EventEmitter {
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
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly loader: ILoader;

    readonly containerRuntime: IContainerRuntimeBase;
    /**
     * @deprecated 0.17 Issue #1888 Rename IHostRuntime to IContainerRuntime and refactor usages
     * Use containerRuntime instead of hostRuntime
     */
    readonly hostRuntime: IContainerRuntimeBase;
    readonly snapshotFn: (message: string) => Promise<void>;

    /**
     * @deprecated 0.16 Issue #1635 Use the IComponentFactory creation methods instead to specify initial state
     */
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

    /**
     * Report error in that happend in the component runtime layer to the container runtime layer
     * @param err - the error object.
     */
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
    createComponent(
        pkgOrId: string | undefined,
        pkg?: string | string[],
        props?: any,
    ): Promise<IComponentRuntimeChannel>;

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
     * Binds a runtime to the context.
     */
    bindRuntime(componentRuntime: IComponentRuntimeChannel): void;

    /**
     * Attaches the runtime to the container
     * @param componentRuntime - runtime to attach
     */
    attach(componentRuntime: IComponentRuntimeChannel): void;

    /**
     * Call by IComponentRuntimeChannel, indicates that a channel is dirty and needs to be part of the summary.
     * @param address - The address of the channe that is dirty.
     */
    setChannelDirty(address: string): void;

    /**
     * Request an absolute url based on the provided request.
     * @param request - A relative request within the container
     */
    requestUrl(request: IRequest): Promise<IResponse>

    /**
     * It is false if the container is attached to storage and the component is attached to container.
     */
    isLocal(): boolean;
}

/**
 * Legacy API to be removed from IComponentContext
 *
 * Moving out of the main interface to force compilation error.
 * But the implementation is still in place as a transition so user can case to
 * the legacy interface and use it temporary if changing their code take some time.
 */
export interface IComponentContextLegacy extends IComponentContext {
    /**
     * @deprecated 0.18. Should call IComponentRuntimeChannel.request directly
     * Make request to the component.
     * @param request - Request.
     */
    request(request: IRequest): Promise<IResponse>;
}
