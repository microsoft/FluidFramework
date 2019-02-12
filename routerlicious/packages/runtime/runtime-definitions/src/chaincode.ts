import { IPlatform, ITree } from "@prague/container-definitions";
import { IDistributedObjectServices } from "./channel";
import { IObjectMessage, ISequencedObjectMessage } from "./protocol";
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
     * Invoked once the chaincode has been fully instantiated on the document. Run returns a platform
     * interface that can be used to access the running component.
     */
    run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform>;
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

/**
 * Code loading interface
 */
export interface ICodeLoader {
    /**
     * Loads the package specified by IPackage and returns a promise to its entry point exports.
     *
     * This definition will expand. A document likely stores a published package for the document within it. And that
     * package then goes and refers to other stuff. The base package will have the ability to pull in, install
     * data contained in the document.
     */
    load(source: string): Promise<IChaincodeFactory>;
}

export interface IChannel {
    /**
     * A readonly identifier for the shared object
     */
    readonly id: string;

    readonly type: string;

    dirty: boolean;

    ready(): Promise<void>;

    snapshot(): ITree;

    transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage;

    isLocal(): boolean;
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
