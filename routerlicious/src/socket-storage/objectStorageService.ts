import * as request from "request";
import * as api from "../api";

/**
 * Client side access to object storage.
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

    public write(id: string, data: any): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            request.post(`${this.url}/storage/${id}`, {body: data, json: true}, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(body);
                }
            });
        });
    }
}
