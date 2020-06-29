/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ISummarizerNode,
    ISummarizeInternalResult,
    ISummarizeResult,
    ISummaryTreeWithStats,
    ITrackingSummarizerNode,
} from "@fluidframework/runtime-definitions";
import { ISequencedDocumentMessage, SummaryType, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { mergeStats } from "./summaryUtils";

const baseSummaryTreeKey = ".baseSummary";
const outstandingOpsBlobKey = ".outstandingOps";

export interface IDecodedSummary {
    readonly baseSummary: ISnapshotTree;
    readonly outstandingOps: ISequencedDocumentMessage[];
}

export async function decodeSummary(
    snapshot: ISnapshotTree,
    readAndParseBlob: <T>(id: string) => Promise<T>,
): Promise<IDecodedSummary> {
    const outstandingOpsBlob = snapshot.blobs[outstandingOpsBlobKey];
    const baseSummary = snapshot.trees[baseSummaryTreeKey];
    if (outstandingOpsBlob === undefined && baseSummary === undefined) {
        return { baseSummary: snapshot, outstandingOps: [] };
    }

    assert(outstandingOpsBlob, "Outstanding ops blob missing, but base summary tree exists");
    assert(baseSummary, "Base summary tree missing, but outstanding ops blob exists");
    const outstandingOps = await readAndParseBlob<ISequencedDocumentMessage[]>(outstandingOpsBlob);
    return { baseSummary, outstandingOps };
}

class EscapedPath {
    public readonly path: string;
    constructor(path: string) {
        this.path = encodeURIComponent(path);
    }
    public toString(): string {
        return this.path;
    }
    public concat(path: EscapedPath): EscapedPath {
        return new EscapedPath(`${this.path}/${path.path}`);
    }
}

interface IEncodedSummary extends ISummaryTreeWithStats {
    readonly localPath: EscapedPath;
}

interface ISummaryNode {
    readonly referenceSequenceNumber: number;
    readonly fullPath: EscapedPath;
    readonly localPath: EscapedPath;
}

function encodeSummary(summaryNode: ISummaryNode, outstandingOps: ISequencedDocumentMessage[]): IEncodedSummary {
    const stats = mergeStats();
    stats.handleNodeCount++;
    stats.blobNodeCount++;
    stats.treeNodeCount++;
    return {
        summary: {
            type: SummaryType.Tree,
            tree: {
                [baseSummaryTreeKey]: {
                    type: SummaryType.Handle,
                    handle: summaryNode.fullPath.path,
                    handleType: SummaryType.Tree,
                },
                [outstandingOpsBlobKey]: {
                    type: SummaryType.Blob,
                    content: JSON.stringify(outstandingOps),
                },
            },
        },
        stats,
        localPath: summaryNode.localPath.concat(new EscapedPath(baseSummaryTreeKey)),
    };
}

export class SummarizerNode implements ITrackingSummarizerNode {
    /**
     * The latest sequence number of change to this node or subtree.
     */
    public get changeSequenceNumber() {
        return this._changeSequenceNumber;
    }

    /**
     * The reference sequence number of the most recent acked summary.
     * Returns 0 if there is not yet an acked summary.
     */
    public get referenceSequenceNumber() {
        return this.latestSummary?.referenceSequenceNumber ?? 0;
    }

    /**
     * The full path of this node as of the most recent acked summary.
     * Returns undefined if there is not yet an acked summary.
     */
    public get fullPath() {
        return this.latestSummary?.fullPath?.path;
    }

    private readonly children = new Set<SummarizerNode>();
    private readonly pendingSummaries = new Map<string, ISummaryNode>();
    private outstandingOps: ISequencedDocumentMessage[] = [];
    private wipReferenceSequenceNumber: number | undefined;
    private wipLocalPath: EscapedPath | undefined;

    public startSummary(referenceSequenceNumber: number) {
        assert.strictEqual(
            this.wipReferenceSequenceNumber,
            undefined,
            "Already tracking a summary",
        );

        for (const child of this.children.values()) {
            child.startSummary(referenceSequenceNumber);
        }
        this.wipReferenceSequenceNumber = referenceSequenceNumber;
    }

    public async summarize(
        summarizeInternalFn: () => Promise<ISummarizeInternalResult>,
        fullTree: boolean,
    ): Promise<ISummarizeResult> {
        // Try to reuse the tree if unchanged
        if (!fullTree && !this.hasChanged()) {
            const latestSummary = this.latestSummary;
            if (latestSummary !== undefined) {
                this.wipLocalPath = latestSummary.localPath;
                const stats = mergeStats();
                stats.handleNodeCount++;
                return {
                    summary: {
                        type: SummaryType.Handle,
                        handle: latestSummary.fullPath.path,
                        handleType: SummaryType.Tree,
                    },
                    stats,
                };
            }
        }

        try {
            const result = await summarizeInternalFn();
            this.wipLocalPath = new EscapedPath(result.id);
            return { summary: result.summary, stats: result.stats };
        } catch (error) {
            if (!this.trackChanges) {
                throw error;
            }
            const latestSummary = this.latestSummary;
            if (latestSummary === undefined) {
                // TODO: use attach op snapshot
                throw error;
            }

            const summary = encodeSummary(latestSummary, this.outstandingOps);
            this.wipLocalPath = summary.localPath;
            // TODO: PATH IS WRONG - REUSE VS CHILDREN
            return summary;
        }
    }

    public completeSummary(proposalHandle: string) {
        this.completeSummaryCore(proposalHandle);
    }

    private completeSummaryCore(proposalHandle: string, parentPath?: EscapedPath) {
        assert(this.wipReferenceSequenceNumber, "Not tracking a summary");
        assert(this.wipLocalPath, "Tracked summary local path not set");

        const summary: ISummaryNode = {
            referenceSequenceNumber: this.wipReferenceSequenceNumber,
            fullPath: parentPath?.concat(this.wipLocalPath) ?? this.wipLocalPath,
            localPath: this.wipLocalPath,
        };
        for (const child of this.children.values()) {
            child.completeSummaryCore(proposalHandle, summary.fullPath);
        }
        // Note that this overwrites existing pending summary with
        // the same proposalHandle. If proposalHandle is something like
        // a hash or unique identifier, this should be fine. If storage
        // can return the same proposalHandle for a different summary,
        // this should still be okay, because we should be proposing the
        // newer one later which would have to overwrite the previous one.
        this.pendingSummaries.set(proposalHandle, summary);
        this.clearSummary();
    }

    public clearSummary() {
        this.wipReferenceSequenceNumber = undefined;
        this.wipLocalPath = undefined;
        for (const child of this.children.values()) {
            child.clearSummary();
        }
    }

    public refreshLatestSummary(proposalHandle: string): void {
        if (this.latestSummary === undefined) {
            return; // TODO: WRONG
        }

        const summaryNode = this.pendingSummaries.get(proposalHandle);
        assert(summaryNode, `Not found: proposalHandle in pendingSummaries: "${proposalHandle}"`);
        this.latestSummary = summaryNode;

        // Clear earlier pending summaries
        this.pendingSummaries.delete(proposalHandle);
        for (const [key, value] of this.pendingSummaries) {
            if (value.referenceSequenceNumber < summaryNode.referenceSequenceNumber) {
                this.pendingSummaries.delete(key);
            }
        }

        // Clear earlier outstanding ops
        while (
            this.outstandingOps.length > 0
            && this.outstandingOps[0].sequenceNumber <= summaryNode.referenceSequenceNumber
        ) {
            this.outstandingOps.shift();
        }

        // Propagate update to all child nodes
        for (const child of this.children.values()) {
            child.refreshLatestSummary(proposalHandle);
        }
    }

    public prependOutstandingOps(ops: ISequencedDocumentMessage[]): void {
        assert(!this.trackChanges, "Should not prepend outstanding ops when trackChanges is disabled");
        if (ops.length > 0 && this.outstandingOps.length > 0) {
            const newOpsLatestSeq = ops[ops.length - 1].sequenceNumber;
            const prevOpsEarliestSeq = this.outstandingOps[0].sequenceNumber;
            assert(
                newOpsLatestSeq < prevOpsEarliestSeq,
                `Out of order prepended outstanding ops: ${newOpsLatestSeq} >= ${prevOpsEarliestSeq}`,
            );
        }
        this.outstandingOps = ops.concat(this.outstandingOps);
    }

    public recordChange(op: ISequencedDocumentMessage): void {
        assert(!this.trackChanges, "Should not record changes when trackChanges is disabled");
        this.invalidate(op.sequenceNumber);
        this.outstandingOps.push(op);
    }

    public invalidate(sequenceNumber: number): void {
        assert(
            this._changeSequenceNumber <= sequenceNumber,
            `Out of order change recorded: ${this._changeSequenceNumber} > ${sequenceNumber}`,
        );
        this._changeSequenceNumber = sequenceNumber;
    }

    public hasChanged(): boolean {
        return this._changeSequenceNumber > this.referenceSequenceNumber;
    }

    private constructor(
        private readonly trackChanges: boolean,
        private _changeSequenceNumber: number,
        private latestSummary?: ISummaryNode,
    ) {}

    public static createRootWithoutSummary(changeSequenceNumber: number): SummarizerNode {
        return new SummarizerNode(true, changeSequenceNumber, undefined);
    }

    public static createRootFromSummary(
        changeSequenceNumber: number,
        referenceSequenceNumber: number,
        id: string,
    ): SummarizerNode {
        return new SummarizerNode(
            true,
            changeSequenceNumber,
            {
                referenceSequenceNumber,
                fullPath: new EscapedPath(id),
                localPath: new EscapedPath(id),
            },
        );
    }

    private createChildCore(
        trackChanges: boolean,
        changeSequenceNumber: number,
        latestSummary?: ISummaryNode,
    ): SummarizerNode {
        const child = new SummarizerNode(
            trackChanges,
            changeSequenceNumber,
            latestSummary,
        );
        this.children.add(child);
        return child;
    }

    public createChildFromSummary(changeSequenceNumber: number, id: string): ISummarizerNode {
        const thisFullPath = this.latestSummary?.fullPath;
        assert(thisFullPath, "Must have previous summary with full path to create child with id");
        const localPath = new EscapedPath(id);
        const summary = {
            referenceSequenceNumber: this.referenceSequenceNumber,
            fullPath: thisFullPath.concat(localPath),
            localPath,
        };
        return this.createChildCore(false, changeSequenceNumber, summary);
    }

    public createChildWithoutSummary(changeSequenceNumber: number): ISummarizerNode {
        return this.createChildCore(false, changeSequenceNumber);
    }

    public createTrackingChildFromSummary(changeSequenceNumber: number, id: string): ITrackingSummarizerNode {
        const thisFullPath = this.latestSummary?.fullPath;
        assert(thisFullPath, "Must have previous summary with full path to create child with id");
        const localPath = new EscapedPath(id);
        const summary = {
            referenceSequenceNumber: this.referenceSequenceNumber,
            fullPath: thisFullPath.concat(localPath),
            localPath,
        };
        return this.createChildCore(true, changeSequenceNumber, summary);
    }

    public createTrackingChildWithoutSummary(changeSequenceNumber: number): ITrackingSummarizerNode {
        return this.createChildCore(true, changeSequenceNumber);
    }
}
