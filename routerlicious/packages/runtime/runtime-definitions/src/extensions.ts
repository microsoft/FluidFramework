import { IChannel, IDistributedObjectServices } from "./channel";
import { IComponentRuntime } from "./components";

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
        runtime: IComponentRuntime,
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
    create(runtime: IComponentRuntime, id: string): IChannel;
}
