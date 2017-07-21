import * as request from "request";
import { debug } from "./debug";

/**
 * File stored in a git repo
 */
export interface IGitFile {
    // Path to the file
    path: string;

    // Data for the file
    data: any;
}

export class GitRepository {

}

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

    /**
     * Writes to the object with the given ID
     */
    public async write(branch: string, files: IGitFile[], message: string): Promise<void> {
        // Iterate through all the files and create blobs for them and retrieve the hashes
        const blobsP = Promise.all(files.map((file) => {
            return new Promise<string>((resolve, reject) => {
                request.post(
                    {
                        body: {
                            content: file.data,
                            encoding: "utf-8",
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
        }));
        const lastCommitP = this.getCommits(branch, 1);
        const blobsAndHead = await Promise.all([blobsP, lastCommitP]);
        const blobs = blobsAndHead[0];
        const lastCommit = blobsAndHead[1];

        // Construct a new tree from the collection of hashes
        const tree: any[] = [];
        for (let i = 0; i < blobs.length; i++) {
            tree.push({
                mode: "100644",
                path: files[i].path,
                sha: blobs[i],
                type: "blob",
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

        // Construct a commit for the tree
        const commit = {
            author: {
                date: new Date().toISOString(),
                email: "kurtb@microsoft.com",
                name: "Kurt Berglund",
            },
            message: "Commit @{TODO seq #}",
            parents: lastCommit.length > 0 ? [lastCommit[0].sha] : [],
            tree: treeSha,
        };
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

        // Update (force) the ref to the new commit
        const ref = {
            force: true,
            sha: commitSha,
        };
        debug(commitSha);
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
