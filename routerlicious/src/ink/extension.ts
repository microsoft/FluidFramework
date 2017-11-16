import * as resources from "gitresources";
import * as api from "../api-core";
import { InkCollaborativeObject } from "./collabObject";

export class InkExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/ink";

    public type = InkExtension.Type;

    public load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        headerOrigin: string,
        header: string): api.ICollaborativeObject {

        return new InkCollaborativeObject(document, id, sequenceNumber, services, version, header);
    }

    public create(document: api.IDocument, id: string): api.ICollaborativeObject {
        return new InkCollaborativeObject(document, id, 0);
    }
}
