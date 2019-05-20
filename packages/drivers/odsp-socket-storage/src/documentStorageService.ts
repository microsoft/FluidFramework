import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
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

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        const tree = await this.storageManager.getTree(version);
        const hierarchicalTree = buildHierarchy(tree);

        if (hierarchicalTree) {
            // decode commit paths
            const commits = {};

            const keys = Object.keys(hierarchicalTree.commits);
            for (const key of keys) {
                commits[decodeURIComponent(key)] = hierarchicalTree.commits[key];
            }

            hierarchicalTree.commits = commits;
        }

        return hierarchicalTree;
    }

    public async getVersions(commitId: string, count: number): Promise<api.IVersion[]> {
        return this.storageManager.getVersions(commitId, count);
    }

    public async read(blobId: string): Promise<string> {
        const response = await this.storageManager.getBlob(blobId);
        return response.content;
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        const response = await this.storageManager.getContent(version, path);
        return response.content;
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion | undefined> {
        return this.storageManager.write(tree, parents, message);
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return this.storageManager.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storageManager.getRawUrl(blobId);
    }
}
