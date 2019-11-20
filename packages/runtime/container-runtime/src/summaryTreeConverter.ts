/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IBlob,
    ISummaryBlob,
    ISummaryContext,
    ISummaryTree,
    ITree,
    SummaryObject,
    SummaryTree,
    SummaryType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";

export interface ISummaryStats {
    treeNodeCount: number;
    blobNodeCount: number;
    handleNodeCount: number;
    totalBlobSize: number;
}

export interface IConvertedSummaryResults {
    summaryStats: ISummaryStats;
    summaryTree: SummaryTree;
}

export class SummaryTreeConverter {
    public convertToSummaryTree(
        snapshot: ITree,
        summaryContext: ISummaryContext,
        fullTree: boolean = false,
    ): IConvertedSummaryResults {
        const summaryStats = this.mergeStats();
        const summaryTree = this.convertToSummaryTreeCore(
            snapshot,
            summaryContext,
            summaryStats,
            fullTree,
            "");

        return { summaryStats, summaryTree };
    }

    // no args will generate empty stats
    public mergeStats(...stats: ISummaryStats[]): ISummaryStats {
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

    protected convertToSummaryTreeCore(
        snapshot: ITree,
        summaryContext: ISummaryContext,
        summaryStats: ISummaryStats,
        fullTree: boolean = false,
        path: string,
    ): SummaryTree {
        if (snapshot.id && !fullTree) {
            summaryStats.handleNodeCount++;
            return {
                path,
                proposedParentHandle: summaryContext.proposalHandle,
                ackedParentHandle: summaryContext.ackHandle,
                handleType: SummaryType.Tree,
                type: SummaryType.Handle,
            };
        } else {
            const summaryTree: ISummaryTree = {
                tree: {},
                type: SummaryType.Tree,
            };

            for (const entry of snapshot.entries) {
                let value: SummaryObject;

                switch (entry.type) {
                    case TreeEntry[TreeEntry.Blob]: {
                        const blob = entry.value as IBlob;
                        let content: string | Buffer;
                        if (blob.encoding === "base64") {
                            content = Buffer.from(blob.contents, "base64");
                            summaryStats.totalBlobSize += content.byteLength;
                        } else {
                            content = blob.contents;
                            summaryStats.totalBlobSize += Buffer.byteLength(content);
                        }
                        value = {
                            content,
                            type: SummaryType.Blob,
                        } as ISummaryBlob;
                        summaryStats.blobNodeCount++;
                        break;
                    }
                    case TreeEntry[TreeEntry.Tree]: {
                        value = this.convertToSummaryTreeCore(
                            entry.value as ITree,
                            summaryContext,
                            summaryStats,
                            fullTree,
                            `${path}/${encodeURIComponent(entry.path)}`);
                        break;
                    }
                    case TreeEntry[TreeEntry.Commit]: {
                        // probably should not reach this case and assert so,
                        // when snapshotting the commits become strings not ITrees
                        value = this.convertToSummaryTreeCore(
                            entry.value as ITree,
                            summaryContext,
                            summaryStats,
                            fullTree,
                            `${path}/${encodeURIComponent(entry.path)}`);
                        break;
                    }
                    default: {
                        throw new Error("Unexpected TreeEntry type");
                    }
                }

                summaryTree.tree[entry.path] = value;
            }

            summaryStats.treeNodeCount++;
            return summaryTree;
        }
    }
}
