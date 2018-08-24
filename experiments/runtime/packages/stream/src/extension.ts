import * as api from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { Stream } from "./stream";

export class StreamExtension implements api.ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/stream";

    public type = StreamExtension.Type;

    public async load(
        runtime: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<api.ICollaborativeObject> {

        const stream = new Stream(id, runtime, sequenceNumber);
        await stream.load(sequenceNumber, minimumSequenceNumber, headerOrigin, services);

        return stream;
    }

    public create(document: api.IDocument, id: string): api.ICollaborativeObject {
        const stream = new Stream(id, document.runtime, 0);
        stream.initializeLocal();

        return stream;
    }
}
