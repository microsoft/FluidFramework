import * as resources from "gitresources";
import * as api from "../api-core";
import { Stream } from "./stream";

export class StreamExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/stream";

    public type = StreamExtension.Type;

    public load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        headerOrigin: string,
        header: string): api.ICollaborativeObject {

        const stream = new Stream(document, id, sequenceNumber, services, version, header);
        stream.load(sequenceNumber, version, header, headerOrigin, services);

        return stream;
    }

    public create(document: api.IDocument, id: string): api.ICollaborativeObject {
        const stream = new Stream(document, id, 0);
        stream.initializeLocal();

        return stream;
    }
}
