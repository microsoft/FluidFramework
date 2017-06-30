import * as request from "request";
import * as api from "../api";

/**
 * Client side access to object storage. Only provides read only access to the object.
 */
export class ClientObjectStorageService implements api.IObjectStorageService {
    constructor(private url: string) {
    }

    public read(id: string, version: string, path: string): Promise<any> {
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

    public write(id: string, objects: api.IObject[]): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
