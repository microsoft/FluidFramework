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

    public async getSnapshotTree(version?: resources.ICommit): Promise<api.ISnapshotTree | null> {
        let requestVersion = version;
        if (!requestVersion) {
            const versions = await this.getVersions(this.id, 1);
            if (versions.length === 0) {
                return Promise.resolve<api.ISnapshotTree | null>(null);
            }
            requestVersion = versions[0];
        }
        const tree = await this.manager.getTree(requestVersion.tree.sha);
        return buildHierarchy(tree);
    }

    public async getVersions(commitId: string, count: number): Promise<resources.ICommit[]> {
        const commits = await this.manager.getCommits(commitId, count);
        return commits.map((commit) => this.translateCommit(commit));
    }

    public async read(blobId: string): Promise<string> {
        const value = await this.manager.getBlob(blobId);
        return value.content;
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string> {
        const value = await this.manager.getContent(version.sha, path);
        return value.content;
    }

    public write(tree: api.ITree, parents: string[], message: string, ref: string): Promise<resources.ICommit> {
        const branch = ref ? `components/${this.id}/${ref}` : this.id;
        return this.manager.write(branch, tree, parents, message);
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return this.manager.createBlob(file.toString("base64"), "base64");
    }

    public getRawUrl(blobId: string): string {
        return this.manager.getRawUrl(blobId);
    }

    private translateCommit(details: resources.ICommitDetails): resources.ICommit {
        return {
            author: details.commit.author,
            committer: details.commit.committer,
            message: details.commit.message,
            parents: details.parents,
            sha: details.sha,
            tree: details.commit.tree,
            url: details.commit.url,
        };
    }
}
