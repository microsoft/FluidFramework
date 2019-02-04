import { EventEmitter } from "events";
import { IGenericBlob } from "./blobs";
import { IChannel } from "./chaincode";
import { IDistributedObjectServices } from "./channel";
import { IQuorum } from "./consensus";
import { IDeltaManager } from "./deltas";
import { IPlatform } from "./platform";
import { ISequencedDocumentMessage, MessageType } from "./protocol";

/**
 * Message handler definition
 */
export interface IMessageHandler {
    prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    process(message: ISequencedDocumentMessage, context: any, local: boolean): void;
}

export interface IRuntime extends EventEmitter {
    readonly tenantId: string;

    readonly id: string;

    readonly existing: boolean;

    readonly options: any;

    readonly clientId: string;

    readonly parentBranch: string;

    readonly connected: boolean;

    readonly deltaManager: IDeltaManager;

    readonly platform: IPlatform;

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

    /**
     * Retrieves the current quorum
     */
    getQuorum(): IQuorum;

    /**
     * Snapshots the current runtime
     */
    snapshot(message: string): Promise<void>;

    /**
     * Triggers a message to force a snapshot
     */
    save(message: string);

    /**
     * Terminates the runtime and closes the document
     */
    close(): void;

    hasUnackedOps(): boolean;

    // Blob related calls

    uploadBlob(file: IGenericBlob): Promise<IGenericBlob>;

    getBlob(sha: string): Promise<IGenericBlob>;

    getBlobMetadata(): Promise<IGenericBlob[]>;

    /**
     * Submits a message on the document channel
     */
    submitMessage(type: MessageType, content: any);

    registerTasks(tasks: string[], version?: string);
}
