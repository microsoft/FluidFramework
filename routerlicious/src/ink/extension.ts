import * as api from "../api";
import { InkCollaborativeObject } from "./collabObject";

export class InkExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/ink";

    public type = InkExtension.Type;

    public load(id: string, services: api.ICollaborationServices, registry: api.Registry): api.ICollaborativeObject {
        return new InkCollaborativeObject(id, services);
    }

    public create(id: string): api.ICollaborativeObject {
        return new InkCollaborativeObject(id);
    }
}
