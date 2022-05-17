/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
    SummaryObject,
} from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, unreachableCase } from "@fluidframework/common-utils";
import { mergeStats, convertToSummaryTree, calculateStats } from "../summaryUtils";
import { ReadAndParseBlob } from "../utils";
import {
    decodeSummary,
    encodeSummary,
    EncodeSummaryParam,
    EscapedPath,
    ICreateChildDetails,
    IInitialSummary,
    ISummarizerNodeRootContract,
    parseSummaryForSubtrees,
    parseSummaryTreeForSubtrees,
    RefreshSummaryResult,
    SummaryNode,
} from "./summarizerNodeUtils";

export interface IRootSummarizerNode extends ISummarizerNode, ISummarizerNodeRootContract {}

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
export class SummarizerNode implements IRootSummarizerNode {
    /**
     * The reference sequence number of the most recent acked summary.
     * Returns 0 if there is not yet an acked summary.
     */
    public get referenceSequenceNumber() {
        return this._latestSummary?.referenceSequenceNumber ?? 0;
    }

    protected readonly children = new Map<string, SummarizerNode>();
    protected readonly pendingSummaries = new Map<string, SummaryNode>();
    private readonly outstandingOps: ISequencedDocumentMessage[] = [];
    private wipReferenceSequenceNumber: number | undefined;
    private wipLocalPaths: { localPath: EscapedPath; additionalPath?: EscapedPath; } | undefined;
    private wipSkipRecursion = false;

    public startSummary(referenceSequenceNumber: number, summaryLogger: ITelemetryLogger) {
        assert(this.wipSummaryLogger === undefined,
            0x19f /* "wipSummaryLogger should not be set yet in startSummary" */);
        assert(this.wipReferenceSequenceNumber === undefined, 0x1a0 /* "Already tracking a summary" */);

        this.wipSummaryLogger = summaryLogger;

        for (const child of this.children.values()) {
            child.startSummary(referenceSequenceNumber, this.wipSummaryLogger);
        }
        this.wipReferenceSequenceNumber = referenceSequenceNumber;
    }

    public async summarize(fullTree: boolean): Promise<ISummarizeResult> {
        assert(this.isTrackingInProgress(), 0x1a1 /* "summarize should not be called when not tracking the summary" */);
        assert(this.wipSummaryLogger !== undefined,
            0x1a2 /* "wipSummaryLogger should have been set in startSummary or ctor" */);

        // Try to reuse the tree if unchanged
        if (this.canReuseHandle && !fullTree && !this.hasChanged()) {
            const latestSummary = this._latestSummary;
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
            if (result.pathPartsForChildren !== undefined) {
                this.wipLocalPaths.additionalPath = EscapedPath.createAndConcat(result.pathPartsForChildren);
            }
            return { summary: result.summary, stats: result.stats };
        } catch (error) {
            if (this.throwOnError || this.trackingSequenceNumber < this._changeSequenceNumber) {
                throw error;
            }
            const latestSummary = this._latestSummary;
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
            this.wipSummaryLogger.sendErrorEvent({
                eventName: "SummarizingWithBasePlusOps",
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

    /**
     * Complete the WIP summary for the given proposalHandle
     */
    public completeSummary(proposalHandle: string) {
        this.completeSummaryCore(proposalHandle, undefined, false);
    }

    /**
     * Recursive implementation for completeSummary, with additional internal-only parameters
     */
    protected completeSummaryCore(
        proposalHandle: string,
        parentPath: EscapedPath | undefined,
        parentSkipRecursion: boolean,
    ) {
        assert(this.wipSummaryLogger !== undefined,
            0x1a3 /* "wipSummaryLogger should have been set in startSummary or ctor" */);
        assert(this.wipReferenceSequenceNumber !== undefined, 0x1a4 /* "Not tracking a summary" */);
        let localPathsToUse = this.wipLocalPaths;

        if (parentSkipRecursion) {
            const latestSummary = this._latestSummary;
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
        assert(!!localPathsToUse, 0x1a5 /* "Tracked summary local paths not set" */);

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
        this.wipSummaryLogger = undefined;
        for (const child of this.children.values()) {
            child.clearSummary();
        }
    }

    /**
     * Refreshes the latest summary tracked by this node. If we have a pending summary for the given proposal handle,
     * it becomes the latest summary. If the current summary is already ahead (e.g., loaded from a service summary),
     * we skip the update. Otherwise, we get the snapshot by calling `getSnapshot` and update latest
     * summary based off of that.
     * @returns A RefreshSummaryResult type which returns information based on the following three scenarios:
     *          1. The latest summary was not udpated.
     *          2. The latest summary was updated and the summary corresponding to the params was being tracked.
     *          3. The latest summary was updated but the summary corresponding to the params was not tracked. In this
     *             case, the latest summary is updated based on the downloaded snapshot which is also returned.
     */
    public async refreshLatestSummary(
        proposalHandle: string | undefined,
        summaryRefSeq: number,
        getSnapshot: () => Promise<ISnapshotTree>,
        readAndParseBlob: ReadAndParseBlob,
        correlatedSummaryLogger: ITelemetryLogger,
    ): Promise<RefreshSummaryResult> {
        if (proposalHandle !== undefined) {
            const maybeSummaryNode = this.pendingSummaries.get(proposalHandle);

            if (maybeSummaryNode !== undefined) {
                this.refreshLatestSummaryFromPending(proposalHandle, maybeSummaryNode.referenceSequenceNumber);
                return { latestSummaryUpdated: true, wasSummaryTracked: true };
            }
        }

        // If we have seen a summary same or later as the current one, ignore it.
        if (this.referenceSequenceNumber >= summaryRefSeq) {
            return { latestSummaryUpdated: false };
        }

        const snapshotTree = await getSnapshot();
        await this.refreshLatestSummaryFromSnapshot(
            summaryRefSeq,
            snapshotTree,
            undefined,
            EscapedPath.create(""),
            correlatedSummaryLogger,
            readAndParseBlob,
        );
        return { latestSummaryUpdated: true, wasSummaryTracked: false, snapshot: snapshotTree };
    }

    protected refreshLatestSummaryFromPending(
        proposalHandle: string,
        referenceSequenceNumber: number,
    ): void {
        const summaryNode = this.pendingSummaries.get(proposalHandle);
        if (summaryNode === undefined) {
            // This should only happen if parent skipped recursion AND no prior summary existed.
            assert(
                this._latestSummary === undefined,
                0x1a6 /* "Not found pending summary, but this node has previously completed a summary" */,
            );
            return;
        } else {
            assert(
                referenceSequenceNumber === summaryNode.referenceSequenceNumber,
                // eslint-disable-next-line max-len
                0x1a7 /* `Pending summary reference sequence number should be consistent: ${summaryNode.referenceSequenceNumber} != ${referenceSequenceNumber}` */,
            );

            // Clear earlier pending summaries
            this.pendingSummaries.delete(proposalHandle);
        }

        this.refreshLatestSummaryCore(referenceSequenceNumber);

        this._latestSummary = summaryNode;

        // Propagate update to all child nodes
        for (const child of this.children.values()) {
            child.refreshLatestSummaryFromPending(proposalHandle, referenceSequenceNumber);
        }
    }

    protected async refreshLatestSummaryFromSnapshot(
        referenceSequenceNumber: number,
        snapshotTree: ISnapshotTree,
        basePath: EscapedPath | undefined,
        localPath: EscapedPath,
        correlatedSummaryLogger: ITelemetryLogger,
        readAndParseBlob: ReadAndParseBlob,
    ): Promise<void> {
        // Possible re-entrancy. If we have already seen a summary later than this one, ignore it.
        if (this.referenceSequenceNumber >= referenceSequenceNumber) {
            return;
        }

        this.refreshLatestSummaryCore(referenceSequenceNumber);

        const { baseSummary, pathParts } = decodeSummary(snapshotTree, correlatedSummaryLogger);

        this._latestSummary = new SummaryNode({
            referenceSequenceNumber,
            basePath,
            localPath,
        });

        const { childrenTree, childrenPathPart } = parseSummaryForSubtrees(baseSummary);
        if (childrenPathPart !== undefined) {
            pathParts.push(childrenPathPart);
        }

        if (pathParts.length > 0) {
            this._latestSummary.additionalPath = EscapedPath.createAndConcat(pathParts);
        }

        // Propagate update to all child nodes
        const pathForChildren = this._latestSummary.fullPathForChildren;
        await Promise.all(Array.from(this.children)
            .filter(([id]) => {
                // Assuming subtrees missing from snapshot are newer than the snapshot,
                // but might be nice to assert this using earliest seq for node.
                return childrenTree.trees[id] !== undefined;
            }).map(async ([id, child]) => {
                return child.refreshLatestSummaryFromSnapshot(
                    referenceSequenceNumber,
                    childrenTree.trees[id],
                    pathForChildren,
                    EscapedPath.create(id),
                    correlatedSummaryLogger,
                    readAndParseBlob,
                );
            }));
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

    public loadBaseSummaryWithoutDifferential(snapshot: ISnapshotTree) {
        // Check base summary to see if it has any additional path parts
        // separating child SummarizerNodes. Checks for .channels subtrees.
        const { childrenPathPart } = parseSummaryForSubtrees(snapshot);
        if (childrenPathPart !== undefined && this._latestSummary !== undefined) {
            this._latestSummary.additionalPath = EscapedPath.create(childrenPathPart);
        }
    }

    public async loadBaseSummary(
        snapshot: ISnapshotTree,
        readAndParseBlob: ReadAndParseBlob,
    ): Promise<{ baseSummary: ISnapshotTree; outstandingOps: ISequencedDocumentMessage[]; }> {
        const decodedSummary = decodeSummary(snapshot, this.defaultLogger);
        const outstandingOps = await decodedSummary.getOutstandingOps(readAndParseBlob);

        const { childrenPathPart } = parseSummaryForSubtrees(decodedSummary.baseSummary);
        if (childrenPathPart !== undefined) {
            decodedSummary.pathParts.push(childrenPathPart);
        }

        if (decodedSummary.pathParts.length > 0 && this._latestSummary !== undefined) {
            this._latestSummary.additionalPath = EscapedPath.createAndConcat(decodedSummary.pathParts);
        }

        // Defensive assertion: tracking number should already exceed this number.
        // This is probably a little excessive; can remove when stable.
        if (outstandingOps.length > 0) {
            const newOpsLatestSeq = outstandingOps[outstandingOps.length - 1].sequenceNumber;
            assert(
                newOpsLatestSeq <= this.trackingSequenceNumber,
                0x1a9 /* "When loading base summary, expected outstanding ops <= tracking sequence number" */,
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
                0x1aa /* `Out of order change recorded: ${lastOp.sequenceNumber} > ${op.sequenceNumber}` */,
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

    /**
     * True if a change has been recorded with sequence number exceeding
     * the latest successfully acked summary reference sequence number.
     * False implies that the previous summary can be reused.
     */
    protected hasChanged(): boolean {
        return this._changeSequenceNumber > this.referenceSequenceNumber;
    }

    public get latestSummary(): Readonly<SummaryNode> | undefined {
        return this._latestSummary;
    }

    private readonly canReuseHandle: boolean;
    private readonly throwOnError: boolean;
    /**
     * Sequence number of latest tracked op. This updates during recordChange,
     * but not for invalidate since we don't have the op. If this drifts from
     * changeSequenceNumber and we try to create a differential summary we assert.
     */
    private trackingSequenceNumber: number;

    /**
     * Do not call constructor directly.
     * Use createRootSummarizerNode to create root node, or createChild to create child nodes.
     */
    public constructor(
        protected readonly defaultLogger: ITelemetryLogger,
        private readonly summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
        config: ISummarizerNodeConfig,
        private _changeSequenceNumber: number,
        /** Undefined means created without summary */
        private _latestSummary?: SummaryNode,
        private readonly initialSummary?: IInitialSummary,
        protected wipSummaryLogger?: ITelemetryLogger,
    ) {
        this.canReuseHandle = config.canReuseHandle ?? true;
        // BUGBUG: Seeing issues with differential summaries.
        // this will disable them, and throw instead
        // while we continue to investigate
        this.throwOnError = true; // config.throwOnFailure ?? false;
        this.trackingSequenceNumber = this._changeSequenceNumber;
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
        assert(!this.children.has(id), 0x1ab /* "Create SummarizerNode child already exists" */);

        const createDetails: ICreateChildDetails = this.getCreateDetailsForChild(id, createParam);
        const child = new SummarizerNode(
            this.defaultLogger,
            summarizeInternalFn,
            config,
            createDetails.changeSequenceNumber,
            createDetails.latestSummary,
            createDetails.initialSummary,
            this.wipSummaryLogger,
        );

        // There may be additional state that has to be updated in this child. For example, if a summary is being
        // tracked, the child's summary tracking state needs to be updated too.
        this.maybeUpdateChildState(child);

        this.children.set(id, child);
        return child;
    }

    public getChild(id: string): ISummarizerNode | undefined {
        return this.children.get(id);
    }

    /**
     * Returns the details needed to create a child node.
     * @param id - Initial id or path part of the child node.
     * @param createParam - Information needed to create the node.
     * @returns the details needed to create the child node.
     */
    protected getCreateDetailsForChild(id: string, createParam: CreateChildSummarizerNodeParam): ICreateChildDetails {
        let initialSummary: IInitialSummary | undefined;
        let latestSummary: SummaryNode | undefined;
        let changeSequenceNumber: number;

        const parentLatestSummary = this._latestSummary;
        switch (createParam.type) {
            case CreateSummarizerNodeSource.FromAttach: {
                if (
                    parentLatestSummary !== undefined
                    && createParam.sequenceNumber <= parentLatestSummary.referenceSequenceNumber
                ) {
                    // Prioritize latest summary if it was after this node was attached.
                    latestSummary = parentLatestSummary.createForChild(id);
                } else {
                    const summary = convertToSummaryTree(createParam.snapshot) as ISummaryTreeWithStats;
                    initialSummary = {
                        sequenceNumber: createParam.sequenceNumber,
                        id,
                        summary,
                    };
                }
                changeSequenceNumber = createParam.sequenceNumber;
                break;
            }
            case CreateSummarizerNodeSource.FromSummary: {
                if (this.initialSummary === undefined) {
                    assert(
                        !!parentLatestSummary,
                        0x1ac /* "Cannot create child from summary if parent does not have latest summary" */);
                }
                // fallthrough to local
            }
            case CreateSummarizerNodeSource.Local: {
                const parentInitialSummary = this.initialSummary;
                if (parentInitialSummary !== undefined) {
                    let childSummary: SummaryObject | undefined;
                    if (parentInitialSummary.summary !== undefined) {
                        const { childrenTree } = parseSummaryTreeForSubtrees(parentInitialSummary.summary.summary);
                        assert(
                            childrenTree.type === SummaryType.Tree,
                            0x1d6 /* "Parent summary object is not a tree" */,
                        );
                        childSummary = childrenTree.tree[id];
                    }
                    if (createParam.type === CreateSummarizerNodeSource.FromSummary) {
                        // Locally created would not have differential subtree.
                        assert(!!childSummary, 0x1ad /* "Missing child summary tree" */);
                    }
                    let childSummaryWithStats: ISummaryTreeWithStats | undefined;
                    if (childSummary !== undefined) {
                        assert(
                            childSummary.type === SummaryType.Tree,
                            0x1ae /* "Child summary object is not a tree" */,
                        );
                        childSummaryWithStats = {
                            summary: childSummary,
                            stats: calculateStats(childSummary),
                        };
                    }
                    initialSummary = {
                        sequenceNumber: parentInitialSummary.sequenceNumber,
                        id,
                        summary: childSummaryWithStats,
                    };
                }
                latestSummary = parentLatestSummary?.createForChild(id);
                changeSequenceNumber = parentLatestSummary?.referenceSequenceNumber ?? -1;
                break;
            }
            default: {
                const type = (createParam as unknown as CreateChildSummarizerNodeParam).type;
                unreachableCase(createParam, `Unexpected CreateSummarizerNodeSource: ${type}`);
            }
        }

        return {
            initialSummary,
            latestSummary,
            changeSequenceNumber,
        };
    }

    /**
     * Updates the state of the child if required. For example, if a summary is currently being  tracked, the child's
     * summary tracking state needs to be updated too.
     * @param child - The child node whose state is to be updated.
     */
    protected maybeUpdateChildState(child: SummarizerNode) {
        // If we are tracking a summary, this child was created after the tracking started. So, we need to update the
        // child's tracking state as well.
        if (this.isTrackingInProgress()) {
            child.wipReferenceSequenceNumber = this.wipReferenceSequenceNumber;
        }
    }

    /**
     * Tells whether summary tracking is in progress. True if "startSummary" API is called before summarize.
     */
    protected isTrackingInProgress(): boolean {
        return this.wipReferenceSequenceNumber !== undefined;
    }
}

/**
 * Creates a root summarizer node.
 * @param logger - Logger to use within SummarizerNode
 * @param summarizeInternalFn - Function to generate summary
 * @param changeSequenceNumber - Sequence number of latest change to new node/subtree
 * @param referenceSequenceNumber - Reference sequence number of last acked summary,
 * or undefined if not loaded from summary
 * @param config - Configure behavior of summarizer node
 */
export const createRootSummarizerNode = (
    logger: ITelemetryLogger,
    summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
    changeSequenceNumber: number,
    referenceSequenceNumber: number | undefined,
    config: ISummarizerNodeConfig = {},
): IRootSummarizerNode => new SummarizerNode(
        logger,
        summarizeInternalFn,
        config,
        changeSequenceNumber,
        referenceSequenceNumber === undefined ? undefined : SummaryNode.createForRoot(referenceSequenceNumber),
    );
