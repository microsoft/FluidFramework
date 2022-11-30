/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICreateCommitParams,
    ICreateTreeEntry,
    ITree,
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
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { NullExternalStorageManager } from "../externalStorageManager";
import { IRepositoryManager } from "./definitions";
import { MemFsManagerFactory } from "./filesystems";
import { GitRestLumberEventName } from "./gitrestTelemetryDefinitions";
import { IsomorphicGitManagerFactory } from "./isomorphicgitManager";

interface ISummaryVersion {
    id: string;
    treeId: string;
}

interface IFullSummaryTree {
    treeEntries: IWholeFlatSummaryTreeEntry[];
    blobs: IWholeFlatSummaryBlob[];
}

interface IWriteSummaryInfo {
    /**
     * True if this is an initial summary for a new document.
     */
    isNew: boolean;
    /**
     * Response containing commit sha for "container" write or tree sha for "channel" write.
     */
    writeSummaryResponse: IWriteSummaryResponse;
}

interface ISummaryWriteOptions {
    /**
     * WARNING: this option is highly optimized for read/write performance and has serious impact on storage space
     * efficiency when maintaining all versions (summaries) of a document because Git cannot share blobs between
     * summaries in this way. For optimal results, it is recommended to only use this flag when writing an initial
     * document summary, which is in the critical path for performance.
     * 
     * Uploading/downloading summaries from external filesystems using "Shredded Summary"
     * format can be very slow due to I/O overhead. Enabling low I/O summary writing moves the majority
     * of storage read/writes into memory and stores the resulting summary tree as a single blob in storage.
     * 
     * true: All summary writes will use low I/O mode
     * false (default): No summary writes will use low I/O mode
     * "initial": First summary write for a document will use low I/O mode
     */
    enableLowIoWrite: "initial" | boolean;
}

const DefaultSummaryWriteOptions: ISummaryWriteOptions = {
    enableLowIoWrite: false,
};

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

export const latestSummarySha = "latest";

export const isContainerSummary = (payload: IWholeSummaryPayload) => payload.type === "container";
export const isChannelSummary = (payload: IWholeSummaryPayload) => payload.type === "channel";

const lowIoTreePath = ".fullSummary";

/**
 * Handles reading/writing summaries from/to storage when the client expects or sends summary information in
 * the "Whole Summary" format. This can help save bandwidth by reducing the HTTP overhead associated
 * with "Shredded Summary" format communication between the client and service.
 * 
 * Internally, GitWholeSummaryManager uploads and reads from storage in the same way as a client
 * using "Shredded Summary" format would, unless the enableLowIoWrite option is/was used.
 */
export class GitWholeSummaryManager {
    private readonly entryHandleToObjectShaCache: Map<string, string> = new Map();

    constructor(
        private readonly documentId: string,
        private readonly repoManager: IRepositoryManager,
        private readonly lumberjackProperties: Record<string, any>,
        private readonly externalStorageEnabled = true,
    ) { }

    public async readSummary(sha: string): Promise<IWholeFlatSummary> {
        const readSummaryMetric = Lumberjack.newLumberMetric(
            GitRestLumberEventName.WholeSummaryManagerReadSummary,
            this.lumberjackProperties);

        try {
            let version: ISummaryVersion;
            if (sha === latestSummarySha) {
                version = await this.getLatestVersion(this.repoManager);
            } else {
                const commit = await this.repoManager.getCommit(sha);
                version = { id: commit.sha, treeId: commit.tree.sha };
            }
            const { treeEntries, blobs } = await this.readSummaryTreeCore(
                version.treeId,
                this.repoManager,
            );
            readSummaryMetric.success("GitWholeSummaryManager succeeded in reading summary");
            return {
                id: version.id,
                trees: [
                    {
                        id: version.treeId,
                        entries: treeEntries,
                        // We don't store sequence numbers in git
                        sequenceNumber: undefined,
                    },
                ],
                blobs,
            };
        } catch (error: any) {
            readSummaryMetric.error("GitWholeSummaryManager failed to read summary", error);
            throw error;
        }
    }

    private async readSummaryTreeCore(
        treeId: string,
        repoManager: IRepositoryManager,
    ): Promise<IFullSummaryTree> {
        const rawTree = await repoManager.getTree(treeId, true /* recursive */);
        const isWholeSummary = rawTree.tree.length === 1
            && rawTree.tree[0].type === "blob"
            && rawTree.tree[0].path === lowIoTreePath;
        return isWholeSummary
            ? this.readWholeSummaryTree(rawTree, repoManager)
            : this.readShreddedSummaryTree(rawTree, repoManager);
    }

    private async readShreddedSummaryTree(
        rawTree: ITree,
        repoManager: IRepositoryManager,
    ): Promise<IFullSummaryTree> {
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
                        repoManager,
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
            treeEntries: wholeFlatSummaryTreeEntries,
            blobs: wholeFlatSummaryBlobs,
        };
    }

    private async readWholeSummaryTree(
        rawTree: ITree,
        repoManager: IRepositoryManager,
    ): Promise<IFullSummaryTree> {
        const fullSummaryBlob = await this.getBlob(
            rawTree.tree[0].sha,
            repoManager,
        );
        const summaryData: IFullSummaryTree = JSON.parse(fullSummaryBlob.content);
        return summaryData;
    }

    private async getBlob(sha: string, repoManager: IRepositoryManager): Promise<IWholeFlatSummaryBlob> {
        const blob = await repoManager.getBlob(
            sha,
        );
        return {
            content: blob.content,
            encoding: blob.encoding === "base64" ? "base64" : "utf-8",
            id: blob.sha,
            size: blob.size,
        };
    }

    private async getLatestVersion(repoManager: IRepositoryManager): Promise<ISummaryVersion> {
        const commitDetails = await repoManager.getCommits(
            this.documentId,
            1,
            { enabled: this.externalStorageEnabled },
        );
        return {
            id: commitDetails[0].sha,
            treeId: commitDetails[0].commit.tree.sha,
        };
    }

    public async writeSummary(
        payload: IWholeSummaryPayload,
        options?: Partial<ISummaryWriteOptions>,
    ): Promise<IWriteSummaryInfo> {
        const writeSummaryMetric = Lumberjack.newLumberMetric(
            GitRestLumberEventName.WholeSummaryManagerWriteSummary,
            this.lumberjackProperties);
        const writeOptions: ISummaryWriteOptions = {
            ...options,
            ...DefaultSummaryWriteOptions,
        };
        try {
            if (isChannelSummary(payload)) {
                const summaryTreeHandle = await this.writeChannelSummary(payload, writeOptions);
                writeSummaryMetric.success("GitWholeSummaryManager succeeded in writing channel summary");
                return {
                    isNew: false,
                    writeSummaryResponse: {
                        id: summaryTreeHandle,
                    },
                };
            }
            if (isContainerSummary(payload)) {
                const writeSummaryInfo = await this.writeContainerSummary(payload, writeOptions);
                writeSummaryMetric.success("GitWholeSummaryManager succeeded in writing container summary");
                return writeSummaryInfo;
            }
            throw new NetworkError(400, `Unknown Summary Type: ${payload.type}`);
        } catch (error: any) {
            writeSummaryMetric.error("GitWholeSummaryManager failed to write summary", error);
            throw error;
        }
    }

    private async writeChannelSummary(
        payload: IWholeSummaryPayload,
        options: ISummaryWriteOptions,
    ): Promise<string> {
        return this.writeSummaryTree(
            payload.entries,
            options.enableLowIoWrite === true,
        );
    }

    private async writeContainerSummary(
        payload: IWholeSummaryPayload,
        options: ISummaryWriteOptions,
    ): Promise<IWriteSummaryInfo> {
        const existingRef = await this.repoManager.getRef(
            `refs/heads/${this.documentId}`,
            { enabled: this.externalStorageEnabled },
        ).catch(() => undefined);

        const isNewDocument = !existingRef && payload.sequenceNumber === 0;
        const useLowIoWrite = options.enableLowIoWrite === true || (isNewDocument && options.enableLowIoWrite === "initial");

        const treeHandle = await this.writeSummaryTree(
            payload.entries,
            useLowIoWrite,
        );

        const commitMessage = isNewDocument
            ? "New document"
            // Checking client vs. service summary involves checking whether .protocol payload entry
            // is a handle or value. At the moment, there is no real need for this message to distinguish the two.
            : `Summary @${payload.sequenceNumber}`;
        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "dummy@microsoft.com",
                name: "GitRest Service",
            },
            message: commitMessage,
            parents: existingRef ? [existingRef.object.sha] : [],
            tree: treeHandle,
        };
        const commit = await this.repoManager.createCommit(commitParams);

        // eslint-disable-next-line unicorn/prefer-ternary
        if (existingRef) {
            await this.repoManager.patchRef(
                `refs/heads/${this.documentId}`,
                {
                    force: true,
                    sha: commit.sha,
                },
                { enabled: this.externalStorageEnabled },
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

        return {
            isNew: isNewDocument,
            writeSummaryResponse: {
                id: commit.sha,
            },
        };
    }

    private async writeSummaryTree(
        wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
        useLowIoWrite: boolean = false,
    ): Promise<string> {
        if (!useLowIoWrite) {
            return this.writeSummaryTreeCore(
                wholeSummaryTreeEntries,
                this.repoManager,
            );
        }

        const inMemoryFsManagerFactory = new MemFsManagerFactory();
        const inMemoryRepoManagerFactory = new IsomorphicGitManagerFactory(
            { useRepoOwner: false },
            inMemoryFsManagerFactory,
            new NullExternalStorageManager(),
            true, /* repoPerDocEnabled */
            false, /* enableRepositoryManagerMetrics */
        );
        const inMemoryRepoManager = await inMemoryRepoManagerFactory.create(
            {
                repoOwner: "internal",
                repoName: this.documentId,
            }
        );
        const inMemorySummaryTreeHandle = await this.writeSummaryTreeCore(
            wholeSummaryTreeEntries,
            inMemoryRepoManager,
        );
        const fullSummaryTree = await this.readSummaryTreeCore(
            inMemorySummaryTreeHandle,
            inMemoryRepoManager,
        );
        const summaryTreeHandle = this.writeSummaryTreeCore(
            [{
                path: lowIoTreePath,
                type: "blob",
                value: {
                    type: "blob",
                    content: JSON.stringify(fullSummaryTree),
                    encoding: "utf-8",
                }
            }],
            this.repoManager,
        );
        return summaryTreeHandle;
    }

    private async writeSummaryTreeCore(
        wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
        repoManager: IRepositoryManager,
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
                repoManager,
            );
            return {
                mode: getGitMode(summaryObject),
                path,
                sha: pathHandle,
                type,
            };
        }));

        const createdTree = await repoManager.createTree(
            { tree: entries },
        );
        return createdTree.sha;
    }

    private async writeSummaryTreeObject(
        wholeSummaryTreeEntry: WholeSummaryTreeEntry,
        summaryObject: SummaryObject,
        currentPath: string,
        repoManager: IRepositoryManager,
    ): Promise<string> {
        switch (summaryObject.type) {
            case SummaryType.Blob:
                return this.writeSummaryBlob(
                    ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryBlob),
                    repoManager,
                );
            case SummaryType.Tree:
                return this.writeSummaryTreeCore(
                    ((wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry).value as IWholeSummaryTree).entries ?? [],
                    repoManager,
                    currentPath,
                );
            case SummaryType.Handle:
                return this.getShaFromTreeHandleEntry(
                    wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry,
                    repoManager,
                );
            default:
                throw new NetworkError(501, "Not Implemented");
        }
    }

    private async writeSummaryBlob(
        blob: IWholeSummaryBlob,
        repoManager: IRepositoryManager,
    ): Promise<string> {
        const blobResponse = await repoManager.createBlob(
            {
                content: blob.content,
                encoding: blob.encoding,
            },
        );
        return blobResponse.sha;
    }

    private async getShaFromTreeHandleEntry(
        entry: IWholeSummaryTreeHandleEntry,
        repoManager: IRepositoryManager,
    ): Promise<string> {
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
        // TODO: This will probably not work in low io mode as is
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
