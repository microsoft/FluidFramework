import { ISharedObject, ISharedObjectExtension as ISharedObjectExtension } from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { Stream } from "./stream";

export class StreamExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/stream";

    public type = StreamExtension.Type;

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
