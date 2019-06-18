/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ConnectionState,
    IBlobManager,
    IComponent as INewComponent,
    IComponentRouter,
    IDeltaManager,
    IDocumentMessage,
    IDocumentStorageService,
    IGenericBlob,
    ILoader,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    IRuntime,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITelemetryLogger,
    ITreeEntry,
    MessageType,
} from "@prague/container-definitions";
import { EventEmitter } from "events";
import { IChannel, ISharedObjectServices } from "./channel";

/**
 * Represents the runtime for the component. Contains helper functions/state of the component.
 */
export interface IComponentRuntime extends EventEmitter, IComponentRouter {
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
    snapshotInternal(): ITreeEntry[];

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
     * Attaches the channel to the runtime - exposing it to remote clients
     * @param channel - Channel to be attached to the runtime.
     */
    attachChannel(channel: IChannel): ISharedObjectServices;

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
}

/**
 * @deprecated Being replaced with IComponent in container-definitions
 */
export interface IComponent {
    /**
     * Identifier for the component
     */
    id: string;

    /**
     * Allows for attachment to the given component
     */
    attach(platform: IPlatform): Promise<IPlatform>;
}

export interface IComponentRouter {
    request(req: IRequest): Promise<IResponse>;
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
     * Creates a component and then attaches it to the container.
     * @param id - ID of the chaincode package.
     * @param pkg - Package name of the component.
     */
    createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime>;

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
     * Creates a component and then attaches it to the container.
     * @param id - ID of the chaincode package.
     * @param pkg - Package name of the component.
     */
    createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime>;

    /**
     * Returns the current quorum.
     */
    getQuorum(): IQuorum;

    /**
     * Returns the component factory for a particular package.
     * @param name - Name of the package.
     */
    getPackage(name: string): Promise<IComponentFactory>;

    error(err: any): void;
}

/**
 * The interface implemented by a component module.
 */
export interface IComponentFactory {
    /**
     * Generates runtime for the component from the component context.
     * @param context - Conext for the component.
     */
    instantiateComponent(context: IComponentContext): Promise<IComponentRuntime>;
}

// following are common conventions

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 * INewComponent is temporarily used for backward compatibility (but has the members of the new
 * IComponent interface).
 */
export interface IComponentCollection {
    create<TOpt = object>(options?: TOpt): INewComponent;
    remove(instance: INewComponent): void;
    // need iteration
}

// Following is what loosely-coupled hosts need to show a component

/**
 * How to render the component.
 */
export enum ComponentDisplayType {
    /**
     * Render the component in on a separate line.
     */
    Block,
    /**
     * Render the component as part of an inline flow.
     */
    Inline,
    /**
     * Render the component as part of an inline flow, but in a single block.
     */
    InlineBlock,
}

/**
 * Render the component into an HTML element. In the case of Block display,
 * elm.getBoundingClientRect() defines the dimensions of the viewport in which
 * to render. Typically, this means that elm should already be placed into the DOM.
 * If elm has an empty client rect, then it is assumed that it will expand to hold the
 * rendered component.
 */
export interface IComponentRenderHTML {
    render(elm: HTMLElement, displayType?: ComponentDisplayType): void;
}

/**
 * Provide information about component preferences for layout.
 */
export interface IComponentLayout {
    aspectRatio?: number;
    minimumWidthBlock?: number;
    minimumHeightInline?: number;
    canInline?: boolean;
    preferInline?: boolean;
    heightInLines?: () => number;
}

/**
 * Direction from which the cursor has entered or left a component.
 */
export enum ComponentCursorDirection {
    Left,
    Right,
    Top,
    Bottom,
    Airlift,
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
