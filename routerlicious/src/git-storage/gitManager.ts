import * as request from "request";

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
    public async getCommits(branch: string, sha: string, count: string): Promise<any> {
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

    /**
     * Writes to the object with the given ID
     */
    public async write(branch: string, files: IGitFile[], message: string): Promise<void> {
        // Rip through all the files and create blobs for them and retrieve the hashes
        // function createBlob(supertest: request.SuperTest<request.Test>, repoName: string, blob: ICreateBlobParams) {
        //     return supertest
        //         .post(`/repos/${repoName}/git/blobs`)
        //         .set("Accept", "application/json")
        //         .set("Content-Type", "application/json")
        //         .send(blob)
        //         .expect(201);
        // }
        // const testBlob: ICreateBlobParams = {
        //     content: "Hello, World!",
        //     encoding: "utf-8",
        // };

        // Construct a new tree from the collection of hashes
        // function createTree(supertest: request.SuperTest<request.Test>, repoName: string, tree: ICreateTreeParams) {
        //     return supertest
        //         .post(`/repos/${repoName}/git/trees`)
        //         .set("Accept", "application/json")
        //         .set("Content-Type", "application/json")
        //         .send(tree)
        //         .expect(201);
        // }
        // const testTree: ICreateTreeParams = {
        //     tree: [
        //         {
        //             mode: "100644",
        //             path: "file.txt",
        //             sha: "b45ef6fec89518d314f546fd6c3025367b721684",
        //             type: "blob",
        //         }],
        // };

        // Construct a commit for the tree
        // function createCommit(supertest: request.SuperTest<request.Test>,
        //         repoName: string, commit: ICreateCommitParams) {
        //     return supertest
        //         .post(`/repos/${repoName}/git/commits`)
        //         .set("Accept", "application/json")
        //         .set("Content-Type", "application/json")
        //         .send(commit)
        //         .expect(201);
        // }
        // const testCommit: ICreateCommitParams = {
        //     author: {
        //         date: "Thu Jul 13 2017 20:17:40 GMT-0700 (PDT)",
        //         email: "kurtb@microsoft.com",
        //         name: "Kurt Berglund",
        //     },
        //     message: "first commit",
        //     parents: [],
        //     tree: "bf4db183cbd07f48546a5dde098b4510745d79a1",
        // };

        // Update (force) the ref to the new commit
        // function createRef(supertest: request.SuperTest<request.Test>, repoName: string, ref: ICreateRefParams) {
        //     return supertest
        //         .post(`/repos/${repoName}/git/refs`)
        //         .set("Accept", "application/json")
        //         .set("Content-Type", "application/json")
        //         .send(ref)
        //         .expect(201);
        // }
        // const testRef: ICreateRefParams = {
        //     ref: "refs/heads/master",
        //     sha: "cf0b592907d683143b28edd64d274ca70f68998e",
        // };
        // Write all the objects - create a commit referencing them - update the branch header
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
