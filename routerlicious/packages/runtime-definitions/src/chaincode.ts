import { IDistributedObjectServices } from "./channel";
import { IPlatform } from "./platform";
import { ISequencedObjectMessage } from "./protocol";
import { IRuntime } from "./runtime";
import { ITree } from "./storage";

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
     * Invoked once the chaincode has been fully instantiated on the document
     */
    run(runtime: IRuntime, platform: IPlatform): Promise<void>;
}

/**
 * Exported module definition
 */
export interface IChaincodeFactory {
    /**
     * Instantiates a new instance of the chaincode against the given runtime
     */
    instantiate(): Promise<IChaincode>;
}

export interface IChannel {
    /**
     * A readonly identifier for the collaborative object
     */
    readonly id: string;

    readonly type: string;

    ready(): Promise<void>;

    snapshot(): ITree;
}

export interface IChaincodeModule  {
    /**
     * Loads the given distributed object. This call is only ever invoked internally as the only thing
     * that is ever directly loaded is the document itself. Load will then only be called on documents that
     * were created and added to a collaborative object.
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
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
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
