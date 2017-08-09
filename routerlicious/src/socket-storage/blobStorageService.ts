import * as api from "../api";
import * as gitStorage from "../git-storage";

/**
 * Document access to underlying storage
 */
export class DocumentStorageService implements api.IDocumentStorageService  {
    constructor(private id: string, private version: string, private storage: BlobStorageService) {
    }

    public read(path: string): Promise<string> {
        return this.storage.read(this.id, this.version, path);
    }

    public write(tree: api.ITree, message: string): Promise<string> {
        return this.storage.write(this.id, tree, message);
    }
}

/**
 * Client side access to object storage.
 */
export class BlobStorageService  {
    private manager: gitStorage.GitManager;

    constructor(baseUrl: string, repository: string) {
        this.manager = new gitStorage.GitManager(baseUrl, repository);
    }

    public async read(id: string, version: any, path: string): Promise<string> {
        const value = await this.manager.getObject(version.sha, path);
        return value.content;
    }

    // TODO (mdaumi): Need to implement some kind of auth mechanism here.
    public write(id: string, tree: api.ITree, message: string): Promise<string> {
        return this.manager.write(id, tree, message);
    }
}
