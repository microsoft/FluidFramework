/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    IComponent,
    IComponentHandleContext,
    IComponentRouter,
    IComponentSerializer,
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import {
    ConnectionState,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ILoader,
    IQuorum,
    IRuntime,
    ITelemetryLogger,
} from "@prague/container-definitions";
import {
    IDocumentMessage,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
    MessageType,
} from "@prague/protocol-definitions";

import { EventEmitter } from "events";
import { IChannel } from "./channel";

declare module "@prague/component-core-interfaces" {
    export interface IComponent {
        readonly IComponentFactory?: IComponentFactory;
        readonly IComponentCollection?: IComponentCollection;
        readonly IComponentLayout?: IComponentLayout;
        readonly IComponentCursor?: IComponentCursor;
        readonly IComponentKeyHandlers?: IComponentKeyHandlers;
    }
}

/**
 * Represents the runtime for the component. Contains helper functions/state of the component.
 */
export interface IComponentRuntime extends EventEmitter, IComponentRouter {
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
     * Prepares the op to be processed.
     */
    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    /**
     * Processes the op.
     */
    process(message: ISequencedDocumentMessage, local: boolean, context: any): void;

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
    snapshotInternal(): Promise<ITreeEntry[]>;

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
     * @param id - ID of the channel to be created.
     * @param type - Type of the channel.
     */
    createChannel(id: string, type: string): IChannel;

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
    getBlob(blobId: string): Promise<IGenericBlob>;

    /**
     * Api to get the blob metadata.
     */
    getBlobMetadata(): Promise<IGenericBlob[]>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

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
export interface IComponentContext extends EventEmitter, IComponent {
    readonly documentId: string;
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string;
    readonly clientType: string;
    readonly parentBranch: string;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly baseSnapshot: ISnapshotTree;
    readonly loader: ILoader;
    readonly hostRuntime: IHostRuntime;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

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
     * Creates a new component.
     * @param id - ID of the chaincode package.
     * @param pkg - Package name of the component.
     */
    createComponent(id: string, pkg: string): Promise<IComponentRuntime>;

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
    bindRuntime(componentRuntime: IComponentRuntime): Promise<void>;

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
     * In automatic flush mode the runtime will immediatley send all operations to the driver layer.
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
export interface IHostRuntime extends IRuntime {
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string;
    readonly clientType: string;
    readonly parentBranch: string;
    readonly connected: boolean;
    readonly leader: boolean;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly minimumSequenceNumber: number;
    readonly loader: ILoader;
    readonly logger: ITelemetryLogger;
    readonly flushMode: FlushMode;
    readonly submitFn: (type: MessageType, contents: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;

    /**
     * Returns the runtime of the component.
     * @param id - Id supplied during creating the component.
     * @param wait - True if you want to wait for it.
     */
    getComponentRuntime(id: string, wait?: boolean): Promise<IComponentRuntime>;

    /**
     * Creates a new component without attaching.
     * @param id - unique id of the component package.
     * @param pkg - name of the component package
     */
    createComponent(id: string, pkg: string): Promise<IComponentRuntime>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the component factory for a particular package.
     * @param name - Name of the package.
     */
    getPackage(name: string): Promise<ComponentFactoryTypes>;

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
}

/**
 * The interface implemented by a component module.
 */
export interface IComponentFactory {
    /**
     * Generates runtime for the component from the component context. Once created should be bound to the context.
     * @param context - Conext for the component.
     */
    instantiateComponent(context: IComponentContext): void;
}

export type ComponentFactoryTypes = IComponentFactory | { instantiateComponent(context: IComponentContext): void; };

// following are common conventions

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 */
export interface IComponentCollection {
    createCollectionItem<TOpt = object>(options?: TOpt): IComponent;
    removeCollectionItem(instance: IComponent): void;
    // need iteration
}

/**
 * Provide information about component preferences for layout.
 */
export interface IComponentLayout {
    aspectRatio?: number;
    minimumWidth?: number;
    minimumHeight?: number;
    variableHeight?: boolean;
    requestedWidthPercentage?: number;
    canInline?: boolean;
    preferInline?: boolean;
    preferPersistentElement?: boolean;
}

/**
 * Direction from which the cursor has entered or left a component.
 */
export enum ComponentCursorDirection {
    Left,
    Right,
    Up,
    Down,
    Airlift,
    Focus,
}

export interface IComponentCursor {
    enter(direction: ComponentCursorDirection): void;
    leave(direction: ComponentCursorDirection): void;
    // returns true if cursor leaves the component
    fwd(): boolean;
    rev(): boolean;
}

// used when another component will forward keyboard events to this component
export interface IComponentKeyHandlers {
    onKeypress(e: KeyboardEvent): void;
    onKeydown(e: KeyboardEvent): void;
}
