/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICreateCommitParams,
    ICreateTreeEntry,
    ITree,
    IBlob,
    IRef,
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
    enableLowIoWrite: true,
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

interface IFullGitTree {
    tree: ITree;
    blobs: Record<string, IBlob>;
}
function containsFullGitTree(gitTree: ITree): boolean {
    return gitTree.tree.length === 1
        && gitTree.tree[0].type === "blob"
        && gitTree.tree[0].path.endsWith(fullTreePath);
}
async function buildFullGitTreeFromGitTree(
    gitTree: ITree,
    repoManager: IRepositoryManager,
): Promise<IFullGitTree> {
    const blobPs: Promise<IBlob>[] = [];
    gitTree.tree.forEach((treeEntry) => {
        if (treeEntry.type === "blob") {
            blobPs.push(repoManager.getBlob(treeEntry.sha));
        }
    });
    const blobs = await Promise.all(blobPs);
    const blobMap = {};
    blobs.forEach((blob) => blobMap[blob.sha] = blob);
    return {
        tree: gitTree,
        blobs: blobMap,
    };
}
async function parseGitTreeContainingFullGitTree(
    gitTree: ITree,
    repoManager: IRepositoryManager,
): Promise<IFullGitTree> {
    const fullGitTreeBlob = await repoManager.getBlob(
        gitTree.tree[0].sha
    );
    return JSON.parse(Buffer.from(
        fullGitTreeBlob.content,
        fullGitTreeBlob.encoding === "base64" ? "base64" : "utf-8",
    ).toString("utf-8")) as IFullGitTree;
}
function convertGitBlobToSummaryBlob(blob: IBlob): IWholeFlatSummaryBlob {
    return {
        content: blob.content,
        encoding: blob.encoding === "base64" ? "base64" : "utf-8",
        id: blob.sha,
        size: blob.size,
    };
}
function convertFullGitTreeToFullSummaryTree(
    fullGitTree: IFullGitTree,
): IFullSummaryTree {
    const wholeFlatSummaryTreeEntries: IWholeFlatSummaryTreeEntry[] = [];
    const wholeFlatSummaryBlobs: IWholeFlatSummaryBlob[] = [];
    fullGitTree.tree.tree.forEach((treeEntry) => {
        if (treeEntry.type === "blob") {
            wholeFlatSummaryTreeEntries.push({
                type: "blob",
                id: treeEntry.sha,
                path: treeEntry.path,
            });
            wholeFlatSummaryBlobs.push(
                convertGitBlobToSummaryBlob(fullGitTree.blobs[treeEntry.sha]),
            );
        } else {
            wholeFlatSummaryTreeEntries.push({
                type: "tree",
                path: treeEntry.path,
            });
        }
    });
    return {
        treeEntries: wholeFlatSummaryTreeEntries,
        blobs: wholeFlatSummaryBlobs,
    };
}
function convertFullSummaryToWholeSummaryEntries(fullSummaryTree: IFullSummaryTree): WholeSummaryTreeEntry[] {
    const fullSummaryBlobMap = new Map<string, IWholeFlatSummaryBlob>();
    fullSummaryTree.blobs.forEach((fullSummaryBlob) => {
        fullSummaryBlobMap.set(fullSummaryBlob.id, fullSummaryBlob);
    });

    // Inspired by `buildHeirarchy` from services-client
    const lookup: { [path: string]: IWholeSummaryTreeValueEntry & { value: IWholeSummaryTree; }; } = {};
    const rootPath = ""; // This would normally be parentHandle, but only important when there are handles
    const root: IWholeSummaryTreeValueEntry & { value: IWholeSummaryTree; } = {
        type: "tree",
        path: rootPath,
        value: {
            type: "tree",
            entries: [],
        },
    };
    lookup[rootPath] = root;
    for (const entry of fullSummaryTree.treeEntries) {
        const entryPath = entry.path;
        const lastIndex = entryPath.lastIndexOf("/");
        const entryPathDir = entryPath.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entryPath.slice(lastIndex + 1);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];
        if (!node.value.entries) {
            node.value.entries = [];
        }
        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree: IWholeSummaryTreeValueEntry & { value: IWholeSummaryTree; } = {
                type: "tree",
                path: entryPathBase,
                value: {
                    type: "tree",
                    entries: [],
                },
            };
            node.value.entries.push(newTree);
            lookup[entryPath] = newTree;
        } else if (entry.type === "blob") {
            const fullSummaryBlob = fullSummaryBlobMap.get(entry.id);
            if (!fullSummaryBlob) {
                throw new Error(`Could not find blob ${entry.id} in full summary`);
            }
            const newBlob: IWholeSummaryTreeValueEntry & { value: IWholeSummaryBlob; } = {
                type: "blob",
                path: entryPathBase,
                value: {
                    type: "blob",
                    content: fullSummaryBlob.content,
                    encoding: fullSummaryBlob.encoding,
                },
            };
            node.value.entries.push(newBlob);
        } else {
            throw new Error(`Unknown entry type!!`);
        }
    }
    return root.value.entries ?? [];
}

export const latestSummarySha = "latest";

export const isContainerSummary = (payload: IWholeSummaryPayload) => payload.type === "container";
export const isChannelSummary = (payload: IWholeSummaryPayload) => payload.type === "channel";

const fullTreePath = ".fullTree";

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
        return containsFullGitTree(rawTree)
            ? this.readWholeSummaryTree(rawTree, repoManager)
            : this.readShreddedSummaryTree(rawTree, repoManager);
    }

    private async readShreddedSummaryTree(
        rawTree: ITree,
        repoManager: IRepositoryManager,
    ): Promise<IFullSummaryTree> {
        const fullGitTree = await buildFullGitTreeFromGitTree(rawTree, repoManager);
        return convertFullGitTreeToFullSummaryTree(fullGitTree);
    }

    private async readWholeSummaryTree(
        rawTree: ITree,
        repoManager: IRepositoryManager,
    ): Promise<IFullSummaryTree> {
        const fullGitTree = await parseGitTreeContainingFullGitTree(rawTree, repoManager);
        return convertFullGitTreeToFullSummaryTree(fullGitTree);
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

    private async getDocRef(): Promise<IRef | undefined> {
        const ref: IRef | undefined = await this.repoManager.getRef(
            `refs/heads/${this.documentId}`,
            { enabled: this.externalStorageEnabled },
        ).catch(() => undefined);
        return ref;
    }

    private async writeChannelSummary(
        payload: IWholeSummaryPayload,
        options: ISummaryWriteOptions,
    ): Promise<string> {
        // const useLowIoWrite = options.enableLowIoWrite === true;
        // const existingRef: IRef | undefined = useLowIoWrite
        //     ? await this.getDocRef()
        //     : undefined;
        return this.writeSummaryTree(
            payload.entries,
            // existingRef,
            // useLowIoWrite,
        );
    }

    private async writeContainerSummary(
        payload: IWholeSummaryPayload,
        options: ISummaryWriteOptions,
    ): Promise<IWriteSummaryInfo> {
        const existingRef = await this.getDocRef();

        const isNewDocument = !existingRef && payload.sequenceNumber === 0;
        const useLowIoWrite = options.enableLowIoWrite === true || (isNewDocument && options.enableLowIoWrite === "initial");

        const treeHandle = await this.writeSummaryTree(
            payload.entries,
            existingRef,
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
        existingRef?: IRef,
        useLowIoWrite: boolean = false,
    ): Promise<string> {
        if (!useLowIoWrite) {
            return this.writeSummaryTreeCore(
                wholeSummaryTreeEntries,
                this.repoManager,
            );
        }


        Lumberjack.info("Low-IO mode: Initializing In-memory Filesystem");
        const inMemoryFsManagerFactory = new MemFsManagerFactory();
        const inMemoryRepoManagerFactory = new IsomorphicGitManagerFactory(
            {
                baseDir: "/usr/gitrest",
                useRepoOwner: true,
            },
            inMemoryFsManagerFactory,
            new NullExternalStorageManager(),
            true, /* repoPerDocEnabled */
            false, /* enableRepositoryManagerMetrics */
        );
        const inMemoryRepoManager = await inMemoryRepoManagerFactory.create(
            {
                repoOwner: "gitrest",
                repoName: this.documentId,
                storageRoutingId: {
                    tenantId: "internal",
                    documentId: this.documentId,
                },
            }
        );
        if (existingRef) {
            // Update in-memory repo manager with previous summary for handle references.
            Lumberjack.info("Low-IO mode: Writing previous summary to memory");
            const previousSummary = await this.readSummary(existingRef.object.sha);
            const fullSummaryPayload = convertFullSummaryToWholeSummaryEntries({
                treeEntries: previousSummary.trees[0].entries,
                blobs: previousSummary.blobs ?? [],
            });
            const previousSummaryMemoryHandle = await this.writeSummaryTreeCore(
                fullSummaryPayload,
                inMemoryRepoManager,
            );
            const previousSummaryMemoryGitTree = await this.repoManager.getTree(
                previousSummaryMemoryHandle,
                true /* recursive */
            );
            const previousSummaryMemoryFullGitTree: IFullGitTree = containsFullGitTree(previousSummaryMemoryGitTree)
                ? (await parseGitTreeContainingFullGitTree(previousSummaryMemoryGitTree, this.repoManager))
                : { tree: previousSummaryMemoryGitTree, blobs: {} };
            for (const treeEntry of previousSummaryMemoryFullGitTree.tree.tree) {
                this.entryHandleToObjectShaCache.set(`${existingRef.object.sha}/${treeEntry.path}`, treeEntry.sha);
            }
        }
        Lumberjack.info("Low-IO mode: Writing summary to memory");
        const inMemorySummaryTreeHandle = await this.writeSummaryTreeCore(
            wholeSummaryTreeEntries,
            inMemoryRepoManager,
        );
        Lumberjack.info("Low-IO mode: Reading summary from memory");
        const gitTree = await inMemoryRepoManager
            .getTree(inMemorySummaryTreeHandle, true /* recursive */)
            .catch(async (error) => {
                if (error.code === "NotFoundError" && typeof error.data.what === "string") {
                    Lumberjack.info("Encountered NotFoundError when reading git tree. Attempting recovery.");
                    // It is likely that this is caused by the previous Channel summary tree not
                    // being available in the in-memory filesystem. Attempt to retrieve it, update the local FS, then
                    // try again.
                    try {
                        Lumberjack.info(`Reading missing tree element: ${error.data.what}`);
                        const missingTreeElement = await this.repoManager.getTree(
                            error.data.what,
                            true, /* recursive */
                        );
                        Lumberjack.info(`Building full tree from missing tree element`, { missingTreeElement });
                        const fullMissingGitTree: IFullGitTree = /* containsFullGitTree(missingTreeElement)
                            ? await parseGitTreeContainingFullGitTree(missingTreeElement, this.repoManager)
                            : */
                            await buildFullGitTreeFromGitTree(
                                missingTreeElement,
                                this.repoManager,
                            );

                        Lumberjack.info(`Converting fullGitTree to fullSummaryTree`, { fullMissingGitTree });
                        const fullMissingSummaryTree = convertFullGitTreeToFullSummaryTree(
                            fullMissingGitTree,
                        );
                        const wholeMissingSummaryTreeEntries = convertFullSummaryToWholeSummaryEntries(
                            fullMissingSummaryTree,
                        );
                        Lumberjack.info(`Writing summary tree to memory`, { wholeMissingSummaryTreeEntries });
                        const missingMemoryTreeHandle = await this.writeSummaryTreeCore(
                            wholeMissingSummaryTreeEntries,
                            inMemoryRepoManager,
                        );
                        Lumberjack.info(`DEBUG: retrieving new full tree from memory`);
                        const debuggingWrittenElement = await inMemoryRepoManager.getTree(
                            missingMemoryTreeHandle,
                            true, /* recursive */
                        );
                        Lumberjack.info(`DEBUG: building new full tree from memory`, { debuggingWrittenElement });
                        const debuggingFullGitTree: IFullGitTree = containsFullGitTree(debuggingWrittenElement)
                            ? await parseGitTreeContainingFullGitTree(debuggingWrittenElement, inMemoryRepoManager)
                            : await buildFullGitTreeFromGitTree(
                                debuggingWrittenElement,
                                inMemoryRepoManager,
                            );
                        Lumberjack.info(`DEBUG: retrieved full tree from memory`, debuggingFullGitTree);
                        Lumberjack.info(`Wrote tree ${missingMemoryTreeHandle}. Retrying reading tree`);
                        return inMemoryRepoManager.getTree(inMemorySummaryTreeHandle, true /* recursive */);
                    } catch (e) {
                        Lumberjack.error("Failed to recover from missing git object", undefined, e);
                    }
                }
                throw error;
            });
        const fullGitTree = await buildFullGitTreeFromGitTree(
            gitTree,
            inMemoryRepoManager,
        );
        Lumberjack.info("Low-IO mode: Writing summary to storage");
        const summaryTreeHandle = this.writeSummaryTreeCore(
            [{
                path: fullTreePath,
                type: "blob",
                value: {
                    type: "blob",
                    content: JSON.stringify(fullGitTree),
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
                repoManager,
                fullPath,
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
        repoManager: IRepositoryManager,
        currentPath: string,
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

        // The entry is in the format { id: `<parent commit sha>/<tree path>`, path: `<tree path>` }
        const parentHandle = entry.id.split("/")[0];
        const parentCommit = await this.repoManager.getCommit(parentHandle);
        const parentTree = await this.repoManager.getTree(parentCommit.tree.sha, true /* recursive */);
        const gitTree: IFullGitTree = containsFullGitTree(parentTree)
            ? (await parseGitTreeContainingFullGitTree(parentTree, this.repoManager))
            : { tree: parentTree, blobs: {} };
        const DEBUGMAP = {};
        for (const treeEntry of gitTree.tree.tree) {
            DEBUGMAP[`${parentHandle}/${treeEntry.path}`] = treeEntry.sha;
            this.entryHandleToObjectShaCache.set(`${parentHandle}/${treeEntry.path}`, treeEntry.sha);
        }
        const sha = this.entryHandleToObjectShaCache.get(entry.id);
        if (!sha) {
            Lumberjack.info(`DEBUG: ${JSON.stringify(DEBUGMAP)}`, { entry, parentTree });
            throw new NetworkError(404, `Summary tree handle object not found: id: ${entry.id}, path: ${entry.path}`);
        }
        if (repoManager !== this.repoManager) {
            Lumberjack.info("Low-IO mode: Updating in-memory FS with parent object");
            // Update the in-memory repoManager so that it has access to the blobs being referenced
            const fullGitTree = Object.values(gitTree.blobs).length === 0
                ? await buildFullGitTreeFromGitTree(gitTree.tree, this.repoManager)
                : gitTree;
            const fullSummaryTree = convertFullGitTreeToFullSummaryTree(fullGitTree);
            const wholeSummaryTreeEntries = convertFullSummaryToWholeSummaryEntries(fullSummaryTree);
            await this.writeSummaryTreeCore(wholeSummaryTreeEntries, repoManager);
        }
        return sha;
    }
}
