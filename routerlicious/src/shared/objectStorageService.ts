import * as api from "../api";
import * as socketStorage from "../socket-storage";

export class ObjectStorageService implements api.IObjectStorageService {
    private clientStorageService: api.IObjectStorageService;

    constructor(url: string) {
        this.clientStorageService = new socketStorage.ClientObjectStorageService(url);
    }
    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public read(id: string, version: string, path: string): Promise<any> {
        return this.clientStorageService.read(id, version, path);
    }

    /**
     * Writes to the object with the given ID
     */
    public write(id: string, objects: api.IObject[]): Promise<void> {
        return this.clientStorageService.write(id, objects);
    }
}
