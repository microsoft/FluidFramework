/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TelemetryEventPropertyType } from "@fluidframework/common-definitions";
import {
    bufferToString,
    fromBase64ToUtf8,
    IsoBuffer,
    Uint8ArrayToString,
    unreachableCase,
} from "@fluidframework/common-utils";
import { AttachmentTreeEntry, BlobTreeEntry, TreeTreeEntry } from "@fluidframework/protocol-base";
import {
    ITree,
    SummaryType,
    ISummaryTree,
    SummaryObject,
    ISummaryBlob,
    TreeEntry,
    ITreeEntry,
    ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import {
    ISummaryStats,
    ISummarizeResult,
    ISummaryTreeWithStats,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";

/**
 * Combines summary stats by adding their totals together.
 * Returns empty stats if called without args.
 * @param stats - stats to merge
 */
export function mergeStats(...stats: ISummaryStats[]): ISummaryStats {
    const results = {
        treeNodeCount: 0,
        blobNodeCount: 0,
        handleNodeCount: 0,
        totalBlobSize: 0,
        unreferencedBlobSize: 0,
    };
    for (const stat of stats) {
        results.treeNodeCount += stat.treeNodeCount;
        results.blobNodeCount += stat.blobNodeCount;
        results.handleNodeCount += stat.handleNodeCount;
        results.totalBlobSize += stat.totalBlobSize;
        results.unreferencedBlobSize += stat.unreferencedBlobSize;
    }
    return results;
}

export function utf8ByteLength(str: string): number {
  // returns the byte length of an utf8 string
  let s = str.length;
  for (let i = str.length - 1; i >= 0; i--) {
    const code = str.charCodeAt(i);
    if (code > 0x7f && code <= 0x7ff) {
        s++;
    } else if (code > 0x7ff && code <= 0xffff) {
        s += 2;
    }
    if (code >= 0xDC00 && code <= 0xDFFF) {
        i--; // trail surrogate
    }
  }
  return s;
}

export function getBlobSize(content: ISummaryBlob["content"]): number {
    if (typeof content === "string") {
        return utf8ByteLength(content);
    } else {
        return content.byteLength;
    }
}

function calculateStatsCore(summaryObject: SummaryObject, stats: ISummaryStats): void {
    switch (summaryObject.type) {
        case SummaryType.Tree: {
            stats.treeNodeCount++;
            for (const value of Object.values(summaryObject.tree)) {
                calculateStatsCore(value, stats);
            }
            return;
        }
        case SummaryType.Handle: {
            stats.handleNodeCount++;
            return;
        }
        case SummaryType.Blob: {
            stats.blobNodeCount++;
            stats.totalBlobSize += getBlobSize(summaryObject.content);
            return;
        }
        default: return;
    }
}

export function calculateStats(summary: SummaryObject): ISummaryStats {
    const stats = mergeStats();
    calculateStatsCore(summary, stats);
    return stats;
}

export function addBlobToSummary(summary: ISummaryTreeWithStats, key: string, content: string | Uint8Array): void {
    const blob: ISummaryBlob = {
        type: SummaryType.Blob,
        content,
    };
    summary.summary.tree[key] = blob;
    summary.stats.blobNodeCount++;
    summary.stats.totalBlobSize += getBlobSize(content);
}

export function addTreeToSummary(summary: ISummaryTreeWithStats, key: string, summarizeResult: ISummarizeResult): void {
    summary.summary.tree[key] = summarizeResult.summary;
    summary.stats = mergeStats(summary.stats, summarizeResult.stats);
}

export function addSummarizeResultToSummary(
    summary: ISummaryTreeWithStats,
    key: string,
    summarizeResult: ISummarizeResult,
): void {
    summary.summary.tree[key] = summarizeResult.summary;
    summary.stats = mergeStats(summary.stats, summarizeResult.stats);
}

export class SummaryTreeBuilder implements ISummaryTreeWithStats {
    private attachmentCounter: number = 0;

    public get summary(): ISummaryTree {
        return {
            type: SummaryType.Tree,
            tree: { ...this.summaryTree },
        };
    }

    public get stats(): Readonly<ISummaryStats> {
        return { ...this.summaryStats };
    }

    constructor() {
        this.summaryStats = mergeStats();
        this.summaryStats.treeNodeCount++;
    }

    private readonly summaryTree: { [path: string]: SummaryObject; } = {};
    private summaryStats: ISummaryStats;

    public addBlob(key: string, content: string | Uint8Array): void {
        // Prevent cloning by directly referencing underlying private properties
        addBlobToSummary({
            summary: {
                type: SummaryType.Tree,
                tree: this.summaryTree,
            },
            stats: this.summaryStats,
        }, key, content);
    }

    public addHandle(
        key: string,
        handleType: SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment,
        handle: string): void {
        this.summaryTree[key] = {
            type: SummaryType.Handle,
            handleType,
            handle,
        };
        this.summaryStats.handleNodeCount++;
    }

    public addWithStats(key: string, summarizeResult: ISummarizeResult): void {
        this.summaryTree[key] = summarizeResult.summary;
        this.summaryStats = mergeStats(this.summaryStats, summarizeResult.stats);
    }

    public addAttachment(id: string) {
        this.summaryTree[this.attachmentCounter++] = { id, type: SummaryType.Attachment };
    }

    public getSummaryTree(): ISummaryTreeWithStats {
        return { summary: this.summary, stats: this.stats };
    }
}

/**
 * Converts snapshot ITree to ISummaryTree format and tracks stats.
 * @param snapshot - snapshot in ITree format
 * @param fullTree - true to never use handles, even if id is specified
 */
export function convertToSummaryTreeWithStats(
    snapshot: ITree,
    fullTree: boolean = false,
): ISummaryTreeWithStats {
    const builder = new SummaryTreeBuilder();
    for (const entry of snapshot.entries) {
        switch (entry.type) {
            case TreeEntry.Blob: {
                const blob = entry.value;
                let content: string | Uint8Array;
                if (blob.encoding === "base64") {
                    content = IsoBuffer.from(blob.contents, "base64");
                } else {
                    content = blob.contents;
                }
                builder.addBlob(entry.path, content);
                break;
            }

            case TreeEntry.Tree: {
                const subtree = convertToSummaryTree(
                    entry.value,
                    fullTree);
                builder.addWithStats(entry.path, subtree);

                break;
            }

            case TreeEntry.Attachment: {
                const id = entry.value.id;
                builder.addAttachment(id);

                break;
            }

            default:
                throw new Error("Unexpected TreeEntry type");
        }
    }

    const summaryTree = builder.getSummaryTree();
    summaryTree.summary.unreferenced = snapshot.unreferenced;
    return summaryTree;
}

/**
 * Converts snapshot ITree to ISummaryTree format and tracks stats.
 * @param snapshot - snapshot in ITree format
 * @param fullTree - true to never use handles, even if id is specified
 */
export function convertToSummaryTree(
    snapshot: ITree,
    fullTree: boolean = false,
): ISummarizeResult {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (snapshot.id && !fullTree) {
        const stats = mergeStats();
        stats.handleNodeCount++;
        return {
            summary: {
                handle: snapshot.id,
                handleType: SummaryType.Tree,
                type: SummaryType.Handle,
            },
            stats,
        };
    } else {
        return convertToSummaryTreeWithStats(snapshot, fullTree);
    }
}

/**
 * Converts ISnapshotTree to ISummaryTree format and tracks stats. This snapshot tree was
 * was taken by serialize api in detached container.
 * @param snapshot - snapshot in ISnapshotTree format
 */
export function convertSnapshotTreeToSummaryTree(
    snapshot: ISnapshotTree,
): ISummaryTreeWithStats {
    const builder = new SummaryTreeBuilder();
    for (const [path, id] of Object.entries(snapshot.blobs)) {
        let decoded: string | undefined;
        if ((snapshot as any).blobsContents !== undefined) {
            const content: ArrayBufferLike = (snapshot as any).blobsContents[id];
            if (content !== undefined) {
                decoded = bufferToString(content, "utf-8");
            }
        // 0.44 back-compat We still put contents in same blob for back-compat so need to add blob
        // only for blobPath -> blobId mapping and not for blobId -> blob value contents.
        } else if (snapshot.blobs[id] !== undefined) {
            decoded = fromBase64ToUtf8(snapshot.blobs[id]);
        }
        if (decoded !== undefined) {
            builder.addBlob(path, decoded);
        }
    }

    for (const [key, tree] of Object.entries(snapshot.trees)) {
        const subtree = convertSnapshotTreeToSummaryTree(tree);
        builder.addWithStats(key, subtree);
    }

    const summaryTree = builder.getSummaryTree();
    summaryTree.summary.unreferenced = snapshot.unreferenced;
    return summaryTree;
}

/**
 * Converts ISummaryTree to ITree format. This is needed for back-compat while we get rid of snapshot.
 * @param summaryTree - summary tree in ISummaryTree format
 */
export function convertSummaryTreeToITree(summaryTree: ISummaryTree): ITree {
    const entries: ITreeEntry[] = [];
    for (const [key, value] of Object.entries(summaryTree.tree)) {
        switch (value.type) {
            case SummaryType.Blob: {
                let parsedContent: string;
                let encoding: "utf-8" | "base64" = "utf-8";
                if (typeof value.content === "string") {
                    parsedContent = value.content;
                } else {
                    parsedContent = Uint8ArrayToString(value.content, "base64");
                    encoding = "base64";
                }
                entries.push(new BlobTreeEntry(key, parsedContent, encoding));
                break;
            }

            case SummaryType.Tree: {
                entries.push(new TreeTreeEntry(key, convertSummaryTreeToITree(value)));
                break;
            }

            case SummaryType.Attachment: {
                entries.push(new AttachmentTreeEntry(key, value.id));
                break;
            }

            case SummaryType.Handle: {
                throw new Error("Should not have Handle type in summary tree");
            }

            default:
                unreachableCase(value, "Unexpected summary tree type");
        }
    }
    return {
        entries,
        unreferenced: summaryTree.unreferenced,
    };
}

export class TelemetryContext implements ITelemetryContext {
    private readonly telemetry = new Map<string, TelemetryEventPropertyType>();

    /**
     * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.set}
     */
    set(prefix: string, property: string, value: TelemetryEventPropertyType): void {
        this.telemetry.set(`${prefix}${property}`, value);
    }

    /**
     * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.get}
     */
    get(prefix: string, property: string): TelemetryEventPropertyType {
        return this.telemetry.get(`${prefix}${property}`);
    }

    /**
     * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.serialize}
     */
    serialize(): string {
        return JSON.stringify(this.telemetry);
    }
}
