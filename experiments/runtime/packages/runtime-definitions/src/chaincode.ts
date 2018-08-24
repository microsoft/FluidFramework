import { IDistributedObjectServices } from "./channel";
import { IRuntime } from "./runtime";

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
    run(runtime: IRuntime): Promise<void>;
}

/**
 * Exported module definition
 */
export interface IChaincodeFactory {
    /**
     * Instantiates a new instance of the chaincode against the given runtime
     */
    instantiate(runtime: IRuntime): Promise<IChaincode>;
}

export interface IChannel {
    /**
     * A readonly identifier for the collaborative object
     */
    readonly id: string;

    ready(): Promise<void>;
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
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<IChannel>;
}
