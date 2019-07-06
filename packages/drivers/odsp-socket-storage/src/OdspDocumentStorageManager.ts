/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { buildHierarchy } from "@prague/utils";
import { IDocumentStorageGetVersionsResponse, IDocumentStorageManager, ISnapshotRequest, ISnapshotResponse, ISnapshotTree, SnapshotTreeValue, SnapshotType } from "./contracts";
import { IFetchWrapper } from "./fetchWrapper";
import { getQueryString } from "./getQueryString";
import { TokenProvider } from "./tokenProvider";
import { getWithRetryForTokenRefresh } from "./utils";

/**
 * This class has the following functionality
 * 1. If a snapshotUrl is not provided or if latestSha is an empty string, all functions are disabled and an empty list is returned from getVersions
 * 2. A latestSha, trees and blobs can be supplied which will then be used as cache for getVersions, getTree and getBlob
 */
export class OdspDocumentStorageManager implements IDocumentStorageManager {
    private static readonly errorMessage = "Method not supported because no snapshotUrl was provided";

    private readonly blobCache: Map<string, resources.IBlob> = new Map();
    private readonly treesCache: Map<string, resources.ITree> = new Map();

    private readonly attributesBlobHandles: Set<string> = new Set();

    private readonly queryString: string;

    constructor(
        queryParams: { [key: string]: string },
        private readonly documentId: string,
        private readonly snapshotUrl: string | undefined,
        private readonly latestSha: string | undefined,
        trees: resources.ITree[] | undefined,
        blobs: resources.IBlob[] | undefined,
        private readonly fetchWrapper: IFetchWrapper,
        private readonly getTokenProvider: (refresh: boolean) => Promise<api.ITokenProvider>,
    ) {
        if (trees) {
            this.initTreesCache(trees);
        }

        if (blobs) {
            this.initBlobsCache(blobs);
        }

        this.queryString = getQueryString(queryParams);
    }

    public createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        this.checkSnapshotUrl();

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            return Promise.reject(new Error("StandardDocumentStorageManager.createBlob() not implemented"));
        });
    }

    public async getBlob(blobid: string): Promise<resources.IBlob> {
        let blob = this.blobCache.get(blobid);
        if (!blob) {
            this.checkSnapshotUrl();

            blob = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
                const tokenProvider = await this.getTokenProvider(refresh);

                const { url, headers } = (tokenProvider as TokenProvider).getUrlAndHeadersWithAuth(`${this.snapshotUrl}/blobs/${blobid}${this.queryString}`);

                return this.fetchWrapper.get<resources.IBlob>(url, blobid, headers);
            });
        }

        if (blob && this.attributesBlobHandles.has(blobid)) {
            // ODSP document ids are random guids (different per session)
            // fix the branch name in attributes
            // this prevents issues when generating summaries
            const documentAttributes: api.IDocumentAttributes = JSON.parse(Buffer.from(blob.content, "base64").toString("utf-8"));
            documentAttributes.branch = this.documentId;

            blob.content = Buffer.from(JSON.stringify(documentAttributes)).toString("base64");
        }

        return blob;
    }

    public getContent(version: api.IVersion, path: string): Promise<resources.IBlob> {
        this.checkSnapshotUrl();

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            const tokenProvider = await this.getTokenProvider(refresh);
            return this.fetchWrapper.get<resources.IBlob>(`${this.snapshotUrl}/contents${getQueryString({ ref: version.id, path })}`, version.id, {
                Authorization: `Bearer ${(tokenProvider as TokenProvider).storageToken}`,
            });
        });
    }

    public getRawUrl(blobid: string): string {
        this.checkSnapshotUrl();

        return `${this.snapshotUrl}/blobs/${blobid}`;
    }

    public async getTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        if (!this.snapshotUrl) {
            return null;
        }

        let id = version && version.id ? version.id : "latest";

        if (id === "latest" && this.latestSha) {
            id = this.latestSha;
        }

        const tree = await this.readTree(id);
        if (!tree) {
            return null;
        }

        const hierarchicalTree = buildHierarchy(tree);

        // decode commit paths
        const commits = {};

        const keys = Object.keys(hierarchicalTree.commits);
        for (const key of keys) {
            commits[decodeURIComponent(key)] = hierarchicalTree.commits[key];
        }

        if (commits && commits[".protocol"] && commits[".app"]) {
            // the latest snapshot is a summary
            return this.readSummaryTree(tree.sha, commits[".protocol"] as string, commits[".app"] as string);
        }

        hierarchicalTree.commits = commits;

        return hierarchicalTree;
    }

    public async getVersions(blobid: string | null, count: number): Promise<api.IVersion[]> {
        if (blobid && blobid !== this.documentId) {
            // each commit calls getVersions but odsp doesn't have a history for each version
            // return the blobid as is
            return [
                {
                    id: blobid,
                    treeId: undefined!,
                },
            ];
        }

        if (!this.snapshotUrl || this.latestSha === "") {
            return [];
        }

        const treeSha = blobid === this.documentId && this.latestSha ? this.latestSha : blobid;
        const cachedTree = treeSha ? this.treesCache.get(treeSha) : undefined;
        if (cachedTree && count === 1) {
            return [{ id: cachedTree.sha, treeId: undefined! }];
        }

        return getWithRetryForTokenRefresh(async (refresh) => {
            const tokenProvider = await this.getTokenProvider(refresh);
            // fetch the latest snapshot versions for the document
            const versionsResponse = await this.fetchWrapper
                .get<IDocumentStorageGetVersionsResponse>(`${this.snapshotUrl}/versions?count=${count}`, this.documentId, {
                    Authorization: `Bearer ${(tokenProvider as TokenProvider).storageToken}`,
                })
                .catch<IDocumentStorageGetVersionsResponse>((error) => (error === 400 || error === 404) ? error : Promise.reject(error));
            if (versionsResponse) {
                if (Array.isArray(versionsResponse.value)) {
                    return versionsResponse.value.map((version) => {
                        return {
                            id: version.sha,
                            treeId: undefined!,
                        };
                    });
                }

                if ((versionsResponse as any).error) {
                    // If the URL have error, the server might not response with an error code, but an error object
                    const e = new Error("getVersions fetch error");
                    (e as any).data = versionsResponse;
                    return Promise.reject(JSON.stringify(versionsResponse));
                }
            }

            return [];
        });
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        this.checkSnapshotUrl();

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            // TODO: Implement, Issue #2269 [https://github.com/microsoft/Prague/issues/2269]
            return Promise.reject("Not implemented");
        });
    }

    public async uploadSummary(tree: api.ISummaryTree): Promise<api.ISummaryHandle> {
        console.log("uploadSummary", tree, JSON.stringify(tree, undefined, 4));

        this.checkSnapshotUrl();

        const result = await this.writeSummaryTree(tree);
        if (!result || !result.sha) {
            throw new Error(`Failed to write summary tree`);
        }

        return {
            handle: result.sha,
            handleType: api.SummaryType.Tree,
            type: api.SummaryType.Handle,
        };
    }

    public downloadSummary(commit: api.ISummaryHandle): Promise<api.ISummaryTree> {
        console.log("downloadSummary", commit);

        return Promise.reject("Not implemented yet");
    }

    private initTreesCache(trees: resources.ITree[]) {
        trees.forEach((tree) => {
            // A WHOLE BUNCH OF FIXING SPO
            if (!tree.sha) {
                throw new Error("Tree must have a sha");
            }

            if (!tree.tree) {
                tree.tree = (tree as any).entries;
            }

            this.treesCache.set(tree.sha, tree);
        });
    }

    private initBlobsCache(blobs: resources.IBlob[]) {
        blobs.forEach((blob) => this.blobCache.set(blob.sha, blob));
    }

    private checkSnapshotUrl() {
        if (!this.snapshotUrl) {
            throw new Error(OdspDocumentStorageManager.errorMessage);
        }
    }

    private async readTree(id: string): Promise<resources.ITree | null> {
        let tree = this.treesCache.get(id);
        if (!tree) {
            tree = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
                const tokenProvider = await this.getTokenProvider(refresh);

                const { url, headers } = (tokenProvider as TokenProvider).getUrlAndHeadersWithAuth(`${this.snapshotUrl}/trees/${id}${this.queryString}`);

                const response = await this.fetchWrapper.get<resources.ITree>(url, id, headers);

                // FIX SPO
                return response && response.tree ? response : undefined;
            });
        }

        if (!tree || !tree.tree) {
            return null;
        }

        return tree;
    }

    /**
     * Reads a summary tree
     * @param snapshotTreeId - Id of the snapshot
     * @param protocolTreeId - Id of the protocol tree
     * @param appTreeId - Id of the app tree
     */
    private async readSummaryTree(snapshotTreeId: string, protocolTreeId: string, appTreeId: string): Promise<api.ISnapshotTree> {
        // load the app and protocol trees and return them
        const trees = await Promise.all([
            this.readTree(protocolTreeId),
            this.readTree(appTreeId),
        ]);

        // merge trees
        const protocolTree = trees[0];
        if (!protocolTree) {
            throw new Error("Invalid protocol tree");
        }

        const appTree = trees[1];
        if (!appTree) {
            throw new Error("Invalid app tree");
        }

        const hierarchicalProtocolTree = buildHierarchy(protocolTree);
        const hierarchicalAppTree = buildHierarchy(appTree);

        if (hierarchicalProtocolTree.blobs) {
            const attributesBlob = hierarchicalProtocolTree.blobs.attributes;
            if (attributesBlob) {
                this.attributesBlobHandles.add(attributesBlob);
            }
        }

        const summarySnapshotTree: api.ISnapshotTree = {
            blobs: {
                ...hierarchicalAppTree.blobs,
            },
            commits: {
                ...hierarchicalAppTree.commits,
            },
            id: snapshotTreeId,
            trees: {
                ".protocol": hierarchicalProtocolTree,
                ...hierarchicalAppTree.trees,
            },
        };

        return summarySnapshotTree;
    }

    private async writeSummaryTree(tree: api.SummaryTree, depth: number = 0): Promise<ISnapshotResponse> {
        if (tree.type === api.SummaryType.Handle) {
            return {
                sha: tree.handle,
            };
        }

        const snapshotTree = this.convertSummaryToSnapshotTree(tree);

        const snapshot: ISnapshotRequest = {
            entries: snapshotTree.entries!,
            message: "app",
            sequenceNumber: depth === 0 ? 1 : 2,
            sha: snapshotTree.id!,
            type: SnapshotType.Channel,
        };

        console.log("writeSummaryTree", depth, snapshotTree, snapshot, JSON.stringify(snapshot, undefined, 4));

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            const tokenProvider = await this.getTokenProvider(refresh);

            const { url, headers } = (tokenProvider as TokenProvider).getUrlAndHeadersWithAuth(`${this.snapshotUrl}/snapshot${this.queryString}`);
            headers["Content-Type"] = "application/json";

            const postBody = JSON.stringify(snapshot);

            return this.fetchWrapper.post<ISnapshotResponse>(url, postBody, headers);
        });
    }

    /**
     * Converts a summary tree to ODSP tree
     */
    private convertSummaryToSnapshotTree(tree: api.ISummaryTree, depth: number = 0): ISnapshotTree {
        const snapshotTree: ISnapshotTree = {
            entries: [],
        }!;

        const keys = Object.keys(tree.tree);
        for (const key of keys) {
            const summaryObject = tree.tree[key];

            let value: SnapshotTreeValue;

            switch (summaryObject.type) {
                case api.SummaryType.Tree:
                    value = this.convertSummaryToSnapshotTree(summaryObject, depth + 1);
                    break;

                case api.SummaryType.Blob:
                    const content = typeof summaryObject.content === "string" ? summaryObject.content : summaryObject.content.toString("base64");
                    const encoding = typeof summaryObject.content === "string" ? "utf-8" : "base64";

                    value = {
                        content,
                        encoding,
                    };

                    break;

                case api.SummaryType.Handle:
                    if (summaryObject.handleType === api.SummaryType.Commit) {
                        value = {
                            content: summaryObject.handle,
                        };

                    } else {
                        value = {
                            id: summaryObject.handle,
                        };
                    }

                    break;

                default:
                    throw new Error(`Unknown tree type ${summaryObject.type}`);
            }

            snapshotTree.entries!.push({
                mode: "100644",
                path: encodeURIComponent(key),
                type: this.getServerType(summaryObject),
                value,
            });
        }

        return snapshotTree;
    }

    private getServerType(value: api.SummaryObject): string {
        const type = value.type === api.SummaryType.Handle ? value.handleType : value.type;
        switch (type) {
            case api.SummaryType.Blob:
                return "blob";

            case api.SummaryType.Commit:
                return "commit";

            case api.SummaryType.Tree:
                return "tree";

            default:
                throw new Error();
        }
    }
}
