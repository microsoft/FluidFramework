import * as api from "../api";
import * as socketStorage from "../socket-storage";

export class ObjectStorageService implements api.IObjectStorageService {
    private clientStorageService: api.IObjectStorageService;

    constructor(url: string) {
        this.clientStorageService = new socketStorage.ClientObjectStorageService(url);
    }

    public create(name: string): Promise<void> {
        return this.clientStorageService.create(name);
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
        return this.clientStorageService.write(id, data);
    }
}
