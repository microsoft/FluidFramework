import * as minio from "minio";
import * as api from "../api";
import * as socketStorage from "../socket-storage";

export class ObjectStorageService implements api.IObjectStorageService {
    private clientStorageService: api.IObjectStorageService;

    constructor(url: string, private client: minio.Client, private bucket: string) {
        this.clientStorageService = new socketStorage.ClientObjectStorageService(url);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public read(id: string): Promise<any> {
        return this.clientStorageService.read(id);
    }

    /**
     * Writes to the object with the given ID
     */
    public write(id: string, data: any): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.client.putObject(this.bucket, id, JSON.stringify(data), "application/json", (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
}
