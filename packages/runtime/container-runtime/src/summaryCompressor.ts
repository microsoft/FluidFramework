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

import {
    hashFile,
    IsoBuffer,
    Uint8ArrayToString,
} from "@fluidframework/common-utils";
import { getBlobSize } from "@fluidframework/runtime-utils";

/**
 * Compress {@link ISummaryTreeWithStats} summaries by replacing elements of type {@link SummaryTree.Blob}
 * with references (elements of type {@link SummaryTree.Handle}) to the blobs stored in the previous summary snapshot.
 * @param summaryWithStats - The summary with stats to compress. Stays immutable.
 * @param previousSnapshot - The previous summary snapshot
 * @param readBlob - Function to access blob contents by blob id
 * @returns A logically compressed `summaryWithStats`. The stats are updated according to the compression choices.
 */
export async function compressSummaryTree(
    summaryWithStats: ISummaryTreeWithStats,
    previousSnapshot: ISnapshotTree | undefined,
    readBlob: (id: string) => Promise<ArrayBufferLike>,
): Promise<ISummaryTreeWithStats> {
    if (previousSnapshot !== undefined) {
        const parentPaths = await blobPathsByContentHash(
            previousSnapshot,
            readBlob,
        );
        const stats: ISummaryStats = fastCloneStats(summaryWithStats.stats);
        const summary: ISummaryTree = fastCloneTree(summaryWithStats.summary);
        await compressTree(stats, summary, parentPaths);
        return { stats, summary };
    } else {
        return summaryWithStats;
    }
}

/**
 * Generate a SHA-256 hash from the input buffer
 * @param content - input to hash
 * @returns SHA-256 hash
 */
async function sha256(content: string | Uint8Array): Promise<string> {
    const { parsedContent, encoding } =
        typeof content === "string"
            ? { parsedContent: content, encoding: "utf-8" }
            : {
                  parsedContent: Uint8ArrayToString(content, "base64"),
                  encoding: "base64",
              };
    const hash = await hashFile(
        IsoBuffer.from(parsedContent, encoding),
        "SHA-256",
    );
    return hash;
}
/**
 * Internal utility to compress recursively the supplied {@link ISummaryTree}
 * @param stats - The stats associated with the supplied {@link ISummaryTree}
 * @param summaryTree - The {@link ISummaryTree} to compress
 * @param parentPaths - The blob-path-by-hash lookup table available for reuse (eg. from a previous summary)
 */
async function compressTree(
    stats: ISummaryStats,
    summaryTree: ISummaryTree,
    parentPaths: Map<string, string>,
): Promise<void> {
    for (const [key, value] of Object.entries(summaryTree.tree)) {
        switch (value.type) {
            case SummaryType.Blob: {
                const hash = await sha256(value.content);
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
                    console.log(
                        `Reusing key=${key}, hash=${hash}, handle=${handle}`,
                    );
                }
                break;
            }
            case SummaryType.Tree: {
                await compressTree(stats, value, parentPaths);
                break;
            }
            default: {
                break;
            }
        }
    }
}

/**
 * Extracts a blob-path-by-hash lookup table from the provided {@link ISnapshotTree}
 * @param snapshotTree - Snapshot tree to analyze
 * @param readBlob - Function to access blob contents by blob id
 * @returns A blob-path-by-hash lookup table
 */
async function blobPathsByContentHash(
    snapshotTree: ISnapshotTree,
    readBlob: (id: string) => Promise<ArrayBufferLike>,
): Promise<Map<string, string>> {
    const parentPaths = new Map<string, string>();
    await extractPaths(snapshotTree, [], readBlob, parentPaths);
    return parentPaths;
}
/**
 * Internal utility to (recursively) extract a blob-path-by-hash lookup table from the provided {@link ISnapshotTree}
 * @param snapshotTree - Snapshot tree to analyze
 * @param currentPath - Path tracking the location during recursion
 * @param readBlob - Function to access blob contents by blob id
 * @param parentPaths - A blob-path-by-hash lookup table
 */
async function extractPaths(
    snapshotTree: ISnapshotTree,
    currentPath: string[],
    readBlob: (id: string) => Promise<ArrayBufferLike>,
    parentPaths: Map<string, string>,
) {
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
/**
 * Clones {@link ISummaryStats} objects.
 * @param input - The stats to clone
 * @returns The cloning result
 */
export function fastCloneStats(input: ISummaryStats): ISummaryStats {
    const output: ISummaryStats = {
        treeNodeCount: input.treeNodeCount,
        blobNodeCount: input.blobNodeCount,
        handleNodeCount: input.handleNodeCount,
        totalBlobSize: input.totalBlobSize,
        unreferencedBlobSize: input.unreferencedBlobSize,
    };
    return output;
}

/**
 * Clones {@link ISummaryTree} objects. Creates deep copies for
 * all tree nodes, except nodes of {@link SummaryType.Blob} type,
 * which are referenced.
 * @param input - The tree to clone
 * @returns The cloning result
 */
export function fastCloneTree(input: ISummaryTree): ISummaryTree {
    const output: ISummaryTree =
        input.unreferenced === undefined
            ? {
                  type: SummaryType.Tree,
                  tree: {},
              }
            : {
                  type: SummaryType.Tree,
                  tree: {},
                  unreferenced: input.unreferenced,
              };
    fastClone(input, output);
    return output;
}
/**
 * Recursive {@link ISummaryTree} cloning. Creates deep copies for
 * all tree nodes, except nodes of {@link SummaryType.Blob} type,
 * which are referenced.
 * @param input - The tree to clone
 * @param output - The cloning result
 */
function fastClone(input: ISummaryTree, output: ISummaryTree) {
    for (const [key, inputValue] of Object.entries(input.tree)) {
        switch (inputValue.type) {
            case SummaryType.Blob: {
                output.tree[key] = inputValue;
                break;
            }
            case SummaryType.Tree: {
                const outputValue: ISummaryTree =
                    inputValue.unreferenced === undefined
                        ? {
                              type: SummaryType.Tree,
                              tree: {},
                          }
                        : {
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
            default:
                throw new Error(
                    `Unknown summary type specified on ${inputValue}`,
                );
        }
    }
}
