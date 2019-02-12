import { ISharedObject, ISharedObjectExtension as ISharedObjectExtension } from "@prague/api-definitions";
import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { Stream } from "./stream";

export class StreamExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/stream";

    public type = StreamExtension.Type;

    public async load(
        runtime: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedDocumentMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const stream = new Stream(runtime, id, sequenceNumber);
        await stream.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);

        return stream;
    }

    public create(runtime: IRuntime, id: string): ISharedObject {
        const stream = new Stream(runtime, id, 0);
        stream.initializeLocal();

        return stream;
    }
}
