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

export interface IComponentRuntime extends EventEmitter, IComponentRouter {
    readonly options: any;

    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    readonly clientId: string;

    readonly id: string;

    readonly documentId: string;

    readonly existing: boolean;

    readonly parentBranch: string;

    readonly connected: boolean;

    readonly loader: ILoader;

    readonly logger: ITelemetryLogger;

    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    process(message: ISequencedDocumentMessage, local: boolean, context: any): void;

    processSignal(message: any, local: boolean): void;

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
     * Creates a new channel of the given type
     */
    createChannel(id: string, type: string): IChannel;

    /**
     * Attaches the channel to the runtime - exposing it to remote clients
     */
    attachChannel(channel: IChannel): ISharedObjectServices;

    snapshot(message: string): Promise<void>;

    /**
     * Triggers a message to force a snapshot
     */
    save(message: string);

    // Blob related calls

    uploadBlob(file: IGenericBlob): Promise<IGenericBlob>;

    submitSignal(type: string, content: any): void;

    getBlob(blobId: string): Promise<IGenericBlob>;

    getBlobMetadata(): Promise<IGenericBlob[]>;

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

    getQuorum(): IQuorum;

    error(err: any): void;

    submitMessage(type: string, content: any): number;

    submitSignal(type: string, content: any): void;

    createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime>;

    getComponentRuntime(id: string, wait: boolean): Promise<IComponentRuntime>;

    request(request: IRequest): Promise<IResponse>;
}

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

    // I believe these next two things won't be necessary

    getComponentRuntime(id: string, wait?: boolean): Promise<IComponentRuntime>;

    // TODO at some point we may want to split create from attach for components. But the distributed data
    // structures aren't yet prepared for this. For simplicity we just offer a createAndAttachComponent
    createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime>;

    getQuorum(): IQuorum;

    getPackage(name: string): Promise<IComponentFactory>;

    error(err: any): void;
}

/**
 * The interface implemented by a component module.
 */
export interface IComponentFactory {
    instantiateComponent(context: IComponentContext): Promise<IComponentRuntime>;
}

// following are common conventions

/**
 * A component that implements a collection of components.  Typically, the
 * components in the collection would be like-typed.
 */
export interface IComponentCollection {
    create(): INewComponent;
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
}

/**
 * Render the component into an HTML element. In the case of Block display,
 * elm.getBoundingClientRect() defines the dimensions of the viewport in which
 * to render. Typically, this means that elm should already be placed into the DOM.
 * If elm has an empty client rect, then it is assumed that it will expand to hold the
 * rendered component.
 */
export interface IComponentRenderHTML {
    render(elm: HTMLElement, displayType: ComponentDisplayType): void;
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
}
