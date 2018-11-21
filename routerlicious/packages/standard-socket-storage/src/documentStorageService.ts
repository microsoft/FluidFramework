import * as resources from "@prague/gitresources";
import * as api from "@prague/runtime-definitions";

/**
 * For now, this is just a placeholder
 * It will be implemented once snapshot apis are created in ODC/SPO
 */
export class DocumentStorageService implements api.IDocumentStorageService {

    // @ts-ignore ignore unused variable for now
    constructor(private readonly snapshotUrl: string, private readonly tokenProvider: api.ITokenProvider) {
    }

    public getSnapshotTree(version: resources.ICommit): Promise<api.ISnapshotTree> {
        return null;
    }

    public async getVersions(sha: string, count: number): Promise<resources.ICommit[]> {
        return [];
    }

    public async read(sha: string): Promise<string> {
        return "";
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string> {
        return "";
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit> {
        return null;
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return null;
    }

    public getRawUrl(sha: string): string {
        return null;
    }
}
