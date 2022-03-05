/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import type { AxiosRequestHeaders } from "axios";
import * as querystring from "querystring";
import * as git from "@fluidframework/gitresources";
import {
    IGetRefParamsExternal,
    ICreateRefParamsExternal,
    IPatchRefParamsExternal,
    IWholeSummaryPayload,
    IWriteSummaryResponse,
    BasicRestWrapper,
    RestWrapper,
    IWholeFlatSummary,
    IWholeSummaryPayloadType,
} from "@fluidframework/server-services-client";
import { ITenantStorage, runWithRetry } from "@fluidframework/server-services-core";
import * as uuid from "uuid";
import * as winston from "winston";
import { getCorrelationId } from "@fluidframework/server-services-utils";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { getRequestErrorTranslator } from "../utils";
import { ICache } from "./definitions";

// We include the historian version in the user-agent string
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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
    private readonly restWrapper: RestWrapper;
    private readonly lumberProperties: Record<BaseTelemetryProperties, any>;

    constructor(
        private readonly storage: ITenantStorage,
        private readonly writeToExternalStorage: boolean,
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly cache?: ICache,
        private readonly asyncLocalStorage?: AsyncLocalStorage<string>,
        private readonly storageName? : string) {
        let defaultHeaders: AxiosRequestHeaders;
        if (storageName !== undefined) {
            defaultHeaders = {
                "User-Agent": userAgent,
                "Storage-Routing-Id": this.getStorageRoutingHeaderValue(),
                "Storage-Name": this.storageName,
            };
        } else {
            defaultHeaders = {
                "User-Agent": userAgent,
                "Storage-Routing-Id": this.getStorageRoutingHeaderValue(),
            };
        }
        if (storage.credentials) {
            const token = Buffer.from(`${storage.credentials.user}:${storage.credentials.password}`);
            defaultHeaders.Authorization = `Basic ${token.toString("base64")}`;
        }
        this.lumberProperties = {
            [BaseTelemetryProperties.tenantId]: this.tenantId,
            [BaseTelemetryProperties.documentId]: this.documentId,
        };

        winston.info(
            `Created RestGitService: ${JSON.stringify({
                "BaseUrl": storage.url,
                "Storage-Routing-Id": this.getStorageRoutingHeaderValue(),
                "Storage-Name": this.storageName,
            })}`,
        );

        Lumberjack.info(
            `Created RestGitService: ${JSON.stringify({
                "BaseUrl": storage.url,
                "Storage-Routing-Id": this.getStorageRoutingHeaderValue(),
                "Storage-Name": this.storageName,
            })}`,
            this.lumberProperties,
        );

        this.restWrapper = new BasicRestWrapper(
            storage.url,
            undefined,
            undefined,
            undefined,
            defaultHeaders,
            undefined,
            undefined,
            undefined,
            () => getCorrelationId(this.asyncLocalStorage) || uuid.v4(),
        );
    }

    public async getBlob(sha: string, useCache: boolean): Promise<git.IBlob> {
        return this.resolve(
            sha,
            async () => this.get<git.IBlob>(`/repos/${this.getRepoPath()}/git/blobs/${encodeURIComponent(sha)}`),
            useCache);
    }

    public async createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        const createResults = await this.post<git.ICreateBlobResponse>(
            `/repos/${this.getRepoPath()}/git/blobs`,
            blob);

        // Fetch the full blob so we can have it in cache
        this.getBlob(createResults.sha, true).catch((error) => {
            winston.error(`Error fetching blob ${createResults.sha}`);
            Lumberjack.error(`Error fetching blob: ${createResults.sha}`, this.lumberProperties);
        });

        return createResults;
    }

    public async getContent(path: string, ref: string): Promise<any> {
        const query = querystring.stringify({ ref });
        return this.get(`/repos/${this.getRepoPath()}/contents/${encodeURIComponent(path)}?${query}`);
    }

    public async getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        let config;
        if (this.writeToExternalStorage) {
            const getRefParams: IGetRefParamsExternal = {
                config: { enabled: true },
            };
            config = encodeURIComponent(JSON.stringify(getRefParams));
        }
        const query = querystring.stringify({
            count,
            sha,
            config,
        });
        return this.get(`/repos/${this.getRepoPath()}/commits?${query}`);
    }

    public async getCommit(sha: string, useCache: boolean): Promise<git.ICommit> {
        return this.resolve(
            sha,
            async () => this.get<git.ICommit>(
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
            Lumberjack.error(`Error fetching commit tree: ${commit.tree.sha}`, this.lumberProperties);
        });
        // ... as well as pull in the header for it
        this.getHeader(commit.sha, true).catch((error) => {
            winston.error(`Error fetching header ${commit.sha}`);
            Lumberjack.error(`Error fetching header: ${commit.sha}`, this.lumberProperties);
        });

        return commit;
    }

    public async getRefs(): Promise<git.IRef[]> {
        return this.get(`/repos/${this.getRepoPath()}/git/refs`);
    }

    public async getRef(ref: string): Promise<git.IRef> {
        if (this.writeToExternalStorage) {
            const getRefParams: IGetRefParamsExternal = {
                config: { enabled: true },
            };
            const params = encodeURIComponent(JSON.stringify(getRefParams));
            return this.get(`/repos/${this.getRepoPath()}/git/refs/${encodeURIComponent(ref)}?config=${params}`);
        }
        return this.get(`/repos/${this.getRepoPath()}/git/refs/${encodeURIComponent(ref)}`);
    }

    public async createRef(params: ICreateRefParamsExternal): Promise<git.IRef> {
        // We modify this param to prevent writes to external storage if tenant is not linked
        if (!this.writeToExternalStorage) {
            params.config.enabled = false;
        }
        return this.post(`/repos/${this.getRepoPath()}/git/refs`, params);
    }

    public async createSummary(summaryParams: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
        const summaryResponse = await this.post<IWholeFlatSummary | IWriteSummaryResponse>(
            `/repos/${this.getRepoPath()}/git/summaries`,
             summaryParams);
        if (summaryParams.type === "container" && (summaryResponse as IWholeFlatSummary).trees !== undefined) {
            // Cache the written summary for future retrieval. If this fails, next summary retrieval
            // will receive an older version, but that is OK. Client will catch up with ops.
            this.setCache<IWholeFlatSummary>(
                this.getSummaryCacheKey(summaryParams.type),
                (summaryResponse as IWholeFlatSummary));
        } else {
            // Delete previous summary from cache so next summary retrieval is forced to go to the service.
            this.deleteFromCache(this.getSummaryCacheKey(summaryParams.type));
        }
        return { id: summaryResponse.id };
    }

    public async deleteSummary(softDelete: boolean): Promise<boolean> {
        const headers = { "Soft-Delete": softDelete };

        // First, delete any cached summary (including both types, "channel" and "container")
        // from the Redis cache
        this.deleteFromCache(this.getSummaryCacheKey("channel"));
        this.deleteFromCache(this.getSummaryCacheKey("container"));

        // Finally, delete from storage.
        return this.delete<boolean>(`/repos/${this.getRepoPath()}/git/summaries`, headers);
    }

    public async getSummary(sha: string, useCache: boolean): Promise<IWholeFlatSummary> {
        return this.resolve(
            // Currently, only "container" type summaries are retrieved from storage.
            // In the future, we might want to also retrieve "channels". When that happens,
            // our APIs will change so we specify what type we want to retrieve during
            // the request.
            this.getSummaryCacheKey("container"),
            async () => this.get<IWholeFlatSummary>(
                `/repos/${this.getRepoPath()}/git/summaries/${encodeURIComponent(sha)}`),
            useCache);
    }

    public async updateRef(ref: string, params: IPatchRefParamsExternal): Promise<git.IRef> {
        // We modify this param to prevent writes to external storage if tenant is not linked
        if (!this.writeToExternalStorage) {
            params.config.enabled = false;
        }
        return this.patch(`/repos/${this.getRepoPath()}/git/refs/${ref}`, params);
    }

    public async deleteRef(ref: string): Promise<void> {
        return this.delete(`/repos/${this.getRepoPath()}/git/refs/${ref}`);
    }

    public async createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.post(`/repos/${this.getRepoPath()}/git/tags`, tag);
    }

    public async getTag(tag: string): Promise<git.ITag> {
        return this.get(`/repos/${this.getRepoPath()}/git/tags/${tag}`);
    }

    public async createTree(treeParams: git.ICreateTreeParams): Promise<git.ITree> {
        const tree = await this.post<git.ITree>(`/repos/${this.getRepoPath()}/git/trees`, treeParams);

        this.setCache(tree.sha, tree);

        return tree;
    }

    public async getTree(sha: string, recursive: boolean, useCache: boolean): Promise<git.ITree> {
        const key = recursive ? `${sha}:recursive` : sha;
        return this.resolve(
            key,
            async () => {
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
                    if (entry.path.includes("quorum")) {
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

    private getStorageRoutingHeaderValue()
    {
        return `${this.tenantId}:${this.documentId}`;
    }

    /**
     * Helper method to translate from an owner repo pair to the URL component for it. In the future we will require
     * the owner parameter. But for back compat we allow it to be optional.
     */
    private getRepoPath(): string {
        return `${encodeURIComponent(this.storage.owner)}/${encodeURIComponent(this.storage.repository)}`;
    }

    private async getHeaderBlobs(tree: git.ITree, useCache: boolean): Promise<git.IBlob[]> {
        // List of blobs that will be included within the cached list of headers
        const includeBlobs = [".attributes", ".messages", "header"];

        const blobsP: Promise<git.IBlob>[] = [];
        for (const entry of tree.tree) {
            if (entry.type === "blob" && endsWith(entry.path, includeBlobs)) {
                const blobP = this.getBlob(entry.sha, useCache);
                blobsP.push(blobP);
            }
        }

        return Promise.all(blobsP);
    }

    private async get<T>(url: string): Promise<T> {
        return this.restWrapper.get<T>(url)
            .catch(getRequestErrorTranslator(url, "GET", this.lumberProperties));
    }

    private async post<T>(url: string, requestBody: any): Promise<T> {
        return this.restWrapper.post<T>(url, requestBody, undefined, {
            "Content-Type": "application/json",
        }).catch(getRequestErrorTranslator(url, "POST", this.lumberProperties));
    }

    private async delete<T>(url: string, headers?: any): Promise<T> {
        return this.restWrapper.delete<T>(url, undefined, headers)
            .catch(getRequestErrorTranslator(url, "DELETE", this.lumberProperties));
    }

    private async patch<T>(url: string, requestBody: any): Promise<T> {
        return this.restWrapper.patch<T>(url, requestBody, undefined, {
            "Content-Type": "application/json",
        }).catch(getRequestErrorTranslator(url, "PATCH", this.lumberProperties));
    }

    /**
     * Caches the given key/value pair. Will log any errors with the cache.
     */
    private setCache<T>(key: string, value: T): void {
        if (this.cache) {
            // Attempt to cache to Redis - log any errors but don't fail
            runWithRetry(
                async () => this.cache.set(key, value),
                "RestGitService.setCache",
                3,
                1000,
                winston,
            ).catch((error) => {
                winston.error(`Error caching ${key} to redis`, error);
                Lumberjack.error(`Error caching ${key} to redis`, this.lumberProperties, error);
            });
        }
    }

    /**
     * Deletes the given key from the cache. Will log any errors with the cache.
     */
     private deleteFromCache(key: string): void {
        if (this.cache) {
            // Attempt to delete the key from Redis - log any errors but don't fail
            this.cache.delete(key).catch((error) => {
                winston.error(`Error deleting key ${key} from Redis cache`, error);
                Lumberjack.error(`Error deleting key ${key} from Redis cache`, this.lumberProperties, error);
            });
        }
    }

    private async resolve<T>(key: string, fetch: () => Promise<T>, useCache: boolean): Promise<T> {
        if (this.cache && useCache) {
            // Attempt to grab the value from the cache. Log any errors but don't fail the request
            const cachedValue: T | undefined = await this.cache.get<T>(key).catch((error) => {
                winston.error(`Error fetching ${key} from cache`, error);
                Lumberjack.error(`Error fetching ${key} from cache`, this.lumberProperties, error);
                return undefined;
            });

            if (cachedValue) {
                winston.info(`Resolving ${key} from cache`);
                Lumberjack.info(`Resolving ${key} from cache`, this.lumberProperties);
                return cachedValue;
            }

            // Value is not cached - fetch it with the provided function and then cache the value
            winston.info(`Fetching ${key}`);
            Lumberjack.info(`Fetching ${key}`, this.lumberProperties);
            const value = await fetch();
            this.setCache(key, value);

            return value;
        } else {
            return fetch();
        }
    }

    private getSummaryCacheKey(type: IWholeSummaryPayloadType): string {
        return `${this.tenantId}:${this.documentId}:summary:${type}`;
    }
}
