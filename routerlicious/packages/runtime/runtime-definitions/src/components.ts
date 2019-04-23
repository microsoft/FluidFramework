import {
    ConnectionState,
    IBlobManager,
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
    ITreeEntry,
    MessageType,
} from "@prague/container-definitions";
import { EventEmitter } from "events";
import { IChannel, IDistributedObjectServices } from "./channel";

export interface IComponentRuntime extends EventEmitter {
    readonly options: any;

    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;

    readonly clientId: string;

    readonly id: string;

    readonly documentId: string;

    readonly tenantId: string;

    readonly existing: boolean;

    readonly parentBranch: string;

    readonly connected: boolean;

    readonly loader: ILoader;

    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    process(message: ISequencedDocumentMessage, local: boolean, context: any): void;

    processSignal(message: any, local: boolean): void;

    changeConnectionState(value: ConnectionState, clientId: string);

    request(request: IRequest): Promise<IResponse>;

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
     * Attaches the channel to the runtime - exposing it ot remote clients
     */
    attachChannel(channel: IChannel): IDistributedObjectServices;

    snapshot(message: string): Promise<void>;

    /**
     * Triggers a message to force a snapshot
     */
    save(message: string);

    // Blob related calls

    uploadBlob(file: IGenericBlob): Promise<IGenericBlob>;

    getBlob(sha: string): Promise<IGenericBlob>;

    getBlobMetadata(): Promise<IGenericBlob[]>;

    getQuorum(): IQuorum;
}

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
    readonly tenantId: string;
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

    getComponent(id: string, wait: boolean): Promise<IComponentRuntime>;

    request(request: IRequest): Promise<IResponse>;
}

export interface IHostRuntime extends IRuntime {
    readonly tenantId: string;
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
    readonly submitFn: (type: MessageType, contents: any) => number;
    readonly submitSignalFn: (contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;

    // I believe these next two things won't be necessary

    getComponent(id: string, wait?: boolean): Promise<IComponentRuntime>;

    // TODO at some point we may want to split create from attach for components. But the distributed data
    // structures aren't yet prepared for this. For simplicity we just offer a createAndAttachComponent
    createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime>;

    getQuorum(): IQuorum;

    getPackage(name: string): Promise<IComponentFactory>;

    error(err: any): void;
}

export interface IComponent {
    attach(platform: IPlatform): Promise<IPlatform>;
}

export interface IComponentFactory {
    instantiateComponent(context: IComponentContext): Promise<IComponentRuntime>;
}
