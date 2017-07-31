import * as request from "request";
import * as api from "../api";
import * as map from "../map";

export class DocumentManager {

    constructor(private url: string, private services: api.ICollaborationServices) {
    }

    // TODO
    // TODO
    // TODO
    // This one could be trickier - need to know the document ID and object ID we care about

    // Loads a document from DB.
    public async load(document: api.Document, id: string): Promise<api.ICollaborativeObject> {
        return new Promise<api.ICollaborativeObject>((resolve, reject) => {
            request.get(`${this.url}/object/${id}`, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    const type = JSON.parse(body).type;
                    const extension = api.defaultRegistry.getExtension(type);
                    const sharedObject = extension.load(document, id, this.services, api.defaultRegistry);
                    resolve(sharedObject);
                }
            });
        });
    }

    // Creates a new map
    public async createMap(document: api.Document, id: string): Promise<api.IMap> {
        const extension = api.defaultRegistry.getExtension(map.MapExtension.Type);
        return extension.load(
            document,
            id,
            this.services,
            api.defaultRegistry) as api.IMap;
    }

}
