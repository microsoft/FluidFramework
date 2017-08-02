import * as request from "request";
import * as api from "../api";

/**
 * Document access to underlying storage
 */
export class DocumentStorageService implements api.IDocumentStorageService  {
    constructor(private id: string, private version: string, private storage: BlobStorageService) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(this.id, this.version, path);
    }

    public write(objects: api.IObject[]): Promise<void> {
        return this.storage.write(this.id, objects);
    }
}

/**
 * Client side access to object storage.
 */
export class BlobStorageService  {
    constructor(private url: string) {
    }

    public read(id: string, version: string, path: string): Promise<string> {
        return new Promise<any>((resolve, reject) => {
            request.get(`${this.url}/storage/${id}/${version}/${path}`, (error, response, body) => {
                if (error) {
                    reject(error);
                } else if (response.statusCode !== 200) {
                    reject(response.statusCode);
                } else {
                    resolve(body);
                }
            });
        });
    }

    // TODO (mdaumi): Need to implement some kind of auth mechanism here.
    public write(id: string, objects: api.IObject[]): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            request.post(`${this.url}/storage/${id}`, {body: objects, json: true}, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(body);
                }
            });
        });
    }

}
