import * as resources from "gitresources";
import * as api from "../api-core";
import * as gitStorage from "../git-storage";

/**
 * Document access to underlying storage
 */
export class DocumentStorageService implements api.IDocumentStorageService  {
    constructor(tenantId: string, private id: string, private manager: gitStorage.GitManager) {
    }

    public getSnapshotTree(version: resources.ICommit): Promise<api.ISnapshotTree> {
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

    public write(tree: api.ITree, message: string): Promise<resources.ICommit> {
        return this.manager.write(this.id, tree, message);
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
