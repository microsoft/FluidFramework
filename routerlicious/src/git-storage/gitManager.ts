import * as assert from "assert";
import * as resources from "gitresources";
import * as api from "../api-core";

export function buildHierarchy(flatTree: resources.ITree): api.ISnapshotTree {
    const lookup: { [path: string]: api.ISnapshotTree } = {};
    const root: api.ISnapshotTree = { blobs: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.tree) {
        const lastIndex = entry.path.lastIndexOf("/");
        const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entry.path.slice(lastIndex  + 1);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree = { blobs: {}, trees: {} };
            node.trees[entryPathBase] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[entryPathBase] = entry.sha;
        }
    }

    return root;
}

export class GitManager {
    private blobCache = new Map<string, resources.IBlob>();

    constructor(
        private historian: resources.IHistorian,
        public endpoint: string,
        private owner: string,
        private repository: string) {
    }

    public async getHeader(id: string, sha: string): Promise<api.ISnapshotTree> {
        const header = await this.historian.getHeader(this.owner, this.repository, sha);

        // Cache blobs that were sent in the header
        for (let blob of header.blobs) {
            this.blobCache.set(blob.sha, blob);
        }

        return buildHierarchy(header.tree);
    }

    public async getCommit(sha: string): Promise<resources.ICommit> {
        return this.historian.getCommit(this.owner, this.repository, sha);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getCommits(sha: string, count: number): Promise<resources.ICommitDetails[]> {
        return this.historian.getCommits(this.owner, this.repository, sha, count);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getTree(root: string, recursive = true): Promise<resources.ITree> {
        return this.historian.getTree(this.owner, this.repository, root, recursive);
    }

    public async getBlob(sha: string): Promise<resources.IBlob> {
        return this.blobCache.has(sha)
            ? this.blobCache.get(sha)
            : this.historian.getBlob(this.owner, this.repository, sha);
    }

    /**
     * Retrieves the object at the given revision number
     */
    public getContent(commit: string, path: string): Promise<resources.IBlob> {
        return this.historian.getContent(this.owner, this.repository, path, commit);
    }

    public createBlob(content: string, encoding: string): Promise<resources.ICreateBlobResponse> {
        const blob: resources.ICreateBlobParams = {
            content,
            encoding,
        };
        return this.historian.createBlob(this.owner, this.repository, blob);
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
        const treeP = this.historian.createTree(this.owner, this.repository, requestBody);
        return treeP;
    }

    public async createCommit(commit: resources.ICreateCommitParams): Promise<resources.ICommit> {
        return this.historian.createCommit(this.owner, this.repository, commit);
    }

    public async getRef(ref: string): Promise<resources.IRef> {
        return this.historian
            .getRef(this.owner, this.repository, `heads/${ref}`)
            .catch((error) => {
                if (error === 400 || error === 404) {
                    return null;
                } else {
                    return Promise.reject(error);
                }
            });
    }

    public async createRef(branch: string, sha: string): Promise<resources.IRef> {
        const createRefParams: resources.ICreateRefParams = {
            ref: `refs/heads/${branch}`,
            sha,
        };

        return this.historian.createRef(this.owner, this.repository, createRefParams);
    }

    public async upsertRef(branch: string, commitSha: string): Promise<resources.IRef> {
        // Update (force) the ref to the new commit
        const ref: resources.IPatchRefParams = {
            force: true,
            sha: commitSha,
        };

        return this.historian.updateRef(this.owner, this.repository, `heads/${branch}`, ref);
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

        const commit = await this.historian.createCommit(this.owner, this.repository, commitParams);

        // Create or update depending on if ref exists.
        // TODO optimize the update to know up front if the ref exists
        const existingRef = await this.getRef(branch);
        if (existingRef) {
            await this.upsertRef(branch, commit.sha);
        } else {
            await this.createRef(branch, commit.sha);
        }

        return commit;
    }
}

async function repositoryExists(historian: resources.IHistorian, owner: string, repository: string): Promise<boolean> {
    const details = await historian.getRepo(owner, repository);
    return !!details;
}

function createRepository(historian: resources.IHistorian, owner: string, repository: string): Promise<void> {
    const createParams: resources.ICreateRepoParams = {
        name: repository,
    };
    return historian.createRepo(owner, createParams);
}

export async function getOrCreateRepository(
    historian: resources.IHistorian,
    endpoint: string,
    owner: string,
    repository: string): Promise<GitManager> {

    const exists = await repositoryExists(historian, owner, repository);
    if (!exists) {
        await createRepository(historian, owner, repository);
    }

    return new GitManager(historian, endpoint, owner, repository);
}
