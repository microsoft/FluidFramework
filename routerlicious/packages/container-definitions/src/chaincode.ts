import { IBlobManager } from "./blobs";
import { IQuorum } from "./consensus";
import { IDeltaManager } from "./deltas";
import { IRequest, IResponse } from "./loader";
import { ISequencedDocumentMessage, MessageType } from "./protocol";
import { IDocumentStorageService, ISnapshotTree, ITree } from "./storage";
import { IUser } from "./users";

export enum ConnectionState {
    /**
     * The document is no longer connected to the delta server
     */
    Disconnected,

    /**
     * The document has an inbound connection but is still pending for outbound deltas
     */
    Connecting,

    /**
     * The document is fully connected
     */
    Connected,
}

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

/**
 * Exported module definition
 */
export interface IChaincodeFactory {
    /**
     * Instantiates a new chaincode container
     */
    instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
}
