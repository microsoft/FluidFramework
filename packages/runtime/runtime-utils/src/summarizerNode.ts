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
import {
    ISequencedDocumentMessage,
    SummaryType,
    ISnapshotTree,
    IDocumentAttributes,
} from "@fluidframework/protocol-definitions";
import { mergeStats } from "./summaryUtils";

const baseSummaryTreeKey = ".baseSummary";
const outstandingOpsBlobKey = ".outstandingOps";
const maxDecodeDepth = 10000;

interface IDecodedSummary {
    readonly baseSummary: ISnapshotTree;
    readonly pathParts: string[];
}

type DecodeSummaryBodyResult = {
    readonly complete: true;
    readonly baseSummary: ISnapshotTree;
} | {
    readonly complete: false;
    readonly baseSummary: ISnapshotTree;
    readonly outstandingOpsBlob: string;
};

function decodeSummaryBody(baseSummary: ISnapshotTree, pathParts: string[]): DecodeSummaryBodyResult {
    const outstandingOpsBlob = baseSummary.blobs[outstandingOpsBlobKey];
    const newBaseSummary = baseSummary.trees[baseSummaryTreeKey];
    if (outstandingOpsBlob === undefined && newBaseSummary === undefined) {
        return { complete: true, baseSummary };
    }

    assert(outstandingOpsBlob, "Outstanding ops blob missing, but base summary tree exists");
    assert(newBaseSummary, "Base summary tree missing, but outstanding ops blob exists");
    pathParts.push(baseSummaryTreeKey);
    return { complete: false, baseSummary: newBaseSummary, outstandingOpsBlob };
}

function decodeSummaryWithoutOps(snapshot: ISnapshotTree): IDecodedSummary {
    let baseSummary = snapshot;
    const pathParts: string[] = [];

    for (let i = 0; i < maxDecodeDepth; i++) {
        const result = decodeSummaryBody(baseSummary, pathParts);
        baseSummary = result.baseSummary;
        if (result.complete) {
            return { baseSummary, pathParts };
        }
    }
    assert.fail("Exceeded max depth while decoding a base summary");
}

async function seqFromTree(
    tree: ISnapshotTree,
    readAndParseBlob: <T>(id: string) => Promise<T>,
): Promise<number> {
    const attributesHash =  tree.trees[".protocol"].blobs.attributes;
    const attrib = await readAndParseBlob<IDocumentAttributes>(attributesHash);
    return attrib.sequenceNumber;
}

interface IDecodedSummaryWithOps extends IDecodedSummary {
    readonly outstandingOps: ISequencedDocumentMessage[];
}

async function decodeSummary(
    snapshot: ISnapshotTree,
    readAndParseBlob: <T>(id: string) => Promise<T>,
): Promise<IDecodedSummaryWithOps> {
    let baseSummary = snapshot;
    const pathParts: string[] = [];
    let outstandingOps: ISequencedDocumentMessage[] = [];

    for (let i = 0; i < maxDecodeDepth; i++) {
        const result = decodeSummaryBody(baseSummary, pathParts);
        baseSummary = result.baseSummary;
        if (result.complete) {
            return { baseSummary, pathParts, outstandingOps };
        }

        const newOutstandingOps = await readAndParseBlob<ISequencedDocumentMessage[]>(result.outstandingOpsBlob);
        outstandingOps = newOutstandingOps.concat(outstandingOps); // prepend
    }
    assert.fail("Exceeded max depth while decoding a base summary");
}

class EscapedPath {
    private constructor(public readonly path: string) {}
    public static create(path: string): EscapedPath {
        return new EscapedPath(encodeURIComponent(path));
    }
    public static createAndConcat(pathParts: string[]): EscapedPath {
        let ret = EscapedPath.create(pathParts[0] ?? "");
        for (let i = 1; i < pathParts.length; i++) {
            ret = ret.concat(EscapedPath.create(pathParts[i]));
        }
        return ret;
    }
    public toString(): string {
        return this.path;
    }
    public concat(path: EscapedPath): EscapedPath {
        return new EscapedPath(`${this.path}/${path.path}`);
    }
}

interface IEncodedSummary extends ISummaryTreeWithStats {
    readonly additionalPath: EscapedPath;
}

interface ISummaryNode {
    readonly referenceSequenceNumber: number;
    readonly basePath: EscapedPath | undefined;
    readonly localPath: EscapedPath;
    /** Additional path for children nodes */
    additionalPath?: EscapedPath;
}

const getFullPath = (node: ISummaryNode): EscapedPath =>
    node.basePath?.concat(node.localPath) ?? node.localPath;
const getFullPathForChildren = (node: ISummaryNode): EscapedPath => {
    const fullPath = getFullPath(node);
    return node.additionalPath !== undefined ? fullPath.concat(node.additionalPath) : fullPath;
};

function encodeSummary(summaryNode: ISummaryNode, outstandingOps: ISequencedDocumentMessage[]): IEncodedSummary {
    const stats = mergeStats();
    stats.handleNodeCount++;
    stats.blobNodeCount++;
    stats.treeNodeCount++;
    let additionalPath = EscapedPath.create(baseSummaryTreeKey);
    if (summaryNode.additionalPath !== undefined) {
        additionalPath = additionalPath.concat(summaryNode.additionalPath);
    }
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
        additionalPath,
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

    private readonly children = new Map<string, SummarizerNode>();
    private readonly pendingSummaries = new Map<string, ISummaryNode>();
    private outstandingOps: ISequencedDocumentMessage[] = [];
    private wipReferenceSequenceNumber: number | undefined;
    private wipLocalPaths: { localPath: EscapedPath, additionalPath?: EscapedPath } | undefined;
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
                const stats = mergeStats();
                stats.handleNodeCount++;
                this.markReused();
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
            this.wipLocalPaths = { localPath: EscapedPath.create(result.id) };
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
                localPath: latestSummary.localPath,
                additionalPath: summary.additionalPath,
            };
            this.wipIsFailure = true;
            return { summary: summary.summary, stats: summary.stats };
        }
    }

    private markReused(): void {
        const latestSummary = this.latestSummary;
        assert(latestSummary, "Latest summary should exist if summary of this or parent node is reused");
        this.wipLocalPaths = {
            localPath: latestSummary.localPath,
            additionalPath: latestSummary.additionalPath,
        };
        for (const child of this.children.values()) {
            child.markReused();
        }
    }

    public completeSummary(proposalHandle: string) {
        this.completeSummaryCore(proposalHandle);
    }

    private completeSummaryCore(proposalHandle: string, parentPath?: EscapedPath, parentIsFailure = false) {
        assert(this.wipReferenceSequenceNumber, "Not tracking a summary");
        let localPathsToUse = this.wipLocalPaths;

        if (parentIsFailure === true) {
            const latestSummary = this.latestSummary;
            if (latestSummary !== undefined) {
                // This case the parent node created a failure summary.
                // This node and all children should only try to reference their last
                // good state.
                localPathsToUse = {
                    localPath: latestSummary.localPath,
                    additionalPath: latestSummary.additionalPath,
                };
            } else {
                // This case the child is added after the latest non-failure summary.
                // This node and all children should consider themselves as still not
                // having a successful summary yet.
                this.clearSummary();
                return;
            }
        }

        // This should come from wipLocalPaths in normal cases, or from the latestSummary
        // if parentIsFailure is true. If there is no latestSummary, clearSummary and
        // return before reaching this code.
        assert(localPathsToUse, "Tracked summary local paths not set");

        const summary: ISummaryNode = {
            ...localPathsToUse,
            referenceSequenceNumber: this.wipReferenceSequenceNumber,
            basePath: parentPath,
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

    public async refreshLatestSummary(
        proposalHandle: string | undefined,
        getSnapshot: () => Promise<ISnapshotTree>,
        readAndParseBlob: <T>(id: string) => Promise<T>,
    ): Promise<void> {
        if (proposalHandle !== undefined) {
            const maybeSummaryNode = this.pendingSummaries.get(proposalHandle);

            if (maybeSummaryNode !== undefined) {
                this.refreshLatestSummaryFromPending(proposalHandle, maybeSummaryNode.referenceSequenceNumber);
                return;
            }
        }

        const snapshotTree = await getSnapshot();
        const referenceSequenceNumber = await seqFromTree(snapshotTree, readAndParseBlob);
        this.refreshLatestSummaryFromSnapshot(
            referenceSequenceNumber,
            snapshotTree,
            undefined,
            EscapedPath.create(""),
        );
    }

    private refreshLatestSummaryFromPending(
        proposalHandle: string,
        referenceSequenceNumber: number,
    ): void {
        const summaryNode = this.pendingSummaries.get(proposalHandle);
        if (summaryNode === undefined) {
            assert.strictEqual(
                this.latestSummary,
                undefined,
                "Not found pending summary, but this node has previously completed a summary",
            );
            return;
        } else {
            assert.strictEqual(
                referenceSequenceNumber,
                summaryNode.referenceSequenceNumber,
                // eslint-disable-next-line max-len
                `Pending summary reference sequence number should be consistent: ${summaryNode.referenceSequenceNumber} != ${referenceSequenceNumber}`,
            );

            // Clear earlier pending summaries
            this.pendingSummaries.delete(proposalHandle);
        }

        this.refreshLatestSummaryCore(referenceSequenceNumber);

        this.latestSummary = summaryNode;

        // Propagate update to all child nodes
        for (const child of this.children.values()) {
            child.refreshLatestSummaryFromPending(proposalHandle, referenceSequenceNumber);
        }
    }

    private refreshLatestSummaryFromSnapshot(
        referenceSequenceNumber: number,
        snapshotTree: ISnapshotTree,
        basePath: EscapedPath | undefined,
        localPath: EscapedPath,
    ): void {
        this.refreshLatestSummaryCore(referenceSequenceNumber);

        const { baseSummary, pathParts } = decodeSummaryWithoutOps(snapshotTree);

        this.latestSummary = {
            referenceSequenceNumber,
            basePath,
            localPath,
        };
        if (pathParts.length > 0) {
            this.latestSummary.additionalPath = EscapedPath.createAndConcat(pathParts);
        }

        // Propagate update to all child nodes
        const pathForChildren = getFullPathForChildren(this.latestSummary);
        for (const [id, child] of this.children.entries()) {
            const subtree = baseSummary.trees[id];
            // Assuming subtrees missing from snapshot are newer than the snapshot,
            // but might be nice to assert this using earliest seq for node.
            if (subtree !== undefined) {
                child.refreshLatestSummaryFromSnapshot(
                    referenceSequenceNumber,
                    subtree,
                    pathForChildren,
                    EscapedPath.create(id),
                );
            }
        }
    }

    private refreshLatestSummaryCore(referenceSequenceNumber: number): void {
        for (const [key, value] of this.pendingSummaries) {
            if (value.referenceSequenceNumber < referenceSequenceNumber) {
                this.pendingSummaries.delete(key);
            }
        }

        // Clear earlier outstanding ops
        while (
            this.outstandingOps.length > 0
            && this.outstandingOps[0].sequenceNumber <= referenceSequenceNumber
        ) {
            this.outstandingOps.shift();
        }
    }

    public async loadBaseSummary(
        snapshot: ISnapshotTree,
        readAndParseBlob: <T>(id: string) => Promise<T>,
    ): Promise<ISnapshotTree> {
        const decodedSummary = await decodeSummary(snapshot, readAndParseBlob);

        if (decodedSummary.outstandingOps.length > 0) {
            this.prependOutstandingOps(decodedSummary.pathParts, decodedSummary.outstandingOps);
        }

        return decodedSummary.baseSummary;
    }

    private prependOutstandingOps(pathPartsForChildren: string[], ops: ISequencedDocumentMessage[]): void {
        assert(this.trackChanges, "Should not prepend outstanding ops when trackChanges is disabled");
        assert(this.latestSummary, "Should have latest summary defined to prepend outstanding ops");
        if (pathPartsForChildren.length > 0) {
            this.latestSummary.additionalPath = EscapedPath.createAndConcat(pathPartsForChildren);
        }
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
        assert(this.trackChanges, "Should not record changes when trackChanges is disabled");
        const lastOp = this.outstandingOps[this.outstandingOps.length - 1];
        if (lastOp !== undefined) {
            assert(
                lastOp.sequenceNumber < op.sequenceNumber,
                `Out of order change recorded: ${lastOp.sequenceNumber} > ${op.sequenceNumber}`,
            );
        }
        this.invalidate(op.sequenceNumber);
        this.outstandingOps.push(op);
    }

    public invalidate(sequenceNumber: number): void {
        if (sequenceNumber > this._changeSequenceNumber) {
            this._changeSequenceNumber = sequenceNumber;
        }
    }

    public hasChanged(): boolean {
        return this._changeSequenceNumber > this.referenceSequenceNumber;
    }

    private constructor(
        private readonly trackChanges: boolean,
        private _changeSequenceNumber: number,
        /** Undefined means created without summary */
        private latestSummary?: ISummaryNode,
    ) {}

    public static createRootWithoutSummary(changeSequenceNumber: number): SummarizerNode {
        return new SummarizerNode(
            true,
            changeSequenceNumber,
            undefined,
        );
    }

    public static createRootFromSummary(
        changeSequenceNumber: number,
        referenceSequenceNumber: number,
    ): SummarizerNode {
        return new SummarizerNode(
            true,
            changeSequenceNumber,
            {
                referenceSequenceNumber,
                basePath: undefined,
                localPath: EscapedPath.create(""), // root hard-coded to ""
            },
        );
    }

    private createChildCore(
        trackChanges: boolean,
        changeSequenceNumber: number,
        id: string,
    ): SummarizerNode {
        let summary: ISummaryNode | undefined;
        if (this.latestSummary !== undefined && changeSequenceNumber <= this.latestSummary.referenceSequenceNumber) {
            summary = {
                referenceSequenceNumber: this.latestSummary.referenceSequenceNumber,
                basePath: getFullPathForChildren(this.latestSummary),
                localPath: EscapedPath.create(id),
            };
        }
        const child = new SummarizerNode(
            trackChanges,
            changeSequenceNumber,
            summary,
        );
        // If created while summarizing, relay that information down
        if (this.wipReferenceSequenceNumber !== undefined) {
            child.wipReferenceSequenceNumber = this.wipReferenceSequenceNumber;
        }
        this.children.set(id, child);
        return child;
    }

    public createChild(
        changeSequenceNumber: number,
        id: string,
    ): ISummarizerNode {
        return this.createChildCore(false, changeSequenceNumber, id);
    }

    public createTrackingChild(
        changeSequenceNumber: number,
        id: string,
    ): ITrackingSummarizerNode {
        return this.createChildCore(true, changeSequenceNumber, id);
    }
}
