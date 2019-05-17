import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import * as gitStorage from "@prague/services-client";
import { buildHierarchy } from "@prague/utils";

/**
 * Document access to underlying storage
 */
export class DocumentStorageService implements api.IDocumentStorageService  {
    public get repositoryUrl(): string {
        return "";
    }

    constructor(private id: string, public manager: gitStorage.GitManager) {
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        let requestVersion = version;
        if (!requestVersion) {
            const versions = await this.getVersions(this.id, 1);
            if (versions.length === 0) {
                return Promise.resolve<api.ISnapshotTree | null>(null);
            }
            requestVersion = versions[0];
        }
        const tree = await this.manager.getTree(requestVersion.treeId);
        return buildHierarchy(tree);
    }

    public async getVersions(commitId: string, count: number): Promise<api.IVersion[]> {
        const commits = await this.manager.getCommits(commitId, count);
        return commits.map((commit) => this.translateCommit(commit));
    }

    public async read(blobId: string): Promise<string> {
        const value = await this.manager.getBlob(blobId);
        return value.content;
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        const value = await this.manager.getContent(version.id, path);
        return value.content;
    }

    public write(tree: api.ITree, parents: string[], message: string, ref: string): Promise<api.IVersion> {
        const branch = ref ? `components/${this.id}/${ref}` : this.id;
        const commit = this.manager.write(branch, tree, parents, message);
        return commit.then((c) => ({id: c.sha, treeId: c.tree.sha}));
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return this.manager.createBlob(file.toString("base64"), "base64");
    }

    public getRawUrl(blobId: string): string {
        return this.manager.getRawUrl(blobId);
    }

    private translateCommit(details: resources.ICommitDetails): api.IVersion {
        return {
            id: details.sha,
            treeId: details.commit.tree.sha,
        };
    }
}
