import * as resources from "@prague/gitresources";
import * as api from "@prague/runtime-definitions";
import { buildHierarchy } from "@prague/utils";
import { IDocumentStorageManager } from "./standardDocumentStorageManager";

/**
 * The current implementation of this aligns with SPO's implmentation of SnapShot
 */
export class DocumentStorageService implements api.IDocumentStorageService {
    public get repositoryUrl(): string {
        return "";
    }

    constructor(private readonly storageManager: IDocumentStorageManager) {
    }

    public async getSnapshotTree(version?: resources.ICommit): Promise<api.ISnapshotTree> {
        const tree = await this.storageManager.getTree(version);
        return buildHierarchy(tree);
    }

    public async getVersions(sha: string, count: number): Promise<resources.ICommit[]> {
        return this.storageManager.getVersions(sha, count);
    }

    public async read(sha: string): Promise<string> {
        const response = await this.storageManager.getBlob(sha);
        return response.content;
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string> {
        const response = await this.storageManager.getContent(version, path);
        return response.content;
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit> {
        return this.storageManager.write(tree, parents, message);
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return this.storageManager.createBlob(file);
    }

    public getRawUrl(sha: string): string {
        return this.storageManager.getRawUrl(sha);
    }
}
