import * as assert from "assert";
import * as resources from "gitresources";
import * as request from "request";
import * as api from "../api";

export class GitManager {
    constructor(private apiBaseUrl: string, private repository: string) {
    }

    public async getHeader(id: string, sha: string): Promise<api.IDocumentHeader> {
        return new Promise<api.IDocumentHeader>((resolve, reject) => {
            // TODO move all this stuff to the historian

            let url = `http://localhost:3000/storage/${encodeURIComponent(id)}`;
            if (sha) {
                url = `${url}/${encodeURIComponent(sha)}`;
            }

            request.get(
                {
                    json: true,
                    url,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode === 200) {
                        return resolve(response.body);
                    } else if (response.statusCode === 404) {
                        return resolve(null);
                    } else {
                        return reject(response.statusCode);
                    }
                });
        });
    }

    public async getCommit(sha: string): Promise<resources.ICommit> {
        return new Promise<resources.ICommit>((resolve, reject) => {
            request.get(
                {
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/git/commits/${encodeURIComponent(sha)}`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 200) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getCommits(sha: string, count: number): Promise<resources.ICommit[]> {
        return new Promise<any>((resolve, reject) => {
            request.get(
                {
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/commits?sha=${encodeURIComponent(sha)}`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 200) {
                        return resolve([]);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getTree(root: string, recursive = true): Promise<resources.ITree> {
        return new Promise<any>((resolve, reject) => {
            const recursiveParam = recursive ? "1" : "0";
            request.get(
                {
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/git/trees/${root}?recursive=${recursiveParam}`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 200) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    public async getBlob(sha: string): Promise<resources.IBlob> {
        return new Promise<any>((resolve, reject) => {
            request.get(
                {
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/git/blobs/${sha}`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 200) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    /**
     * Retrieves the object at the given revision number
     */
    public getObject(commit: string, path: string): Promise<any> {
        const url =
            `${this.apiBaseUrl}/repos/${this.repository}/contents/${path}?ref=${encodeURIComponent(commit)}`;
        return new Promise<any>((resolve, reject) => {
            request.get(
                {
                    json: true,
                    url,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 200) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    public createBlob(content: string, encoding: string): Promise<resources.ICreateBlobResponse> {
        const requestBody: resources.ICreateBlobParams = {
            content,
            encoding,
        };

        return new Promise<resources.ICreateBlobResponse>((resolve, reject) => {
            request.post(
                {
                    body: requestBody,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/git/blobs`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 201) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
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

        const treeP = new Promise<resources.ITree>((resolve, reject) => {
            const requestBody: resources.ICreateTreeParams = {
                tree,
            };
            request.post(
                {
                    body: requestBody,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/git/trees`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 201) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
        return treeP;
    }

    public async createCommit(commit: resources.ICreateCommitParams): Promise<resources.ICommit> {
        const commitP = new Promise<resources.ICommit>((resolve, reject) => {
            request.post(
                {
                    body: commit,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/git/commits`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 201) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });

        return commitP;
    }

    public async upsertRef(branch: string, commitSha: string): Promise<resources.IRef> {
        // Update (force) the ref to the new commit
        const ref: resources.IPatchRefParams = {
            force: true,
            sha: commitSha,
        };
        return new Promise<resources.IRef>((resolve, reject) => {
            request.patch(
                {
                    body: ref,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    json: true,
                    url: `${this.apiBaseUrl}/repos/${this.repository}/git/refs/heads/${branch}`,
                },
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== 200) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(branch: string, inputTree: api.ITree, message: string): Promise<string> {
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
        const commit = await this.createCommit(commitParams);
        await this.upsertRef(branch, commit.sha);

        return commit.sha;
    }
}

function repositoryExists(apiBaseUrl: string, repository: string) {
    return new Promise<boolean>((resolve, reject) => {
        request.get(
            { url: `${apiBaseUrl}/repos/${repository}`, json: true },
            (error, response, body) => {
                if (error) {
                    return reject(error);
                }

                return resolve(response.statusCode === 200);
            });
    });
}

function createRepository(apiBaseUrl: string, repository: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        request.post({
                body: { name: repository },
                headers: {
                    "Content-Type": "application/json",
                },
                json: true,
                url: `${apiBaseUrl}/repos`,
            },
            (error, response, body) => {
                if (error) {
                    return reject(error);
                } else if (response.statusCode !== 201) {
                    return reject(response.statusCode);
                } else {
                    return resolve();
                }
            });
    });
}

export async function getOrCreateRepository(apiBaseUrl: string, repository: string): Promise<GitManager> {
    const exists = await repositoryExists(apiBaseUrl, repository);
    if (!exists) {
        await createRepository(apiBaseUrl, repository);
    }

    return new GitManager(apiBaseUrl, repository);
}
