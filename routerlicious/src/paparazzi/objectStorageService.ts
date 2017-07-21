import * as api from "../api";
import * as gitStorage from "../git-storage";
import * as socketStorage from "../socket-storage";

export class ObjectStorageService implements api.IObjectStorageService {
    private clientStorageService: api.IObjectStorageService;

    constructor(url: string, private gitManager: gitStorage.GitManager) {
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
    public async write(id: string, objects: api.IObject[]): Promise<void> {
        const files = objects.map((object) => ({ path: object.path, data: JSON.stringify(object.data) }));
        return this.gitManager.write(id, files, "Commit @{TODO seq #}");
    }
}
