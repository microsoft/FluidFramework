import * as assert from "assert";
import * as request from "request";
import * as api from "../api";

export class GitManager {
    constructor(private apiBaseUrl: string, private repository: string) {
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public async getCommits(sha: string, count: number): Promise<any> {
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
    public async getTree(root: string, recursive = true): Promise<any> {
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

    public async getBlob(sha: string): Promise<any> {
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

    public createBlob(content: string, encoding: string) {
        return new Promise<string>((resolve, reject) => {
            request.post(
                {
                    body: {
                        content,
                        encoding,
                    },
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
                        return resolve(response.body.sha);
                    }
                });
        });
    }

    public async createTree(files: api.ITree): Promise<string> {
        // Kick off the work to create all the tree values
        const shaValuesP: Array<Promise<string>> = [];
        for (const entry of files.entries) {
            switch (api.TreeEntry[entry.type]) {
                case api.TreeEntry.Blob:
                    const entryAsBlob = entry.value as api.IBlob;
                    const shaBlobP = this.createBlob(entryAsBlob.contents, entryAsBlob.encoding);
                    shaValuesP.push(shaBlobP);
                    break;

                case api.TreeEntry.Tree:
                    const entryAsTree = entry.value as api.ITree;
                    const treeBlobP = this.createTree(entryAsTree);
                    shaValuesP.push(treeBlobP);
                    break;

                default:
                    return Promise.reject("Unknown entry type");
            }
        }

        // Wait for them all to resolve
        const shaValues = await Promise.all(shaValuesP);
        const tree: any[] = [];
        assert(shaValues.length === files.entries.length);

        // Construct a new tree from the collection of hashes
        for (let i = 0; i < files.entries.length; i++) {
            const isTree = files.entries[i].type === api.TreeEntry[api.TreeEntry.Tree];
            tree.push({
                mode: isTree ? "040000" : "100644",
                path: files.entries[i].path,
                sha: shaValues[i],
                type: isTree ? "tree" : "blob",
            });
        }

        const treeSha = await new Promise<string>((resolve, reject) => {
            request.post(
                {
                    body: { tree },
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
                        return resolve(response.body.sha);
                    }
                });
        });
        return treeSha;
    }

    public async createCommit(commit: any): Promise<string> {
        const commitSha = await new Promise<string>((resolve, reject) => {
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
                        return resolve(response.body.sha);
                    }
                });
        });

        return commitSha;
    }

    public async upsertRef(branch: string, commitSha: string): Promise<void> {
        // Update (force) the ref to the new commit
        const ref = {
            force: true,
            sha: commitSha,
        };
        await new Promise<string>((resolve, reject) => {
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
                        return resolve(response.body.sha);
                    }
                });
        });
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(branch: string, tree: api.ITree, message: string): Promise<string> {
        const treeShaP = this.createTree(tree);
        const lastCommitP = this.getCommits(branch, 1);

        // TODO maybe I should make people provide the parent commit rather than get the last one?
        const joined = await Promise.all([treeShaP, lastCommitP]);
        const treeSha = joined[0];
        const lastCommit = joined[1];

        // Construct a commit for the tree
        const commit = {
            author: {
                date: new Date().toISOString(),
                email: "kurtb@microsoft.com",
                name: "Kurt Berglund",
            },
            message,
            parents: lastCommit.length > 0 ? [lastCommit[0].sha] : [],
            tree: treeSha,
        };
        const commitSha = await this.createCommit(commit);
        await this.upsertRef(branch, commitSha);

        return commitSha;
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
