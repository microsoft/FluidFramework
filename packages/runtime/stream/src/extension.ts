import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectExtension } from "@prague/shared-object-common";
import { Stream } from "./stream";

/**
 * Factory for Streams.
 */
export class StreamExtension implements ISharedObjectExtension {
    /**
     * Static type identifier.
     */
    public static Type = "https://graph.microsoft.com/types/stream";

    /**
     * Type identifier.
     */
    public type = StreamExtension.Type;

    /**
     * Version of the stream snapshot format.
     */
    public readonly snapshotFormatVersion: string = "0.1";

    /**
     * Creates a new Stream object and loads it with data from the given services.
     *
     * @param runtime - The ComponentRuntime that this stream will be associated with
     * @param id - Unique ID for the new stream
     * @param minimumSequenceNumber - Not used
     * @param services - Services with the object storage to load from
     * @param headerOrigin - Not used
     */
    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const stream = new Stream(runtime, id);
        await stream.load(minimumSequenceNumber, headerOrigin, services);

        return stream;
    }

    /**
     * Creates a new empty Stream object.
     *
     * @param runtime - The ComponentRuntime that this stream will be associated with
     * @param id - Unique ID for the new stream
     */
    public create(runtime: IComponentRuntime, id: string): ISharedObject {
        const stream = new Stream(runtime, id);
        stream.initializeLocal();

        return stream;
    }
}
