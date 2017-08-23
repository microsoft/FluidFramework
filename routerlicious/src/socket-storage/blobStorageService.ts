import * as resources from "gitresources";
import * as api from "../api";
import * as gitStorage from "../git-storage";

/**
 * Document access to underlying storage
 */
export class DocumentStorageService implements api.IDocumentStorageService  {
    constructor(private id: string, version: resources.ICommit, private storage: BlobStorageService) {
    }

    public read(sha: string): Promise<string> {
        return this.storage.read(sha);
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

    public getHeader(id: string, version: resources.ICommit): Promise<api.IDocumentHeader> {
        return this.manager.getHeader(id, version ? version.sha : null);
    }

    public async read(sha: string): Promise<string> {
        const value = await this.manager.getBlob(sha);
        return value.content;
    }

    // TODO (mdaumi): Need to implement some kind of auth mechanism here.
    public write(id: string, tree: api.ITree, message: string): Promise<string> {
        return this.manager.write(id, tree, message);
    }
}
