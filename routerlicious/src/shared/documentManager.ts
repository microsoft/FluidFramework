import * as request from "request";
import * as api from "../api";

export class DocumentManager {

    constructor(private url: string, private services: api.ICollaborationServices) {
    }

    // Loads a document from DB.
    public async load(id: string): Promise<api.ICollaborativeObject> {
        return new Promise<api.ICollaborativeObject>((resolve, reject) => {
            request.get(`${this.url}/object/${id}`, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    const type = JSON.parse(body).type;
                    const extension = api.defaultRegistry.getExtension(type);
                    const sharedObject = extension.load(id, this.services, api.defaultRegistry);
                    resolve(sharedObject);
                }
            });
        });
    }

    // Creates a new map
    public async createMap(id: string): Promise<api.IMap> {
        const extension = api.defaultRegistry.getExtension(api.MapExtension.Type);
        return extension.load(
            `${id}-insights`,
            this.services,
            api.defaultRegistry) as api.IMap;
    }

}
