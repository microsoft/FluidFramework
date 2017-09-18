import * as assert from "assert";
import * as resources from "gitresources";
import * as api from "../api";

export class GitManager {
    constructor(private historian: resources.IHistorian, private repository: string) {
    }

    public getHeader(id: string, sha: string): Promise<api.IDocumentHeader> {
        return this.historian.getHeader(this.repository, sha);
    }

    public async getCommit(sha: string): Promise<resources.ICommit> {
        return this.historian.getCommit(this.repository, sha);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getCommits(sha: string, count: number): Promise<resources.ICommit[]> {
        return this.historian.getCommits(this.repository, sha, count);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getTree(root: string, recursive = true): Promise<resources.ITree> {
        return this.historian.getTree(this.repository, root, recursive);
    }

    public async getBlob(sha: string): Promise<resources.IBlob> {
        return this.historian.getBlob(this.repository, sha);
    }

    /**
     * Retrieves the object at the given revision number
     */
    public getObject(commit: string, path: string): Promise<any> {
        return this.historian.getContent(this.repository, path, commit);
    }

    public createBlob(content: string, encoding: string): Promise<resources.ICreateBlobResponse> {
        const blob: resources.ICreateBlobParams = {
            content,
            encoding,
        };
        return this.historian.createBlob(this.repository, blob);
    }

    public async createTree(files: api.ITree): Promise<resources.ITree> {
        // Kick off the work to create all the tree values
        const entriesP: Array<Promise<resources.ICreateBlobResponse | resources.ITree>> = [];
        for (const entry of files.entries) {
            switch (api.TreeEntry[entry.type]) {
                case api.TreeEntry.Blob:
                    const entryAsBlob = entry.value as api.IBlob;
                    const blobP = this.createBlob(entryAsBlob.contents, entryAsBlob.encoding);
                    entriesP.push(blobP);
                    break;

                case api.TreeEntry.Tree:
                    const entryAsTree = entry.value as api.ITree;
                    const treeBlobP = this.createTree(entryAsTree);
                    entriesP.push(treeBlobP);
                    break;

                default:
                    return Promise.reject("Unknown entry type");
            }
        }

        // Wait for them all to resolve
        const entries = await Promise.all(entriesP);
        const tree: resources.ICreateTreeEntry[] = [];
        assert(entries.length === files.entries.length);

        // Construct a new tree from the collection of hashes
        for (let i = 0; i < files.entries.length; i++) {
            const isTree = files.entries[i].type === api.TreeEntry[api.TreeEntry.Tree];
            tree.push({
                mode: isTree ? "040000" : "100644",
                path: files.entries[i].path,
                sha: entries[i].sha,
                type: isTree ? "tree" : "blob",
            });
        }

        const requestBody: resources.ICreateTreeParams = {
            tree,
        };
        const treeP = this.historian.createTree(this.repository, requestBody);
        return treeP;
    }

    public async createCommit(commit: resources.ICreateCommitParams): Promise<resources.ICommit> {
        return this.historian.createCommit(this.repository, commit);
    }

    public async upsertRef(branch: string, commitSha: string): Promise<resources.IRef> {
        // Update (force) the ref to the new commit
        const ref: resources.IPatchRefParams = {
            force: true,
            sha: commitSha,
        };

        return this.historian.updateRef(this.repository, branch, ref);
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(branch: string, inputTree: api.ITree, message: string): Promise<resources.ICommit> {
        const treeShaP = this.createTree(inputTree);
        const lastCommitP = this.getCommits(branch, 1);

        // TODO maybe I should make people provide the parent commit rather than get the last one?
        const joined = await Promise.all([treeShaP, lastCommitP]);
        const tree = joined[0];
        const lastCommit = joined[1];

        // Construct a commit for the tree
        const commitParams: resources.ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "kurtb@microsoft.com",
                name: "Kurt Berglund",
            },
            message,
            parents: lastCommit.length > 0 ? [lastCommit[0].sha] : [],
            tree: tree.sha,
        };

        return this.historian.createCommit(this.repository, commitParams);
    }
}

async function repositoryExists(historian: resources.IHistorian, repository: string): Promise<boolean> {
    const details = await historian.getRepo(repository);
    return !!details;
}

function createRepository(historian: resources.IHistorian, repository: string): Promise<void> {
    const createParams: resources.ICreateRepoParams = {
        name: repository,
    };
    return historian.createRepo(createParams);
}

export async function getOrCreateRepository(historian: resources.IHistorian, repository: string): Promise<GitManager> {
    const exists = await repositoryExists(historian, repository);
    if (!exists) {
        await createRepository(historian, repository);
    }

    return new GitManager(historian, repository);
}
