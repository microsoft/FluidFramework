/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ITree,
    SummaryType,
    ISummaryTree,
    SummaryObject,
    IBlob,
    ISummaryBlob,
    TreeEntry,
    ISummaryHandle,
} from "@fluidframework/protocol-definitions";
import { ISummaryStats, ISummarizeResult, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";

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
    };
    for (const stat of stats) {
        results.treeNodeCount += stat.treeNodeCount;
        results.blobNodeCount += stat.blobNodeCount;
        results.handleNodeCount += stat.handleNodeCount;
        results.totalBlobSize += stat.totalBlobSize;
    }
    return results;
}

export function addBlobToSummary(summary: ISummaryTreeWithStats, key: string, content: string | Buffer): void {
    const blob: ISummaryBlob = {
        type: SummaryType.Blob,
        content,
    };
    summary.summary.tree[key] = blob;
    summary.stats.blobNodeCount++;
    if (typeof content === "string") {
        summary.stats.totalBlobSize += Buffer.byteLength(content);
    } else {
        summary.stats.totalBlobSize += content.byteLength;
    }
}

export class SummaryTreeBuilder implements ISummaryTreeWithStats {
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

    private readonly summaryTree: { [path: string]: SummaryObject } = {};
    private summaryStats: ISummaryStats;

    public addBlob(key: string, content: string | Buffer): void {
        // Prevent cloning by directly referencing underlying private properties
        addBlobToSummary({
            summary: {
                type: SummaryType.Tree,
                tree: this.summaryTree,
            },
            stats: this.summaryStats,
        }, key, content);
    }

    public addHandle(key: string, handle: ISummaryHandle): void {
        this.summaryTree[key] = handle;
        this.summaryStats.handleNodeCount++;
    }

    public addWithStats(key: string, summarizeResult: ISummarizeResult): void {
        this.summaryTree[key] = summarizeResult.summary;
        this.summaryStats = mergeStats(this.summaryStats, summarizeResult.stats);
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
        const builder = new SummaryTreeBuilder();
        for (const entry of snapshot.entries) {
            switch (entry.type) {
                case TreeEntry[TreeEntry.Blob]: {
                    const blob = entry.value as IBlob;
                    let content: string | Buffer;
                    if (blob.encoding === "base64") {
                        content = Buffer.from(blob.contents, "base64");
                    } else {
                        content = blob.contents;
                    }
                    builder.addBlob(entry.path, content);
                    break;
                }

                case TreeEntry[TreeEntry.Tree]: {
                    const subtree = convertToSummaryTree(
                        entry.value as ITree,
                        fullTree);
                    builder.addWithStats(entry.path, subtree);

                    break;
                }

                case TreeEntry[TreeEntry.Commit]:
                    assert.fail("Should not have Commit TreeEntry in summary");

                default:
                    assert.fail("Unexpected TreeEntry type");
            }
        }

        return builder.getSummaryTree();
    }
}
