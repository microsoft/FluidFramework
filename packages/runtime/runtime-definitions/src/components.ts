/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponent,
    IComponentHandleContext,
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
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";

import { IProvideComponentRegistry } from "./componentRegistry";
import { IChannel } from ".";

/**
 * Represents the runtime for the component. Contains helper functions/state of the component.
 */
export interface IComponentRuntime extends EventEmitter, IComponentRouter, Partial<IProvideComponentRegistry>  {
    readonly IComponentRouter: IComponentRouter;

    readonly IComponentSerializer: IComponentSerializer;

    readonly IComponentHandleContext: IComponentHandleContext;

    readonly options: any;

    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    readonly clientId: string;

    readonly id: string;

    readonly documentId: string;

    readonly existing: boolean;

    readonly parentBranch: string;

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
    changeConnectionState(value: ConnectionState, clientId: string);

    /**
     * Closes the component. Once closed the component will not receive any new ops and should
     * not attempt to generate them.
     */
    close(): Promise<void>;

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
}

/**
 * Represents the context for the component. This context is passed to the component runtime.
 */
export interface IComponentContext extends EventEmitter {
    readonly documentId: string;
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string;
    readonly parentBranch: string;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly loader: ILoader;
    readonly hostRuntime: IHostRuntime;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;
    readonly createProps?: any;

    /**
     * Ambient services provided with the context
     */
    readonly scope: IComponent;

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
     * Creates a new component by using subregistries.
     * @param pkgOrId - Package name if a second parameter is not provided. Otherwise an explicit ID.
     *                  ID is being deprecated, so prefer passing undefined instead (the runtime will
     *                  generate an ID in this case).
     * @param pkg - Package name of the component. Optional and only required if specifying an explicit ID.
     * @param props - Properties to be passed to the instantiateComponent through the context.
     */
    createComponent(pkgOrId: string | undefined, pkg?: string, props?: any): Promise<IComponentRuntime>;

    /**
     * Returns the runtime of the component.
     * @param id - Id supplied during creating the component.
     * @param wait - True if you want to wait for it.
     */
    getComponentRuntime(id: string, wait: boolean): Promise<IComponentRuntime>;

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

/**
 * Represents the runtime of the container. Contains helper functions/state of the container.
 */
export interface IHostRuntime extends
    EventEmitter,
    IProvideComponentSerializer,
    IProvideComponentHandleContext,
    IProvideComponentRegistry {
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string;
    readonly clientDetails: IClientDetails;
    readonly parentBranch: string;
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
    readonly closeFn: () => void;
    readonly scope: IComponent;

    /**
     * Returns the runtime of the component.
     * @param id - Id supplied during creating the component.
     * @param wait - True if you want to wait for it.
     */
    getComponentRuntime(id: string, wait?: boolean): Promise<IComponentRuntime>;

    /**
     * Creates a new component.
     * @param pkgOrId - Package name if a second parameter is not provided. Otherwise an explicit ID.
     * @param pkg - Package name of the component. Optional and only required if specifying an explicit ID.
     */
    createComponent(pkgOrId: string, pkg?: string | string[]): Promise<IComponentRuntime>;

    /**
     * Creates a new component with props
     * @param pkg - Package name of the component
     * @param props - properties to be passed to the instantiateComponent thru the context
     * @param id - id of the component.
     *
     * @remarks
     * Only used by aqueduct PrimedComponent to pass param to the instantiateComponent function thru the context.
     * Further change to the component create flow to split the local create vs remote instantiate make this deprecated.
     * @internal
     */
    _createComponentWithProps(pkg: string | string[], props: any, id: string): Promise<IComponentRuntime>;

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
}
