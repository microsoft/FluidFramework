import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { buildHierarchy } from "@prague/utils";
import * as assert from "assert";
import { IGitManager, IHistorian } from "./storage";

export class GitManager implements IGitManager {
    private blobCache = new Map<string, resources.IBlob>();

    constructor(private historian: IHistorian) {
    }

    public async getHeader(id: string, sha: string): Promise<api.ISnapshotTree> {
        const header = await this.historian.getHeader(sha);

        // Cache blobs that were sent in the header
        for (const blob of header.blobs) {
            this.blobCache.set(blob.sha, blob);
        }

        return buildHierarchy(header.tree);
    }

    public async getCommit(sha: string): Promise<resources.ICommit> {
        return this.historian.getCommit(sha);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getCommits(sha: string, count: number): Promise<resources.ICommitDetails[]> {
        return this.historian.getCommits(sha, count);
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getTree(root: string, recursive = true): Promise<resources.ITree> {
        return this.historian.getTree(root, recursive);
    }

    public async getBlob(sha: string): Promise<resources.IBlob> {
        return this.blobCache.has(sha)
            ? this.blobCache.get(sha)
            : this.historian.getBlob(sha);
    }

    public getRawUrl(sha: string): string {
        return this.historian.endpoint + "/git/blobs/raw/" + sha;
    }

    /**
     * Retrieves the object at the given revision number
     */
    /* tslint:disable:promise-function-async */
     public getContent(commit: string, path: string): Promise<resources.IBlob> {
        return this.historian.getContent(path, commit);
    }

    public createBlob(content: string, encoding: string): Promise<resources.ICreateBlobResponse> {
        const blob: resources.ICreateBlobParams = {
            content,
            encoding,
        };
        return this.historian.createBlob(blob);
    }

    public createTree(files: api.ITree): Promise<resources.ITree> {
        return this.createTreeCore(files, 0);
    }

    public async createCommit(commit: resources.ICreateCommitParams): Promise<resources.ICommit> {
        return this.historian.createCommit(commit);
    }

    public async getRef(ref: string): Promise<resources.IRef> {
        return this.historian
            .getRef(`heads/${ref}`)
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

        return this.historian.createRef(createRefParams);
    }

    public async upsertRef(branch: string, commitSha: string): Promise<resources.IRef> {
        // Update (force) the ref to the new commit
        const ref: resources.IPatchRefParams = {
            force: true,
            sha: commitSha,
        };

        return this.historian.updateRef(`heads/${branch}`, ref);
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(
        branch: string,
        inputTree: api.ITree,
        parents: string[],
        message: string): Promise<resources.ICommit> {

        const tree = await this.createTree(inputTree);

        // Construct a commit for the tree
        const commitParams: resources.ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "kurtb@microsoft.com",
                name: "Kurt Berglund",
            },
            message,
            parents,
            tree: tree.sha,
        };

        const commit = await this.historian.createCommit(commitParams);

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

    private async createTreeCore(files: api.ITree, depth: number): Promise<resources.ITree> {
        // Kick off the work to create all the tree values
        const entriesP: Array<Promise<resources.ICreateBlobResponse | resources.ITree>> = [];
        for (const entry of files.entries) {
            switch (api.TreeEntry[entry.type]) {
                case api.TreeEntry.Blob:
                    const entryAsBlob = entry.value as api.IBlob;

                    // Symlinks currently directly references a folder off the root of the tree. We adjust
                    // the path based on the depth of the tree
                    if (entry.mode === api.FileMode.Symlink) {
                        entryAsBlob.contents = this.translateSymlink(entryAsBlob.contents, depth);
                    }

                    const blobP = this.createBlob(entryAsBlob.contents, entryAsBlob.encoding);
                    entriesP.push(blobP);
                    break;

                case api.TreeEntry.Tree:
                    const entryAsTree = entry.value as api.ITree;
                    const treeBlobP = this.createTreeCore(entryAsTree, depth + 1);
                    entriesP.push(treeBlobP);
                    break;

                case api.TreeEntry.Commit:
                    entriesP.push(Promise.resolve({ sha: entry.value as string, url: "" }));
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
        // tslint:disable-next-line:no-increment-decrement
        for (let i = 0; i < files.entries.length; i++) {
            const type = files.entries[i].type === api.TreeEntry[api.TreeEntry.Tree]
                ? "tree"
                : (files.entries[i].type === api.TreeEntry[api.TreeEntry.Blob] ? "blob" : "commit");

            tree.push({
                mode: files.entries[i].mode,
                path: files.entries[i].path,
                sha: entries[i].sha,
                type,
            });
        }

        const requestBody: resources.ICreateTreeParams = {
            tree,
        };
        const treeP = this.historian.createTree(requestBody);
        return treeP;
    }

    private translateSymlink(link: string, depth: number): string {
        let prefix = "";
        // tslint:disable-next-line:no-increment-decrement
        for (let i = 0; i <= depth; i++) {
            prefix += "../";
        }

        return `${prefix}${link}`;
    }
}
