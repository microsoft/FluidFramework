/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@microsoft/fluid-gitresources";
import * as querystring from "querystring";
import * as request from "request";
import * as winston from "winston";
import { ICache, IStorage } from "./definitions";

// We include the historian version in the user-agent string
// tslint:disable-next-line:no-var-requires
const packageDetails = require("../../package.json");
const userAgent = `Historian/${packageDetails.version}`;

export interface IDocument {
    existing: boolean;
    docPrivateKey: string;
    docPublicKey: string;
}

function endsWith(value: string, endings: string[]): boolean {
    for (const ending of endings) {
        if (value.endsWith(ending)) {
            return true;
        }
    }

    return false;
}

export class RestGitService {
    private authHeader: string;

    constructor(private storage: IStorage, private cache: ICache) {
        if (storage.credentials) {
            const token = new Buffer(`${storage.credentials.user}:${storage.credentials.password}`);
            this.authHeader = `Basic ${token.toString("base64")}`;
        }
    }

    public getBlob(sha: string, useCache: boolean): Promise<git.IBlob> {
        return this.resolve(
            sha,
            () => this.get<git.IBlob>(`/repos/${this.getRepoPath()}/git/blobs/${encodeURIComponent(sha)}`),
            useCache);
    }

    public async createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {

        const createResults = await this.post<git.ICreateBlobResponse>(
            `/repos/${this.getRepoPath()}/git/blobs`,
            blob);

        // Fetch the full blob so we can have it in cache
        this.getBlob(createResults.sha, true).catch((error) => {
            winston.error(`Error fetching blob ${createResults.sha}`);
        });

        return createResults;
    }

    public getContent(path: string, ref: string): Promise<any> {
        const query = querystring.stringify({ ref });
        return this.get(`/repos/${this.getRepoPath()}/contents/${path}?${query}`);
    }

    public getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        const query = querystring.stringify({
            count,
            sha,
        });
        return this.get(`/repos/${this.getRepoPath()}/commits?${query}`);
    }

    public async getCommit(sha: string, useCache: boolean): Promise<git.ICommit> {
        return this.resolve(
            sha,
            () => this.get<git.ICommit>(
                `/repos/${this.getRepoPath()}/git/commits/${encodeURIComponent(sha)}`),
            useCache);
    }

    public async createCommit(commitParams: git.ICreateCommitParams): Promise<git.ICommit> {

        const commit = await this.post<git.ICommit>(
            `/repos/${this.getRepoPath()}/git/commits`,
            commitParams);

        this.setCache(commit.sha, commit);

        // Also fetch the tree for the commit to have it in cache
        this.getTree(commit.tree.sha, true, true).catch((error) => {
            winston.error(`Error fetching commit tree ${commit.tree.sha}`);
        });
        // ... as well as pull in the header for it
        this.getHeader(commit.sha, true).catch((error) => {
            winston.error(`Error fetching header ${commit.sha}`);
        });

        return commit;
    }

    public getRefs(): Promise<git.IRef[]> {
        return this.get(`/repos/${this.getRepoPath()}/git/refs`);
    }

    public getRef(ref: string): Promise<git.IRef> {
        return this.get(`/repos/${this.getRepoPath()}/git/refs/${ref}`);
    }

    public createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        return this.post(`/repos/${this.getRepoPath()}/git/refs`, params);
    }

    public updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.patch(`/repos/${this.getRepoPath()}/git/refs/${ref}`, params);
    }

    public deleteRef(ref: string): Promise<void> {
        return this.delete(`/repos/${this.getRepoPath()}/git/refs/${ref}`);
    }

    public createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.post(`/repos/${this.getRepoPath()}/git/tags`, tag);
    }

    public getTag(tag: string): Promise<git.ITag> {
        return this.get(`/repos/${this.getRepoPath()}/git/tags/${tag}`);
    }

    public async createTree(treeParams: git.ICreateTreeParams): Promise<git.ITree> {
        const tree = await this.post<git.ITree>(`/repos/${this.getRepoPath()}/git/trees`, treeParams);

        this.setCache(tree.sha, tree);

        return tree;
    }

    public getTree(sha: string, recursive: boolean, useCache: boolean): Promise<git.ITree> {

        const key = recursive ? `${sha}:recursive` : sha;
        return this.resolve(
            key,
            () => {
                const query = querystring.stringify({ recursive: recursive ? 1 : 0 });
                return this.get<git.ITree>(
                    `/repos/${this.getRepoPath()}/git/trees/${encodeURIComponent(sha)}?${query}`);
            },
            useCache);
    }

    public async getHeader(sha: string, useCache: boolean): Promise<git.IHeader> {
        const version = await this.getCommit(sha, useCache);

        const key = `${version.sha}:header`;
        return this.resolve(
            key,
            async () => {
                const tree = await this.getTree(version.tree.sha, true, useCache);
                const blobs = await this.getHeaderBlobs(tree, useCache);

                return {
                    blobs,
                    tree,
                };
            },
            useCache);
    }

    public async getFullTree(sha: string, useCache: boolean): Promise<any> {
        const version = await this.getCommit(sha, useCache);

        const key = `${version.sha}:tree`;
        return this.resolve(
            key,
            async () => {
                const blobs = new Map<string, git.IBlob>();
                const trees = new Map<string, git.ITree>();
                const commits = new Map<string, git.ICommit>();

                const baseTree = await this.getTree(version.tree.sha, true, useCache);

                commits.set(version.sha, version);
                trees.set(baseTree.sha, baseTree);

                const submoduleCommits = new Array<string>();
                const quorumValuesSha = new Array<string>();
                let quorumValues: string;

                baseTree.tree.forEach((entry) => {
                    if (entry.path.indexOf("quorum") !== -1) {
                        quorumValuesSha.push(entry.sha);
                    }

                    if (entry.path === "quorumValues") {
                        quorumValues = entry.sha;
                    }

                    if (entry.type === "commit") {
                        submoduleCommits.push(entry.sha);
                    }
                });

                const submodulesP = Promise.all(submoduleCommits.map(async (submoduleCommitSha) => {
                    const submoduleCommit = await this.getCommit(submoduleCommitSha, useCache);
                    const submoduleTree = await this.getTree(submoduleCommit.tree.sha, true, useCache);
                    trees.set(submoduleCommit.tree.sha, submoduleTree);
                    commits.set(submoduleCommit.sha, submoduleCommit);
                }));

                const blobsP = Promise.all(quorumValuesSha.map(async (quorumSha) => {
                    const blob = await this.getBlob(quorumSha, useCache);
                    blobs.set(blob.sha, blob);
                }));

                await Promise.all([submodulesP, blobsP]);

                return {
                    blobs: Array.from(blobs.values()),
                    commits: Array.from(commits.values()),
                    quorumValues,
                    trees: Array.from(trees.values()),
                };
            },
            useCache);
    }

    /**
     * Helper method to translate from an owner repo pair to the URL component for it. In the future we will require
     * the owner parameter. But for back compat we allow it to be optional.
     */
    private getRepoPath(): string {
        return `${encodeURIComponent(this.storage.owner)}/${encodeURIComponent(this.storage.repository)}`;
    }

    private getHeaderBlobs(tree: git.ITree, useCache: boolean): Promise<git.IBlob[]> {
        // List of blobs that will be included within the cached list of headers
        const includeBlobs = [".attributes", ".messages", "header"];

        const blobsP: Array<Promise<git.IBlob>> = [];
        for (const entry of tree.tree) {
            if (entry.type === "blob" && endsWith(entry.path, includeBlobs)) {
                const blobP = this.getBlob(entry.sha, useCache);
                blobsP.push(blobP);
            }
        }

        return Promise.all(blobsP);
    }

    private get<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            headers: {
                "User-Agent": userAgent,
            },
            json: true,
            method: "GET",
            url: `${this.storage.url}${url}`,
        };
        this.authorize(options);

        return this.request(options, 200);
    }

    private post<T>(url: string, requestBody: any): Promise<T> {
        const options: request.OptionsWithUrl = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": userAgent,
            },
            json: true,
            method: "POST",
            url: `${this.storage.url}${url}`,
        };
        this.authorize(options);

        return this.request(options, 201);
    }

    private delete<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            headers: {
                "User-Agent": userAgent,
            },
            method: "DELETE",
            url: `${this.storage.url}${url}`,
        };
        this.authorize(options);

        return this.request(options, 204);
    }

    private patch<T>(url: string, requestBody: any): Promise<T> {
        const options: request.OptionsWithUrl = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": userAgent,
            },
            json: true,
            method: "PATCH",
            url: `${this.storage.url}${url}`,
        };
        this.authorize(options);

        return this.request(options, 200);
    }

    /**
     * Updates the provided options with authorization information
     */
    private authorize(options: request.OptionsWithUrl) {
        if (this.authHeader) {
            options.headers.Authorization = this.authHeader;
        }
    }

    private request<T>(options: request.OptionsWithUrl, statusCode: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            request(
                options,
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== statusCode) {
                        winston.info(response.body);
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    /**
     * Caches the given key/value pair. Will log any errors with the cache.
     */
    private setCache<T>(key: string, value: T) {
        // Attempt to cache to Redis - log any errors but don't fail
        this.cache.set(key, value).catch((error) => {
            winston.error(`Error caching ${key} to redis`, error);
        });
    }

    private async resolve<T>(key: string, fetch: () => Promise<T>, useCache: boolean): Promise<T> {
        if (useCache) {
            // Attempt to grab the value from the cache. Log any errors but don't fail the request
            const cachedValue = await this.cache.get<T>(key).catch((error) => {
                winston.error(`Error fetching ${key} from cache`, error);
                return null;
            });

            if (cachedValue) {
                winston.info(`Resolving ${key} from cache`);
                return cachedValue;
            }

            // Value is not cached - fetch it with the provided function and then cache the value
            winston.info(`Fetching ${key}`);
            const value = await fetch();
            this.setCache(key, value);

            return value;
        } else {
            return fetch();
        }
    }
}
