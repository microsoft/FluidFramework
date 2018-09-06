import { ICollaborativeObject, ICollaborativeObjectExtension } from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime, ISequencedObjectMessage } from "@prague/runtime-definitions";
import { Stream } from "./stream";

export class StreamExtension implements ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/stream";

    public type = StreamExtension.Type;

    public async load(
        runtime: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ICollaborativeObject> {

        const stream = new Stream(runtime, id, sequenceNumber);
        await stream.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);

        return stream;
    }

    public create(runtime: IRuntime, id: string): ICollaborativeObject {
        const stream = new Stream(runtime, id, 0);
        stream.initializeLocal();

        return stream;
    }
}
