import * as request from "request";
import * as api from "../api";

// Loads a document from DB.
export class DocumentLoader {

    constructor(private url: string, private id: string, private services: api.ICollaborationServices) {
    }

    public async load(): Promise<api.ICollaborativeObject> {
        return new Promise<api.ICollaborativeObject>((resolve, reject) => {
            request.get(`${this.url}/object/${this.id}`, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    const type = JSON.parse(body).type;
                    const extension = api.defaultRegistry.getExtension(type);
                    const sharedObject = extension.load(this.id, this.services, api.defaultRegistry);
                    resolve(sharedObject);
                }
            });
        });
    }
}
