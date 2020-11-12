/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISummarizerNode,
    ISummarizerNodeConfig,
    ISummarizeInternalResult,
    ISummarizeResult,
    ISummaryTreeWithStats,
    CreateChildSummarizerNodeParam,
    CreateSummarizerNodeSource,
} from "@fluidframework/runtime-definitions";
import {
    ISequencedDocumentMessage,
    SummaryType,
    ISnapshotTree,
    IDocumentAttributes,
} from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, unreachableCase } from "@fluidframework/common-utils";
import { mergeStats, SummaryTreeBuilder, convertToSummaryTree, calculateStats } from "./summaryUtils";

const baseSummaryTreeKey = "_baseSummary";
const outstandingOpsBlobKey = "_outstandingOps";
const maxDecodeDepth = 100;

/** Reads a blob from storage and parses it from JSON. */
export type ReadAndParseBlob = <T>(id: string) => Promise<T>;

/**
 * Fetches the sequence number of the snapshot tree by examining the protocol.
 * @param tree - snapshot tree to examine
 * @param readAndParseBlob - function to read blob contents from storage
 * and parse the result from JSON.
 */
async function seqFromTree(
    tree: ISnapshotTree,
    readAndParseBlob: ReadAndParseBlob,
): Promise<number> {
    const attributesHash = tree.trees[".protocol"].blobs.attributes;
    const attrib = await readAndParseBlob<IDocumentAttributes>(attributesHash);
    return attrib.sequenceNumber;
}

/** Path for nodes in a tree with escaped special characters */
class EscapedPath {
    private constructor(public readonly path: string) { }
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

/** Information about a summary relevant to a specific node in the tree */
class SummaryNode {
    public get referenceSequenceNumber(): number {
        return this.summary.referenceSequenceNumber;
    }
    public get basePath(): EscapedPath | undefined {
        return this.summary.basePath;
    }
    public get localPath(): EscapedPath {
        return this.summary.localPath;
    }
    public get additionalPath(): EscapedPath | undefined {
        return this.summary.additionalPath;
    }
    public set additionalPath(additionalPath: EscapedPath | undefined) {
        this.summary.additionalPath = additionalPath;
    }
    constructor(private readonly summary: {
        readonly referenceSequenceNumber: number,
        readonly basePath: EscapedPath | undefined,
        readonly localPath: EscapedPath,
        additionalPath?: EscapedPath,
    }) { }

    public get fullPath(): EscapedPath {
        return this.basePath?.concat(this.localPath) ?? this.localPath;
    }

    public get fullPathForChildren(): EscapedPath {
        return this.additionalPath !== undefined
            ? this.fullPath.concat(this.additionalPath)
            : this.fullPath;
    }

    public createForChild(id: string): SummaryNode {
        return new SummaryNode({
            referenceSequenceNumber: this.referenceSequenceNumber,
            basePath: this.fullPathForChildren,
            localPath: EscapedPath.create(id),
        });
    }
}

interface IDecodedSummary {
    readonly baseSummary: ISnapshotTree;
    readonly pathParts: string[];
    getOutstandingOps(readAndParseBlob: ReadAndParseBlob): Promise<ISequencedDocumentMessage[]>;
}

/**
 * Checks if the snapshot is created by referencing a previous successful
 * summary plus outstanding ops. If so, it will recursively "decode" it until
 * it gets to the last successful summary (the base summary) and returns that
 * as well as a function for fetching the outstanding ops. Also returns the
 * full path to the previous base summary for child summarizer nodes to use as
 * their base path when necessary.
 * @param snapshot - snapshot tree to decode
 */
function decodeSummary(snapshot: ISnapshotTree, logger: Pick<ITelemetryLogger, "sendTelemetryEvent">): IDecodedSummary {
    let baseSummary = snapshot;
    const pathParts: string[] = [];
    const opsBlobs: string[] = [];

    for (let i = 0; ; i++) {
        if (i > maxDecodeDepth) {
            logger.sendTelemetryEvent({
                eventName: "DecodeSummaryMaxDepth",
                maxDecodeDepth,
            });
        }
        const outstandingOpsBlob = baseSummary.blobs[outstandingOpsBlobKey];
        const newBaseSummary = baseSummary.trees[baseSummaryTreeKey];
        if (outstandingOpsBlob === undefined && newBaseSummary === undefined) {
            return {
                baseSummary,
                pathParts,
                async getOutstandingOps(readAndParseBlob: ReadAndParseBlob) {
                    let outstandingOps: ISequencedDocumentMessage[] = [];
                    for (const opsBlob of opsBlobs) {
                        const newOutstandingOps = await readAndParseBlob<ISequencedDocumentMessage[]>(opsBlob);
                        if (outstandingOps.length > 0 && newOutstandingOps.length > 0) {
                            const latestSeq = outstandingOps[outstandingOps.length - 1].sequenceNumber;
                            const newEarliestSeq = newOutstandingOps[0].sequenceNumber;
                            if (newEarliestSeq <= latestSeq) {
                                logger.sendTelemetryEvent({
                                    eventName:"DuplicateOutstandingOps",
                                    category: "generic",
                                    // eslint-disable-next-line max-len
                                    message: `newEarliestSeq <= latestSeq in decodeSummary: ${newEarliestSeq} <= ${latestSeq}`,
                                });
                                while (newOutstandingOps.length > 0
                                    && newOutstandingOps[0].sequenceNumber <= latestSeq) {
                                    newOutstandingOps.shift();
                                }
                            }
                        }
                        outstandingOps = outstandingOps.concat(newOutstandingOps);
                    }
                    return outstandingOps;
                },
            };
        }

        assert(!!outstandingOpsBlob, "Outstanding ops blob missing, but base summary tree exists");
        assert(newBaseSummary !== undefined, "Base summary tree missing, but outstanding ops blob exists");
        baseSummary = newBaseSummary;
        pathParts.push(baseSummaryTreeKey);
        opsBlobs.unshift(outstandingOpsBlob);
    }
}

/**
 * Summary tree which is a handle of the previous successfully acked summary
 * and a blob of the outstanding ops since that summary.
 */
interface IEncodedSummary extends ISummaryTreeWithStats {
    readonly additionalPath: EscapedPath;
}

type EncodeSummaryParam = {
    fromSummary: true;
    summaryNode: SummaryNode;
} | {
    fromSummary: false;
    initialSummary: ISummaryTreeWithStats;
};

/**
 * Creates a summary tree which is a handle of the previous successfully acked summary
 * and a blob of the outstanding ops since that summary. If there is no acked summary yet,
 * it will create with the tree found in the initial attach op and the blob of outstanding ops.
 * @param summaryParam - information about last acked summary and paths to encode if from summary,
 * otherwise the initial summary from the attach op.
 * @param outstandingOps - outstanding ops since last acked summary
 */
function encodeSummary(summaryParam: EncodeSummaryParam, outstandingOps: ISequencedDocumentMessage[]): IEncodedSummary {
    let additionalPath = EscapedPath.create(baseSummaryTreeKey);

    const builder = new SummaryTreeBuilder();
    builder.addBlob(outstandingOpsBlobKey, JSON.stringify(outstandingOps));

    if (summaryParam.fromSummary) {
        // Create using handle of latest acked summary
        const summaryNode = summaryParam.summaryNode;
        if (summaryNode.additionalPath !== undefined) {
            additionalPath = additionalPath.concat(summaryNode.additionalPath);
        }
        builder.addHandle(baseSummaryTreeKey, SummaryType.Tree, summaryNode.fullPath.path);
    } else {
        // Create using initial summary from attach op
        builder.addWithStats(baseSummaryTreeKey, summaryParam.initialSummary);
    }

    const summary = builder.getSummaryTree();
    return {
        ...summary,
        additionalPath,
    };
}

interface IInitialSummary {
    sequenceNumber: number;
    id: string;
    summary: ISummaryTreeWithStats | undefined;
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
export class SummarizerNode implements ISummarizerNode {
    /**
     * The reference sequence number of the most recent acked summary.
     * Returns 0 if there is not yet an acked summary.
     */
    public get referenceSequenceNumber() {
        return this.latestSummary?.referenceSequenceNumber ?? 0;
    }

    private readonly children = new Map<string, SummarizerNode>();
    private readonly pendingSummaries = new Map<string, SummaryNode>();
    private readonly outstandingOps: ISequencedDocumentMessage[] = [];
    private wipReferenceSequenceNumber: number | undefined;
    private wipLocalPaths: { localPath: EscapedPath, additionalPath?: EscapedPath } | undefined;
    private wipSkipRecursion = false;

    public startSummary(referenceSequenceNumber: number) {
        assert(
            this.wipReferenceSequenceNumber === undefined,
            "Already tracking a summary",
        );

        for (const child of this.children.values()) {
            child.startSummary(referenceSequenceNumber);
        }
        this.wipReferenceSequenceNumber = referenceSequenceNumber;
    }

    public async summarize(fullTree: boolean): Promise<ISummarizeResult> {
        // Try to reuse the tree if unchanged
        if (this.canReuseHandle && !fullTree && !this.hasChanged()) {
            const latestSummary = this.latestSummary;
            if (latestSummary !== undefined) {
                this.wipLocalPaths = {
                    localPath: latestSummary.localPath,
                    additionalPath: latestSummary.additionalPath,
                };
                this.wipSkipRecursion = true;
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
            const result = await this.summarizeInternalFn(fullTree);
            this.wipLocalPaths = { localPath: EscapedPath.create(result.id) };
            return { summary: result.summary, stats: result.stats };
        } catch (error) {
            if (this.throwOnError || this.trackingSequenceNumber < this._changeSequenceNumber) {
                throw error;
            }
            const latestSummary = this.latestSummary;
            const initialSummary = this.initialSummary;

            let encodeParam: EncodeSummaryParam;
            let localPath: EscapedPath;
            if (latestSummary !== undefined) {
                // Create using handle of latest acked summary
                encodeParam = {
                    fromSummary: true,
                    summaryNode: latestSummary,
                };
                localPath = latestSummary.localPath;
            } else if (initialSummary?.summary !== undefined) {
                // Create using initial summary from attach op
                encodeParam = {
                    fromSummary: false,
                    initialSummary: initialSummary.summary,
                };
                localPath = EscapedPath.create(initialSummary.id);
            } else {
                // No base summary to reference
                throw error;
            }
            this.logger.logException({
                eventName: "SummarizingWithBasePlusOps",
                category: "error",
            },
            error);
            const summary = encodeSummary(encodeParam, this.outstandingOps);
            this.wipLocalPaths = {
                localPath,
                additionalPath: summary.additionalPath,
            };
            this.wipSkipRecursion = true;
            return { summary: summary.summary, stats: summary.stats };
        }
    }

    public completeSummary(proposalHandle: string) {
        this.completeSummaryCore(proposalHandle, undefined, false);
    }

    private completeSummaryCore(
        proposalHandle: string,
        parentPath: EscapedPath | undefined,
        parentSkipRecursion: boolean,
    ) {
        assert(this.wipReferenceSequenceNumber !== undefined, "Not tracking a summary");
        let localPathsToUse = this.wipLocalPaths;

        if (parentSkipRecursion) {
            const latestSummary = this.latestSummary;
            if (latestSummary !== undefined) {
                // This case the parent node created a failure summary or was reused.
                // This node and all children should only try to reference their path
                // by its last known good state in the actual summary tree.
                // If parent fails or is reused, the child summarize is not called so
                // it did not get a chance to change its paths.
                // In this case, essentially only propagate the new summary ref seq num.
                localPathsToUse = {
                    localPath: latestSummary.localPath,
                    additionalPath: latestSummary.additionalPath,
                };
            } else {
                // This case the child is added after the latest non-failure summary.
                // This node and all children should consider themselves as still not
                // having a successful summary yet.
                // We cannot "reuse" this node if unchanged since that summary, because
                // handles will be unable to point to that node. It never made it to the
                // tree itself, and only exists as an attach op in the _outstandingOps.
                this.clearSummary();
                return;
            }
        }

        // This should come from wipLocalPaths in normal cases, or from the latestSummary
        // if parentIsFailure or parentIsReused is true.
        // If there is no latestSummary, clearSummary and return before reaching this code.
        assert(!!localPathsToUse, "Tracked summary local paths not set");

        const summary = new SummaryNode({
            ...localPathsToUse,
            referenceSequenceNumber: this.wipReferenceSequenceNumber,
            basePath: parentPath,
        });
        const fullPathForChildren = summary.fullPathForChildren;
        for (const child of this.children.values()) {
            child.completeSummaryCore(
                proposalHandle,
                fullPathForChildren,
                this.wipSkipRecursion || parentSkipRecursion,
            );
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
        this.wipSkipRecursion = false;
        for (const child of this.children.values()) {
            child.clearSummary();
        }
    }

    public async refreshLatestSummary(
        proposalHandle: string | undefined,
        getSnapshot: () => Promise<ISnapshotTree>,
        readAndParseBlob: ReadAndParseBlob,
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
            // This should only happen if parent skipped recursion AND no prior summary existed.
            assert(
                this.latestSummary === undefined,
                "Not found pending summary, but this node has previously completed a summary",
            );
            return;
        } else {
            assert(
                referenceSequenceNumber === summaryNode.referenceSequenceNumber,
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

        const { baseSummary, pathParts } = decodeSummary(snapshotTree, this.logger);

        this.latestSummary = new SummaryNode({
            referenceSequenceNumber,
            basePath,
            localPath,
        });
        if (pathParts.length > 0) {
            this.latestSummary.additionalPath = EscapedPath.createAndConcat(pathParts);
        }

        // Propagate update to all child nodes
        const pathForChildren = this.latestSummary.fullPathForChildren;
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
        readAndParseBlob: ReadAndParseBlob,
    ): Promise<{ baseSummary: ISnapshotTree, outstandingOps: ISequencedDocumentMessage[] }> {
        const decodedSummary = decodeSummary(snapshot, this.logger);
        const outstandingOps = await decodedSummary.getOutstandingOps(readAndParseBlob);

        if (outstandingOps.length > 0) {
            assert(!!this.latestSummary, "Should have latest summary defined if any outstanding ops found");
            this.latestSummary.additionalPath = EscapedPath.createAndConcat(decodedSummary.pathParts);

            // Defensive: tracking number should already exceed this number.
            // This is probably a little excessive; can remove when stable.
            const newOpsLatestSeq = outstandingOps[outstandingOps.length - 1].sequenceNumber;
            assert(
                newOpsLatestSeq <= this.trackingSequenceNumber,
                "When loading base summary, expected outstanding ops <= tracking sequence number",
            );
        }

        return {
            baseSummary: decodedSummary.baseSummary,
            outstandingOps,
        };
    }

    public recordChange(op: ISequencedDocumentMessage): void {
        const lastOp = this.outstandingOps[this.outstandingOps.length - 1];
        if (lastOp !== undefined) {
            assert(
                lastOp.sequenceNumber < op.sequenceNumber,
                `Out of order change recorded: ${lastOp.sequenceNumber} > ${op.sequenceNumber}`,
            );
        }
        this.invalidate(op.sequenceNumber);
        this.trackingSequenceNumber = op.sequenceNumber;
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

    private readonly canReuseHandle: boolean;
    private readonly throwOnError: boolean;
    private trackingSequenceNumber: number;
    private constructor(
        private readonly logger: ITelemetryLogger,
        private readonly summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
        config: ISummarizerNodeConfig,
        private _changeSequenceNumber: number,
        /** Undefined means created without summary */
        private latestSummary?: SummaryNode,
        private readonly initialSummary?: IInitialSummary,
    ) {
        this.canReuseHandle = config.canReuseHandle ?? true;
        // BUGBUG: Seeing issues with differential summaries.
        // this will disable them, and throw instead
        // while we continue to investigate
        this.throwOnError = true; // config.throwOnFailure ?? false;
        this.trackingSequenceNumber = this._changeSequenceNumber;
    }

    public static createRoot(
        logger: ITelemetryLogger,
        /** Summarize function */
        summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
        /** Sequence number of latest change to new node/subtree */
        changeSequenceNumber: number,
        /**
         * Reference sequence number of last acked summary,
         * or undefined if not loaded from summary.
         */
        referenceSequenceNumber: number | undefined,
        config: ISummarizerNodeConfig = {},
    ): SummarizerNode {
        const maybeSummaryNode = referenceSequenceNumber === undefined ? undefined : new SummaryNode({
            referenceSequenceNumber,
            basePath: undefined,
            localPath: EscapedPath.create(""), // root hard-coded to ""
        });
        return new SummarizerNode(
            logger,
            summarizeInternalFn,
            config,
            changeSequenceNumber,
            maybeSummaryNode,
        );
    }

    public createChild(
        /** Summarize function */
        summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
        /** Initial id or path part of this node */
        id: string,
        /**
         * Information needed to create the node.
         * If it is from a base summary, it will assert that a summary has been seen.
         * Attach information if it is created from an attach op.
         */
        createParam: CreateChildSummarizerNodeParam,
        config: ISummarizerNodeConfig = {},
    ): ISummarizerNode {
        assert(!this.children.has(id), "Create SummarizerNode child already exists");

        const latestSummary = this.latestSummary;
        let child: SummarizerNode;
        switch (createParam.type) {
            case CreateSummarizerNodeSource.FromAttach: {
                let summaryNode: SummaryNode | undefined;
                let initialSummary: IInitialSummary | undefined;
                if (
                    latestSummary !== undefined
                    && createParam.sequenceNumber <= latestSummary.referenceSequenceNumber
                ) {
                    // Prioritize latest summary if it was after this node was attached.
                    summaryNode = latestSummary.createForChild(id);
                } else {
                    const summary = convertToSummaryTree(createParam.snapshot) as ISummaryTreeWithStats;
                    initialSummary = {
                        sequenceNumber: createParam.sequenceNumber,
                        id,
                        summary,
                    };
                }
                child = new SummarizerNode(
                    this.logger,
                    summarizeInternalFn,
                    config,
                    createParam.sequenceNumber,
                    summaryNode,
                    initialSummary,
                );
                break;
            }
            case CreateSummarizerNodeSource.FromSummary: {
                if (this.initialSummary === undefined) {
                    assert(!!latestSummary, "Cannot create child from summary if parent does not have latest summary");
                }
                // fallthrough to local
            }
            case CreateSummarizerNodeSource.Local: {
                const initialSummary = this.initialSummary;
                let childInitialSummary: IInitialSummary | undefined;
                if (initialSummary !== undefined) {
                    const childSummary = initialSummary.summary?.summary.tree[id];
                    if (createParam.type === CreateSummarizerNodeSource.FromSummary) {
                        // Locally created would not have subtree.
                        assert(!!childSummary, "Missing child summary tree");
                    }
                    let childSummaryWithStats: ISummaryTreeWithStats | undefined;
                    if (childSummary !== undefined) {
                        assert(
                            childSummary.type === SummaryType.Tree,
                            "Child summary object is not a tree",
                        );
                        childSummaryWithStats = {
                            summary: childSummary,
                            stats: calculateStats(childSummary),
                        };
                    }
                    childInitialSummary = {
                        sequenceNumber: initialSummary.sequenceNumber,
                        id,
                        summary: childSummaryWithStats,
                    };
                }
                child = new SummarizerNode(
                    this.logger,
                    summarizeInternalFn,
                    config,
                    latestSummary?.referenceSequenceNumber ?? -1,
                    latestSummary?.createForChild(id),
                    childInitialSummary,
                );
                break;
            }
            default: {
                const type = (createParam as unknown as CreateChildSummarizerNodeParam).type;
                unreachableCase(createParam, `Unexpected CreateSummarizerNodeSource: ${type}`);
            }
        }

        // If created while summarizing, relay that information down
        if (this.wipReferenceSequenceNumber !== undefined) {
            child.wipReferenceSequenceNumber = this.wipReferenceSequenceNumber;
        }
        this.children.set(id, child);
        return child;
    }

    public getChild(id: string): ISummarizerNode | undefined {
        return this.children.get(id);
    }
}
