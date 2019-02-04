import {
    ConnectionState,
    IBlobManager,
    IDeltaManager,
    IDocumentStorageService,
    IObjectMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { IRequest, IResponse } from "./loader";

/**
 * The IRuntime represents an instantiation of a code package within a container.
 */
export interface IRuntime {
    /**
     * Executes a request against the runtime
     */
    request(request: IRequest): Promise<IResponse>;

    /**
     * Snapshots the runtime
     */
    snapshot(tagMessage: string): Promise<ITree>;

    /**
     * Notifies the runtime of a change in the connection state
     */
    changeConnectionState(value: ConnectionState, clientId: string);

    /**
     * Stops the runtime. Once stopped no more messages will be delivered and the context passed to the runtime
     * on creation will no longer be active
     */
    stop(): Promise<void>;

    /**
     * Prepares the given message for execution
     */
    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    /**
     * Processes the given message
     */
    process(message: ISequencedDocumentMessage, local: boolean, context: any);

    /**
     * Called immediately after a message has been processed but prior to the next message being executed
     */
    postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void>;
}

export interface IContainerContext {
    readonly tenantId: string;
    readonly id: string;
    readonly existing: boolean;
    readonly options: any;
    readonly clientId: string;
    readonly user: IUser;
    readonly parentBranch: string;
    readonly deltaManager: IDeltaManager;
    readonly blobManager: IBlobManager;
    readonly storage: IDocumentStorageService;
    readonly connectionState: ConnectionState;
    readonly branch: string;
    readonly minimumSequenceNumber: number;
    readonly baseSnapshot: ISnapshotTree;
    readonly blobs: Map<string, string>;
    readonly submitFn: (type: MessageType, contents: any) => void;
    readonly snapshotFn: (message: string) => Promise<void>;
    readonly closeFn: () => void;
    readonly quorum: IQuorum;

    error(err: any): void;
}

export interface IChannel {
    /**
     * A readonly identifier for the collaborative object
     */
    readonly id: string;

    readonly type: string;

    dirty: boolean;

    ready(): Promise<void>;

    snapshot(): ITree;

    transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage;

    isLocal(): boolean;
}

/**
 * Exported module definition
 */
export interface IChaincodeFactory {
    /**
     * Instantiates a new chaincode container
     */
    instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
}
