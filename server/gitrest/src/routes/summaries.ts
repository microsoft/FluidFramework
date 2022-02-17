/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICreateCommitParams,
    ICreateTreeEntry,
} from "@fluidframework/gitresources";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import { SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IWholeFlatSummary,
    IWholeFlatSummaryBlob,
    IWholeFlatSummaryTreeEntry,
    IWholeSummaryBlob,
    IWholeSummaryPayload,
    IWholeSummaryTree,
    IWholeSummaryTreeHandleEntry,
    IWholeSummaryTreeValueEntry,
    IWriteSummaryResponse,
    NetworkError,
    WholeSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { Router } from "express";
import { Provider } from "nconf";
import { getExternalWriterParams, IRepositoryManager, IRepositoryManagerFactory } from "../utils";
import { handleResponse } from "./utils";

interface ISummaryVersion {
    id: string;
    treeId: string;
}

export class WholeSummaryReadGitManager {
    constructor(
        private readonly documentId: string,
        private readonly repoManager: IRepositoryManager,
        private readonly externalStorageEnabled = true,
    ) {}

    public async readSummary(sha: string): Promise<IWholeFlatSummary> {
        let version: ISummaryVersion;
        if (sha === "latest") {
            version = await this.getLatestVersion();
        } else {
            const commit = await this.repoManager.getCommit(sha);
            version = { id: commit.sha, treeId: commit.tree.sha };
        }
        const rawTree = await this.repoManager.getTree(version.treeId, true /* recursive */);
        const wholeFlatSummaryTreeEntries: IWholeFlatSummaryTreeEntry[] = [];
        const wholeFlatSummaryBlobPs: Promise<IWholeFlatSummaryBlob>[] = [];
        rawTree.tree.forEach((treeEntry) => {
            if (treeEntry.type === "blob") {
                wholeFlatSummaryTreeEntries.push({
                    type: "blob",
                    id: treeEntry.sha,
                    path: treeEntry.path,
                });
                wholeFlatSummaryBlobPs.push(
                    this.getBlob(
                        treeEntry.sha,
                    ),
                );
            } else {
                wholeFlatSummaryTreeEntries.push({
                    type: "tree",
                    path: treeEntry.path,
                });
            }
        });
        const wholeFlatSummaryBlobs = await Promise.all(wholeFlatSummaryBlobPs);
        return {
            id: version.id,
            trees: [
                {
                    id: rawTree.sha,
                    entries: wholeFlatSummaryTreeEntries,
                    // We don't store sequence numbers in git
                    sequenceNumber: undefined,
                },
            ],
            blobs: wholeFlatSummaryBlobs,
        };
    }

    private async getBlob(sha: string): Promise<IWholeFlatSummaryBlob> {
        const blob = await this.repoManager.getBlob(
            sha,
        );
        return {
            content: blob.content,
            encoding: blob.encoding === "base64" ? "base64" : "utf-8",
            id: blob.sha,
            size: blob.size,
        };
    }

    private async getLatestVersion(): Promise<ISummaryVersion> {
        const commitDetails = await this.repoManager.getCommits(
            this.documentId,
            1,
            { enabled: this.externalStorageEnabled },
        );
        return {
            id: commitDetails[0].sha,
            treeId: commitDetails[0].commit.tree.sha,
        };
    }
}

function getSummaryObjectFromWholeSummaryTreeEntry(entry: WholeSummaryTreeEntry): SummaryObject {
    if ((entry as IWholeSummaryTreeHandleEntry).id !== undefined) {
        return {
            type: SummaryType.Handle,
            handleType: entry.type === "tree" ? SummaryType.Tree : SummaryType.Blob,
            handle: (entry as IWholeSummaryTreeHandleEntry).id,
        };
    }
    if (entry.type === "blob") {
        return {
            type: SummaryType.Blob,
            // We don't use this in the code below. We mostly just care about summaryObject for type inference.
            content: "",
        };
    }
    if (entry.type === "tree") {
        return {
            type: SummaryType.Tree,
            // We don't use this in the code below. We mostly just care about summaryObject for type inference.
            tree: {},
            unreferenced: (entry as IWholeSummaryTreeValueEntry).unreferenced,
        };
    }
    throw new NetworkError(400, `Unknown entry type: ${entry.type}`);
}

export class WholeSummaryWriteGitManager {
    private readonly entryHandleToObjectShaCache: Map<string, string> = new Map();

    constructor(
        private readonly documentId: string,
        private readonly repoManager: IRepositoryManager,
        private readonly externalStorageEnabled = true,
    ) {}

    public async writeSummary(payload: IWholeSummaryPayload): Promise<IWholeFlatSummary | IWriteSummaryResponse> {
        if (payload.type === "channel") {
            const summaryTreeHandle = await this.writeChannelSummary(payload);
            return {
                id: summaryTreeHandle,
            };
        }
        if (payload.type === "container") {
            const wholeFlatSummary = await this.writeContainerSummary(payload);
            return wholeFlatSummary;
        }
        throw new NetworkError(400, `Unknown Summary Type: ${payload.type}`);
    }

    private async writeChannelSummary(payload: IWholeSummaryPayload): Promise<string> {
        return this.writeSummaryTreeCore(payload.entries);
    }

    private async writeContainerSummary(
        payload: IWholeSummaryPayload,
    ): Promise<IWriteSummaryResponse> {
        const treeHandle = await this.writeSummaryTreeCore(
            payload.entries,
            "",
        );
        const existingRef = await this.repoManager.getRef(
            `refs/heads/${this.documentId}`,
            { enabled: this.externalStorageEnabled },
        ).catch(() => undefined);
        let commitParams: ICreateCommitParams
        if (!existingRef && payload.sequenceNumber === 0) {
            // Create new document
            commitParams = {
                author: {
                    date: new Date().toISOString(),
                    email: "dummy@microsoft.com",
                    name: "GitRest Service",
                },
                message: "New document",
                parents: [],
                tree: treeHandle,
            };
        } else {
            // Update existing document
            commitParams = {
                author: {
                    date: new Date().toISOString(),
                    email: "dummy@microsoft.com",
                    name: "GitRest Service",
                },
                // TODO: How to know if Service/Client Summary?
                // .app handle embedded=true looks to be an indicator. Is it worth checking?
                message: `Service/Client Summary @${payload.sequenceNumber}`,
                parents: existingRef ? [existingRef.object.sha] : [],
                tree: treeHandle,
            };
        }
        const commit = await this.repoManager.createCommit(commitParams);
        if (existingRef) {
            await this.repoManager.patchRef(
                `refs/heads/${this.documentId}`,
                {
                    force: true,
                    sha: commit.sha,
                },
                { enabled: this.externalStorageEnabled }
            );
        } else {
            await this.repoManager.createRef(
                {
                    ref: `refs/heads/${this.documentId}`,
                    sha: commit.sha,
                },
                { enabled: this.externalStorageEnabled },
            );
        }
        // TODO: precompute latest summary and return, or cache locally
        return {
            id: commit.sha,
        };
    }

    private async writeSummaryTreeCore(
        wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
        currentPath: string = "",
    ): Promise<string> {
        const entries: ICreateTreeEntry[] = await Promise.all(wholeSummaryTreeEntries.map(async (entry) => {
            const summaryObject = getSummaryObjectFromWholeSummaryTreeEntry(entry);
            const type = getGitType(summaryObject);
            const path = entry.path;
            const fullPath = currentPath ? `${currentPath}/${entry.path}` : entry.path;
            const pathHandle = await this.writeSummaryTreeObject(
                entry,
                summaryObject,
                fullPath,
            );
            return {
                mode: getGitMode(summaryObject),
                path,
                sha: pathHandle,
                type,
            };
        }));

        const createdTree = await this.repoManager.createTree(
            { tree: entries },
        );
        return createdTree.sha;
    }

    private async writeSummaryTreeObject(
        wholeSummaryTreeEntry: WholeSummaryTreeEntry,
        summaryObject: SummaryObject,
        currentPath: string,
    ): Promise<string> {
        switch(summaryObject.type) {
            case SummaryType.Blob:
                return this.writeSummaryBlob(
                    ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryBlob),
                );
            case SummaryType.Tree:
                return this.writeSummaryTreeCore(
                    ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryTree).entries ?? [],
                    currentPath,
                );
            case SummaryType.Handle:
                return this.getShaFromTreeHandleEntry(wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry);
            default:
                throw new NetworkError(501, "Not Implemented");
        }
    }

    private async writeSummaryBlob(blob: IWholeSummaryBlob): Promise<string> {
        const blobResponse = await this.repoManager.createBlob(
            {
                content: blob.content,
                encoding: blob.encoding,
            },
        );
        return blobResponse.sha;
    }

    private async getShaFromTreeHandleEntry(entry: IWholeSummaryTreeHandleEntry): Promise<string> {
        if (!entry.id) {
            throw new NetworkError(400, `Empty summary tree handle`);
        }
        if (entry.id.split("/").length === 1) {
            // The entry id is already a sha, so just return it
            return entry.id;
        }

        const cachedSha = this.entryHandleToObjectShaCache.get(entry.id);
        if (cachedSha) {
            return cachedSha;
        }

        // The entry id is in the format { id: `<parent commit sha>/<tree path>`, path: `<tree path>` }
        const parentHandle = entry.id.split("/")[0];
        const parentCommit = await this.repoManager.getCommit(parentHandle);
        const parentTree = await this.repoManager.getTree(parentCommit.tree.sha, true /* recursive */);
        for (const treeEntry of parentTree.tree) {
            this.entryHandleToObjectShaCache.set(`${parentHandle}/${treeEntry.path}`, treeEntry.sha);
        }
        const sha = this.entryHandleToObjectShaCache.get(entry.id);
        if (!sha) {
            throw new NetworkError(404, `Summary tree handle object not found: id: ${entry.id}, path: ${entry.path}`);
        }
        return sha;
    }
}

export async function getSummary(
    repoManager: IRepositoryManager,
    sha: string,
    documentId: string,
    externalStorageEnabled: boolean,
): Promise<IWholeFlatSummary> {
    const wholeSummaryReadGitManager = new WholeSummaryReadGitManager(
        documentId,
        repoManager,
        externalStorageEnabled,
    );
    return wholeSummaryReadGitManager.readSummary(sha);
}

export async function createSummary(
    repoManager: IRepositoryManager,
    payload: IWholeSummaryPayload,
    documentId: string,
    externalStorageEnabled: boolean,
): Promise<IWholeFlatSummary | IWriteSummaryResponse> {
    const wholeSummaryWriteGitManager = new WholeSummaryWriteGitManager(
        documentId,
        repoManager,
        externalStorageEnabled,
    );
    return wholeSummaryWriteGitManager.writeSummary(payload);
}

export async function deleteSummary(
    repoManager: IRepositoryManager,
    softDelete: boolean): Promise<boolean> {
    throw new NetworkError(501, "Not Implemented");
}

export function create(
    store: Provider,
    repoManagerFactory: IRepositoryManagerFactory,
): Router {
    const router: Router = Router();

    /**
     * Retrieves a summary.
     * If sha is "latest", returns latest summary for owner/repo.
     */
    router.get("/repos/:owner/:repo/git/summaries/:sha", async (request, response) => {
        const storageRoutingId: string = request.get("Storage-Routing-Id");
        const [,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(Promise.reject(new NetworkError(400, "Invalid Storage-Routing-Id header")), response);
            return;
        }
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then((repoManager) => getSummary(
            repoManager,
            request.params.sha,
            documentId,
            getExternalWriterParams(request.query?.config as string | undefined)?.enabled ?? false,
        ));
        handleResponse(resultP, response);
    });

    /**
     * Creates a new summary.
     */
    router.post("/repos/:owner/:repo/git/summaries", async (request, response) => {
        const storageRoutingId: string = request.get("Storage-Routing-Id");
        const [,documentId] = storageRoutingId.split(":");
        if (!documentId) {
            handleResponse(Promise.reject(new NetworkError(400, "Invalid Storage-Routing-Id header")), response);
            return;
        }
        const wholeSummaryPayload: IWholeSummaryPayload = request.body;
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then((repoManager) => createSummary(
            repoManager,
            wholeSummaryPayload,
            documentId,
            getExternalWriterParams(request.query?.config as string | undefined)?.enabled ?? false,
        ));
        handleResponse(resultP, response, 201);
    });

    /**
     * Deletes the latest summary for the owner/repo.
     * If header Soft-Delete="true", only flags summary as deleted.
     */
    router.delete("/repos/:owner/:repo/git/summaries/:sha", async (request, response) => {
        const softDelete = request.get("Soft-Delete")?.toLowerCase() === "true";
        const resultP = repoManagerFactory.open(
            request.params.owner,
            request.params.repo,
        ).then((repoManager) => deleteSummary(repoManager, softDelete));
        handleResponse(resultP, response, 204);
    });

    return router;
}
