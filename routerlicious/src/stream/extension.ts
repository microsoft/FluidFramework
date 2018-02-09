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

        return new Stream(document, id, sequenceNumber, services, version, header);
    }

    public create(document: api.IDocument, id: string): api.ICollaborativeObject {
        return new Stream(document, id, 0);
    }
}
