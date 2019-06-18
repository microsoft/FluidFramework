import { IChannel, ISharedObjectServices } from "./channel";
import { IComponentRuntime } from "./components";

export interface IChaincodeModule  {
    /**
     * Loads the given shared object. This call is only ever invoked internally as the only thing
     * that is ever directly loaded is the document itself. Load will then only be called on documents that
     * were created and added to a shared object.
     *
     * @param runtime - Component runtime containing state/info/helper methods about the component.
     * @param id - ID of the shared object.
     * @param minimumSequenceNumber - Current MSN.
     * @param services - Services to read objects at a given path using the delta connection.
     * @param headerOrigin - The document ID.
     *
     * Thought: should the storage object include the version information and limit access to just files
     * for the given object? The latter seems good in general. But both are probably good things. We then just
     * need a way to allow the document to provide later storage for the object.
     */
    load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<IChannel>;

    /**
     * Creates a local version of the shared object.
     *
     * Calling attach on the object later will insert it into object stream.
     * NOTE here - When we attach we need to submit all the pending ops prior to actually doing the attach
     * for consistency.
     */
    create(runtime: IComponentRuntime, id: string): IChannel;
}
