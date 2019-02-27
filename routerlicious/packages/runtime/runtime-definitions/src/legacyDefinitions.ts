import {
    IDeltaManager,
    IGenericBlob,
    ILoader,
    IPlatform,
    IQuorum,
    MessageType,
} from "@prague/container-definitions";
import { EventEmitter } from "events";
import {
    IChannel,
    IDistributedObjectServices,
} from "./channel";

export interface IChaincode {
    /**
     * Retrieves the module by type name
     */
    getModule(type: string);

    /**
     * Stops the instantiated chaincode from running
     */
    close(): Promise<void>;

    /**
     * Invoked once the chaincode has been fully instantiated on the document. Run returns a platform
     * interface that can be used to access the running component.
     */
    run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform>;
}

export interface IChaincodeModule  {
    /**
     * Loads the given distributed object. This call is only ever invoked internally as the only thing
     * that is ever directly loaded is the document itself. Load will then only be called on documents that
     * were created and added to a shared object.
     *
     * document: The document the object is part of
     * connection: Interface used to retrieve updates from remote clients
     * version: Document version being loaded
     * header: Base64 encoded stored header for a snapshot. Or null if a new data type.
     * storage: Access to the data store to retrieve more information.
     *
     * Thought: should the storage object include the version information and limit access to just files
     * for the given object? The latter seems good in general. But both are probably good things. We then just
     * need a way to allow the document to provide later storage for the object.
     */
    load(
        runtime: IRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<IChannel>;

    /**
     * Creates a local version of the distributive object.
     *
     * Calling attach on the object later will insert it into object stream.
     * NOTE here - When we attach we need to submit all the pending ops prior to actually doing the attach
     * for consistency.
     */
    create(runtime: IRuntime, id: string): IChannel;
}

export interface IRuntime extends EventEmitter {
    readonly tenantId: string;

    readonly documentId: string;

    readonly id: string;

    readonly existing: boolean;

    readonly options: any;

    readonly clientId: string;

    readonly parentBranch: string;

    readonly connected: boolean;

    readonly deltaManager: IDeltaManager;

    readonly platform: IPlatform;

    readonly loader: ILoader;

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

    // Blob related calls

    uploadBlob(file: IGenericBlob): Promise<IGenericBlob>;

    getBlob(sha: string): Promise<IGenericBlob>;

    getBlobMetadata(): Promise<IGenericBlob[]>;

    /**
     * Submits a message on the document channel
     */
    submitMessage(type: MessageType, content: any);
}
