import { IComponentRuntime, IDistributedObjectServices } from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectExtension } from "@prague/shared-object-common";
import { Stream } from "./stream";

export class StreamExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/stream";

    public type = StreamExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const stream = new Stream(runtime, id);
        await stream.load(minimumSequenceNumber, headerOrigin, services);

        return stream;
    }

    public create(runtime: IComponentRuntime, id: string): ISharedObject {
        const stream = new Stream(runtime, id);
        stream.initializeLocal();

        return stream;
    }
}
