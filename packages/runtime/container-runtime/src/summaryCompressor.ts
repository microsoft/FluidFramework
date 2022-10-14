import {
    ISnapshotTree,
    ISummaryAttachment,
    ISummaryHandle,
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";

import {
    ISummaryStats,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";

import { hashFile, IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { getBlobSize } from "@fluidframework/runtime-utils";

// eslint-disable-next-line max-len
export async function compressSummaryTree(summaryWithStats: ISummaryTreeWithStats, previousSummaryHandle: string | undefined, previousSnapshot: ISnapshotTree, readBlob: (id: string) => Promise<ArrayBufferLike>) {
    if (previousSummaryHandle !== undefined) {
        const parentPaths = await snapshotPathsByContentHash(previousSnapshot, readBlob);
        const stats: ISummaryStats = fastCloneStats(summaryWithStats.stats);
        const summary: ISummaryTree = fastCloneTree(summaryWithStats.summary);
        await compressTree(stats, summary, previousSummaryHandle, parentPaths);
        return { stats, summary };
    } else {
        return summaryWithStats;
    }
}

async function hashValue(content: string | Uint8Array): Promise<string> {
    const { parsedContent, encoding } = typeof content === "string"
        ? { parsedContent: content, encoding: "utf-8" }
        : { parsedContent: Uint8ArrayToString(content, "base64"), encoding: "base64" };
    const hash = await hashFile(IsoBuffer.from(parsedContent, encoding), "SHA-256");
    return hash;
}

// eslint-disable-next-line max-len
export async function compressTree(stats: ISummaryStats, summaryTree: ISummaryTree, parentHandle: string | undefined, parentPaths: Map<string, string>) {
    for (const [key, value] of Object.entries(summaryTree.tree)) {
        switch (value.type) {
            case SummaryType.Blob: {
                const hash = await hashValue(value.content);
                const parentPath = parentPaths.get(hash);
                const handle = parentPath;
                const blobSize = getBlobSize(value.content);
                if (handle !== undefined) {
                    summaryTree.tree[key] = {
                        type: SummaryType.Handle,
                        handleType: SummaryType.Blob,
                        handle,
                    };
                    stats.blobNodeCount--;
                    stats.handleNodeCount++;
                    stats.totalBlobSize -= blobSize;
                    console.log(`Reusing key=${key}, hash=${hash}, handle=${handle}`);
                }
                break;
            }

            case SummaryType.Tree: {
                await compressTree(stats, value, parentHandle, parentPaths);
                break;
            }

            default: {
                break;
            }
        }
    }
}

// eslint-disable-next-line max-len
async function snapshotPathsByContentHash(snapshotTree: ISnapshotTree, readBlob: (id: string) => Promise<ArrayBufferLike>): Promise<Map<string, string>> {
    const parentPaths = new Map<string, string>();
    await extractPaths(snapshotTree, [], readBlob, parentPaths);
    return parentPaths;
}

// eslint-disable-next-line max-len
async function extractPaths(snapshotTree: ISnapshotTree, currentPath: string[], readBlob: (id: string) => Promise<ArrayBufferLike>, parentPaths: Map<string, string>) {
    if (snapshotTree) {
        for (const [path, id] of Object.entries(snapshotTree.blobs)) {
            const blob = await readBlob(id);
            const hash = await hashFile(IsoBuffer.from(blob), "SHA-256");
            const adjustedPath = [...currentPath, path];
            parentPaths.set(hash, adjustedPath.join("/"));
        }
        for (const [key, tree] of Object.entries(snapshotTree.trees)) {
            const adjustedPath = [...currentPath, key];
            await extractPaths(tree, adjustedPath, readBlob, parentPaths);
        }
    }
}

function fastCloneStats(input: ISummaryStats): ISummaryStats {
    const output: ISummaryStats = {
        treeNodeCount: input.treeNodeCount,
        blobNodeCount: input.blobNodeCount,
        handleNodeCount: input.handleNodeCount,
        totalBlobSize: input.totalBlobSize,
        unreferencedBlobSize: input.unreferencedBlobSize,
    };
    return output;
}

function fastCloneTree(input: ISummaryTree): ISummaryTree {
    const output: ISummaryTree = {
        type: SummaryType.Tree,
        tree: {},
        unreferenced: input.unreferenced,
    };
    fastClone(input, output);
    return output;
}

function fastClone(input: ISummaryTree, output: ISummaryTree) {
    for (const [key, inputValue] of Object.entries(input.tree)) {
        switch (inputValue.type) {
            case SummaryType.Blob: {
                output.tree[key] = inputValue;
                break;
            }

            case SummaryType.Tree: {
                const outputValue: ISummaryTree = {
                    type: SummaryType.Tree,
                    tree: {},
                    unreferenced: inputValue.unreferenced,
                };
                output.tree[key] = outputValue;
                fastClone(inputValue, outputValue);
                break;
            }

            case SummaryType.Attachment: {
                const outputValue: ISummaryAttachment = {
                    type: SummaryType.Attachment,
                    id: inputValue.id,
                };
                output.tree[key] = outputValue;
                break;
            }

            case SummaryType.Handle: {
                const outputValue: ISummaryHandle = {
                    type: SummaryType.Handle,
                    handleType: inputValue.handleType,
                    handle: inputValue.handle,
                };
                output.tree[key] = outputValue;
                break;
            }

            default: throw new Error(`Unknown summary type specified on ${inputValue}`);
        }
    }
}
