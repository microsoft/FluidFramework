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
const maxDecodeDepth = 10000;

export interface IDecodedSummary {
    readonly baseSummary: ISnapshotTree;
    readonly pathParts: string[];
    readonly outstandingOps: ISequencedDocumentMessage[];
}

export async function decodeSummary(
    snapshot: ISnapshotTree,
    readAndParseBlob: <T>(id: string) => Promise<T>,
): Promise<IDecodedSummary> {
    let baseSummary = snapshot;
    const pathParts: string[] = [];
    let outstandingOps: ISequencedDocumentMessage[] = [];

    for (let i = 0; i < maxDecodeDepth; i++) {
        const outstandingOpsBlob = baseSummary.blobs[outstandingOpsBlobKey];
        const newBaseSummary = baseSummary.trees[baseSummaryTreeKey];
        if (outstandingOpsBlob === undefined && newBaseSummary === undefined) {
            return { baseSummary, pathParts, outstandingOps };
        }

        assert(outstandingOpsBlob, "Outstanding ops blob missing, but base summary tree exists");
        assert(newBaseSummary, "Base summary tree missing, but outstanding ops blob exists");
        const newOutstandingOps = await readAndParseBlob<ISequencedDocumentMessage[]>(outstandingOpsBlob);
        pathParts.push(outstandingOpsBlobKey);
        outstandingOps = newOutstandingOps.concat(outstandingOps); // prepend
        baseSummary = newBaseSummary;
    }
    assert.fail("Exceeded max depth while decoding a base summary");
}

class EscapedPath {
    private constructor(public readonly path: string) {}
    public static create(path: string): EscapedPath {
        return new EscapedPath(encodeURIComponent(path));
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
    readonly basePath: EscapedPath | undefined;
    readonly localPath: EscapedPath;
    localPathForChildren?: EscapedPath; // defaults to localPath
}

const getFullPath = (node: ISummaryNode): EscapedPath =>
    node.basePath?.concat(node.localPath) ?? node.localPath;
const getLocalPathForChildren = (node: ISummaryNode): EscapedPath =>
    node.localPathForChildren ?? node.localPath;
const getFullPathForChildren = (node: ISummaryNode): EscapedPath => {
    const localPathForChildren = getLocalPathForChildren(node);
    return node.basePath?.concat(localPathForChildren) ?? localPathForChildren;
};

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
                    handle: getFullPath(summaryNode).path,
                    handleType: SummaryType.Tree,
                },
                [outstandingOpsBlobKey]: {
                    type: SummaryType.Blob,
                    content: JSON.stringify(outstandingOps),
                },
            },
        },
        stats,
        localPath: summaryNode.localPath.concat(EscapedPath.create(baseSummaryTreeKey)),
    };
}

/**
 * Encapsulates the summarizing work and state of an individual tree node in the
 * summary tree. It tracks changes and allows for optimizations when unchanged, or
 * can allow for fallback summaries to be generated when an error is encountered.
 * Usage is for the root node to call startSummary first to begin tracking a WIP
 * (work in progress) summary. Then all nodes will call summarize to summaries their
 * individual parts. Once completed and uploaded to storage, the root node will call
 * completeSummary or clearSummary to clear the WIP summary tracking state if something
 * went wrong. The SummarizerNodes will track all pending summaries that have been
 * recorded by the completeSummary call. When one of them is acked, the root node should
 * call refreshLatestSummary to inform the tree of SummarizerNodes of the new baseline
 * latest successful summary.
 */
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

    private readonly children = new Set<SummarizerNode>();
    private readonly pendingSummaries = new Map<string, ISummaryNode>();
    private outstandingOps: ISequencedDocumentMessage[] = [];
    private wipReferenceSequenceNumber: number | undefined;
    private wipLocalPaths: { forThis: EscapedPath, forChildren?: EscapedPath } | undefined;
    private wipIsFailure = false;

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
        throwOnFailure: boolean = false,
    ): Promise<ISummarizeResult> {
        // Try to reuse the tree if unchanged
        if (!fullTree && !this.hasChanged()) {
            const latestSummary = this.latestSummary;
            if (latestSummary !== undefined) {
                this.wipLocalPaths = { forThis: latestSummary.localPath };
                const stats = mergeStats();
                stats.handleNodeCount++;
                return {
                    summary: {
                        type: SummaryType.Handle,
                        handle: getFullPath(latestSummary).path,
                        handleType: SummaryType.Tree,
                    },
                    stats,
                };
            }
        }

        try {
            const result = await summarizeInternalFn();
            this.wipLocalPaths = { forThis: EscapedPath.create(result.id) };
            return { summary: result.summary, stats: result.stats };
        } catch (error) {
            if (!this.trackChanges || throwOnFailure) {
                throw error;
            }
            const latestSummary = this.latestSummary;
            if (latestSummary === undefined) {
                // TODO: use attach op snapshot
                throw error;
            }

            const summary = encodeSummary(latestSummary, this.outstandingOps);
            this.wipLocalPaths = {
                forThis: latestSummary.localPath,
                forChildren: summary.localPath,
            };
            this.wipIsFailure = true;
            return { summary: summary.summary, stats: summary.stats };
        }
    }

    public completeSummary(proposalHandle: string) {
        this.completeSummaryCore(proposalHandle);
    }

    private completeSummaryCore(proposalHandle: string, parentPath?: EscapedPath, parentIsFailure = false) {
        assert(this.wipReferenceSequenceNumber, "Not tracking a summary");
        assert(this.wipLocalPaths, "Tracked summary local paths not set");

        let localPathsToUse = this.wipLocalPaths;
        if (parentIsFailure === true) {
            if (this.latestSummary !== undefined) {
                // This case the parent node created a failure summary.
                // This node and all children should only try to reference their last
                // good state.
                localPathsToUse = {
                    forThis: this.latestSummary.localPath,
                    forChildren: this.latestSummary.localPathForChildren,
                };
            } else {
                // This case the child is added after the latest non-failure summary.
                // This node and all children should consider themselves as still not
                // having a successful summary yet.
                this.clearSummary();
                return;
            }
        }
        const summary: ISummaryNode = {
            referenceSequenceNumber: this.wipReferenceSequenceNumber,
            basePath: parentPath,
            localPath: localPathsToUse.forThis,
            localPathForChildren: localPathsToUse.forChildren,
        };
        const fullPathForChildren = getFullPathForChildren(summary);
        for (const child of this.children.values()) {
            child.completeSummaryCore(proposalHandle, fullPathForChildren, this.wipIsFailure || parentIsFailure);
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
        this.wipLocalPaths = undefined;
        this.wipIsFailure = false;
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

    public prependOutstandingOps(pathPartsForChildren: string[], ops: ISequencedDocumentMessage[]): void {
        assert(!this.trackChanges, "Should not prepend outstanding ops when trackChanges is disabled");
        assert(this.latestSummary, "Should have latest summary defined to prepend outstanding ops");
        let localPathForChildren = this.latestSummary.localPath; // assuming relative; safe assumption
        for (const pathPart of pathPartsForChildren) {
            localPathForChildren = localPathForChildren.concat(EscapedPath.create(pathPart));
        }
        this.latestSummary.localPathForChildren = localPathForChildren;
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
                basePath: undefined,
                localPath: EscapedPath.create(id),
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
        const latestSummary = this.latestSummary;
        assert(latestSummary, "Must have previous summary to create child with id");
        const localPath = EscapedPath.create(id);
        const summary: ISummaryNode = {
            referenceSequenceNumber: this.referenceSequenceNumber,
            basePath: getFullPathForChildren(latestSummary),
            localPath,
        };
        return this.createChildCore(false, changeSequenceNumber, summary);
    }

    public createChildWithoutSummary(changeSequenceNumber: number): ISummarizerNode {
        return this.createChildCore(false, changeSequenceNumber);
    }

    public createTrackingChildFromSummary(changeSequenceNumber: number, id: string): ITrackingSummarizerNode {
        const latestSummary = this.latestSummary;
        assert(latestSummary, "Must have previous summary to create child with id");
        const localPath = EscapedPath.create(id);
        const summary = {
            referenceSequenceNumber: this.referenceSequenceNumber,
            basePath: getFullPathForChildren(latestSummary),
            localPath,
        };
        return this.createChildCore(true, changeSequenceNumber, summary);
    }

    public createTrackingChildWithoutSummary(changeSequenceNumber: number): ITrackingSummarizerNode {
        return this.createChildCore(true, changeSequenceNumber);
    }
}
