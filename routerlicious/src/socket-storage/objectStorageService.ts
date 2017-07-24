import * as request from "request";
import * as api from "../api";

/**
 * Client side access to object storage.
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
