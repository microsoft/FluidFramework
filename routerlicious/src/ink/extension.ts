import * as api from "../api";
import { InkCollaborativeObject } from "./collabObject";

export class InkExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/ink";

    public type = InkExtension.Type;

    public load(
        document: api.Document,
        id: string,
        services: api.IDistributedObjectServices,
        version: string,
        header: string): api.ICollaborativeObject {

        return new InkCollaborativeObject(document, id, services, version, header);
    }

    public create(document: api.Document, id: string): api.ICollaborativeObject {
        return new InkCollaborativeObject(document, id);
    }
}
