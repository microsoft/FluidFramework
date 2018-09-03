import * as resources from "@prague/gitresources";
import {
    IDocumentStorageService,
    ISnapshotTree,
    ITree,
} from "@prague/runtime-definitions";
import * as gitStorage from "../services-client";

/**
 * Document access to underlying storage
 */
export class DocumentStorageService implements IDocumentStorageService  {
    constructor(tenantId: string, private id: string, public manager: gitStorage.GitManager) {
    }

    public getSnapshotTree(version: resources.ICommit): Promise<ISnapshotTree> {
        return this.manager.getHeader(this.id, version ? version.sha : null);
    }

    public async getVersions(sha: string, count: number): Promise<resources.ICommit[]> {
        const commits = await this.manager.getCommits(sha, count);
        return commits.map((commit) => this.translateCommit(commit));
    }

    public async read(sha: string): Promise<string> {
        const value = await this.manager.getBlob(sha);
        return value.content;
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string> {
        const value = await this.manager.getContent(version.sha, path);
        return value.content;
    }

    public write(tree: ITree, parents: string[], message: string): Promise<resources.ICommit> {
        return this.manager.write(this.id, tree, parents, message);
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return this.manager.createBlob(file.toString("base64"), "base64");
    }

    public getRawUrl(sha: string): string {
        return this.manager.getRawUrl(sha);
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
