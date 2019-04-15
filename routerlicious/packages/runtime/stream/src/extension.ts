import { ISharedObject, ISharedObjectExtension } from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { Stream } from "./stream";

export class StreamExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/stream";

    public type = StreamExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        runtime: IRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const stream = new Stream(runtime, id);
        await stream.load(minimumSequenceNumber, headerOrigin, services);

        return stream;
    }

    public create(runtime: IRuntime, id: string): ISharedObject {
        const stream = new Stream(runtime, id);
        stream.initializeLocal();

        return stream;
    }
}
