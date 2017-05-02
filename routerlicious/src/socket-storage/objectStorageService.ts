import * as request from "request";
import * as api from "../api";

/**
 * Client side access to object storage. Only provides read only access to the object.
 */
export class ClientObjectStorageService implements api.IObjectStorageService {
    constructor(private url: string) {
    }

    public read(id: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            request.get(`${this.url}/storage/${id}`, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(body);
                }
            });
        });
    }

    public write(id: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
