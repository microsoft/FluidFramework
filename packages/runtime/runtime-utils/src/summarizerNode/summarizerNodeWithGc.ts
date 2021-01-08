/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { cloneGCData } from "@fluidframework/garbage-collector";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    CreateChildSummarizerNodeParam,
    gcBlobKey,
    IContextSummarizeResult,
    IGarbageCollectionData,
    IGarbageCollectionSummaryDetails,
    ISummarizeInternalResult,
    ISummarizerNodeConfig,
    ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions";
import { SummarizerNode } from "./summarizerNode";
import {
    EscapedPath,
    ICreateChildDetails,
    IInitialSummary,
    ISummarizerNodeRootContract,
    ReadAndParseBlob,
    SummaryNode,
} from "./summarizerNodeUtils";

export interface IRootSummarizerNodeWithGC extends ISummarizerNodeWithGC, ISummarizerNodeRootContract {}

// Extend SummaryNode to add used routes tracking to it.
class SummaryNodeWithGC extends SummaryNode {
    constructor(
        public readonly serializedUsedRoutes: string,
        summary: {
            readonly referenceSequenceNumber: number,
            readonly basePath: EscapedPath | undefined,
            readonly localPath: EscapedPath,
            additionalPath?: EscapedPath,
        },
    ) {
        super(summary);
    }
}

/**
 * Extends the functionality of SummarizerNode to manage this node's garbage collection data:
 * - Adds a new API `getGCData` to return GC data of this node.
 * - Caches the result of getGCData method to be used if nothing changes between summaries.
 * - Adds GC data to the result of summarize.
 * - Adds trackState param to summarize. If trackState is false, it bypasses the SummarizerNode and calls
 *   directly into summarizeInternal method.
 */
export class SummarizerNodeWithGC extends SummarizerNode implements IRootSummarizerNodeWithGC {
    private gcData: IGarbageCollectionData | undefined;

    // Tracks the work-in-progress used routes during summary.
    private wipSerializedUsedRoutes: string | undefined;

    // This is the last known used routes of this node as seen by the server as part of a summary.
    private referenceUsedRoutes: string[] | undefined;

    // The GC details of this node in the initial summary.
    private readonly gcDetailsInInitialSummaryP: LazyPromise<IGarbageCollectionSummaryDetails>;

    public get usedRoutes(): string[] {
        return this._usedRoutes;
    }

    /**
     * Do not call constructor directly.
     * Use createRootSummarizerNodeWithGC to create root node, or createChild to create child nodes.
     */
    public constructor(
        logger: ITelemetryLogger,
        private readonly summarizeFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
        config: ISummarizerNodeConfig,
        changeSequenceNumber: number,
        /** Undefined means created without summary */
        latestSummary?: SummaryNode,
        initialSummary?: IInitialSummary,
        wipSummaryLogger?: ITelemetryLogger,
        private readonly getGCDataFn?: () => Promise<IGarbageCollectionData>,
        getInitialGCSummaryDetailsFn?: () => Promise<IGarbageCollectionSummaryDetails>,
        private _usedRoutes: string[] = [],
    ) {
        super(
            logger,
            async (fullTree: boolean) => this.summarizeInternal(fullTree, true /* trackState */),
            config,
            changeSequenceNumber,
            latestSummary,
            initialSummary,
            wipSummaryLogger,
        );

        this.gcDetailsInInitialSummaryP = new LazyPromise(async () => {
            // back-compat: 0.32. getInitialGCSummaryDetailsFn() returns undefined in 0.31. Remove undefined check
            // when N > 34.
            const gcSummaryDetails = await getInitialGCSummaryDetailsFn?.();
            return gcSummaryDetails ?? { usedRoutes: [] };
        });
    }

    public async summarize(fullTree: boolean, trackState: boolean = true): Promise<IContextSummarizeResult> {
        // Update the reference used routes from the initial GC details. This is used to find out if the used routes has
        // changed from the last state seen by the server. If so, we cannot reuse previous summary.
        if (this.referenceUsedRoutes === undefined) {
            this.referenceUsedRoutes = (await this.gcDetailsInInitialSummaryP).usedRoutes;
        }

        // If trackState is true, get summary from base summarizer node which tracks summary state.
        // If trackState is false, get summary from summarizeInternal.
        if (trackState) {
            const summarizeResult = await super.summarize(fullTree);

            // If there is no cached GC data, return empty data in summarize result. It is the caller's responsiblity
            // to ensure that GC data is available by calling getGCData before calling summarize.
            const gcData = this.gcData !== undefined ? cloneGCData(this.gcData) : { gcNodes: {} };

            return {
                ...summarizeResult,
                gcData,
            };
        } else {
            return this.summarizeInternal(fullTree, trackState);
        }
    }

    private async summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        const summarizeResult = await this.summarizeFn(fullTree, trackState);
        // back-compat 0.31 - Older versions will not have GC data in summary.
        if (summarizeResult.gcData !== undefined) {
            this.gcData = cloneGCData(summarizeResult.gcData);
        }
        return summarizeResult;
    }

    /**
     * Returns the GC data of this node. If nothing has changed since the last time we summarized, it tries to reuse
     * existing data.
     */
    public async getGCData(): Promise<IGarbageCollectionData> {
        assert(this.getGCDataFn !== undefined, "GC data cannot be retrieved without getGCDataFn");

        if (!this.hasDataChanged()) {
            // There is no new data since last summary. If we have the GC data from previous run, return it.
            if (this.gcData !== undefined) {
                return cloneGCData(this.gcData);
            }

            // This is the first time GC data is requested in this client, so we need to get GC data from the initial
            // summary. Note: This info may not be available for clients with old summary. In such cases, we fall back
            // to getting GC data by calling getGCDataFn.
            const gcDataInInitialSummary = (await this.gcDetailsInInitialSummaryP).gcData;
            if (gcDataInInitialSummary !== undefined) {
                this.gcData = cloneGCData(gcDataInInitialSummary);
                return gcDataInInitialSummary;
            }
        }

        const gcData = await this.getGCDataFn();
        this.gcData = cloneGCData(gcData);
        return gcData;
    }

    /**
     * Called during the start of a summary. Updates the work-in-progress used routes.
     */
    public startSummary(referenceSequenceNumber: number, summaryLogger: ITelemetryLogger) {
        assert(this.wipSerializedUsedRoutes === undefined, "wip routes should not be set yet in startSummary");
        this.wipSerializedUsedRoutes = JSON.stringify(this.usedRoutes);
        super.startSummary(referenceSequenceNumber, summaryLogger);
    }

    /**
     * Called after summary has been uploaded to the server. Add the work-in-progress state to the pending
     * summary queue. We track this until we get an ack from the server for this summary.
     */
    protected completeSummaryCore(
        proposalHandle: string,
        parentPath: EscapedPath | undefined,
        parentSkipRecursion: boolean,
    ) {
        const wipSerializedUsedRoutes = this.wipSerializedUsedRoutes;
        assert(wipSerializedUsedRoutes !== undefined, "wip routes should have been set in startSummary");

        super.completeSummaryCore(proposalHandle, parentPath, parentSkipRecursion);

        const summaryNode = this.pendingSummaries.get(proposalHandle);
        if (summaryNode !== undefined) {
            const summaryNodeWithGC = new SummaryNodeWithGC(wipSerializedUsedRoutes, summaryNode);
            this.pendingSummaries.set(proposalHandle, summaryNodeWithGC);
        }
    }

    /**
     * Clears the work-in-progress state.
     */
    public clearSummary() {
        this.wipSerializedUsedRoutes = undefined;
        super.clearSummary();
    }

    /**
     * Called when we get an ack from the server for a summary we sent. Update the reference state of this node
     * from the state in the pending summary queue.
     */
    protected refreshLatestSummaryFromPending(
        proposalHandle: string,
        referenceSequenceNumber: number,
    ): void {
        const summaryNode = this.pendingSummaries.get(proposalHandle) as SummaryNodeWithGC;
        if (summaryNode !== undefined) {
            this.referenceUsedRoutes = JSON.parse(summaryNode.serializedUsedRoutes);
        }

        return super.refreshLatestSummaryFromPending(proposalHandle, referenceSequenceNumber);
    }

    /**
     * Called when we need to upload the reference state from the given summary. Read the GC blob and get the state
     * to upload from it.
     */
    protected async refreshLatestSummaryFromSnapshot(
        referenceSequenceNumber: number,
        snapshotTree: ISnapshotTree,
        basePath: EscapedPath | undefined,
        localPath: EscapedPath,
        correlatedSummaryLogger: ITelemetryLogger,
        readAndParseBlob: ReadAndParseBlob,
    ): Promise<void> {
        const gcDetailsBlob = snapshotTree.blobs[gcBlobKey];
        if (gcDetailsBlob !== undefined) {
            const gcDetails = await readAndParseBlob<IGarbageCollectionSummaryDetails>(gcDetailsBlob);

            // Possible re-entrancy. If we have already seen a summary later than this one, ignore it.
            if (this.referenceSequenceNumber >= referenceSequenceNumber) {
                return;
            }

            this.referenceUsedRoutes = gcDetails.usedRoutes;
        }

        return super.refreshLatestSummaryFromSnapshot(
            referenceSequenceNumber,
            snapshotTree,
            basePath,
            localPath,
            correlatedSummaryLogger,
            readAndParseBlob,
        );
    }

    /**
     * Override the createChild method to return an instance of SummarizerNodeWithGC.
     */
    public createChild(
        /** Summarize function */
        summarizeInternalFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
        /** Initial id or path part of this node */
        id: string,
        /**
         * Information needed to create the node.
         * If it is from a base summary, it will assert that a summary has been seen.
         * Attach information if it is created from an attach op.
         */
        createParam: CreateChildSummarizerNodeParam,
        config: ISummarizerNodeConfig = {},
        getGCDataFn?: () => Promise<IGarbageCollectionData>,
        getInitialGCSummaryDetailsFn?: () => Promise<IGarbageCollectionSummaryDetails>,
        usedRoutes?: string[],
    ): ISummarizerNodeWithGC {
        assert(!this.children.has(id), "Create SummarizerNode child already exists");

        const createDetails: ICreateChildDetails = this.getCreateDetailsForChild(id, createParam);
        const child = new SummarizerNodeWithGC(
            this.defaultLogger,
            summarizeInternalFn,
            config,
            createDetails.changeSequenceNumber,
            createDetails.latestSummary,
            createDetails.initialSummary,
            this.wipSummaryLogger,
            getGCDataFn,
            getInitialGCSummaryDetailsFn,
            usedRoutes,
        );

        // If a summary is in progress, update the child's work-in-progress state.
        if (this.isSummaryInProgress()) {
            this.updateChildWipState(child);
        }

        this.children.set(id, child);
        return child;
    }

    /**
     * Override the getChild method to return an instance of SummarizerNodeWithGC.
     */
    public getChild(id: string): ISummarizerNodeWithGC | undefined {
        return this.children.get(id) as SummarizerNodeWithGC;
    }

    public isReferenced(): boolean {
        return this.usedRoutes.includes("") || this.usedRoutes.includes("/");
    }

    public updateUsedRoutes(usedRoutes: string[]) {
        // Sort the given routes before updating. This will ensure that the routes compared in hasUsedStateChanged()
        // are in the same order.
        this._usedRoutes = usedRoutes.sort();
    }

    /**
     * Updates the work-in-progress state of the child if summary is in progress.
     * @param child - The child node to be updated.
     */
    protected updateChildWipState(child: SummarizerNodeWithGC) {
        // Update the child's work-in-progress used routes.
        child.wipSerializedUsedRoutes = JSON.stringify(child.usedRoutes);
        super.updateChildWipState(child);
    }

    /**
     * Override the hasChanged method. If this node data or its used state changed, the node is considered changed.
     */
    protected hasChanged(): boolean {
        return this.hasDataChanged() || this.hasUsedStateChanged();
    }

    /**
     * This tells whether the data in this node has changed or not.
     */
    private hasDataChanged(): boolean {
        return super.hasChanged();
    }

    /**
     * This tells whether the used state of this node has changed since last successful summary. If the used routes
     * of this node changed, its used state is considered changed. Basically, if this node or any of its child nodes
     * was previously used and became unused (or vice versa), its used state has changed.
     */
    private hasUsedStateChanged(): boolean {
        return this.referenceUsedRoutes === undefined ||
            JSON.stringify(this.usedRoutes) !== JSON.stringify(this.referenceUsedRoutes);
    }
}

/**
 * Creates a root summarizer node with GC functionality built-in.
 * @param logger - Logger to use within SummarizerNode
 * @param summarizeInternalFn - Function to generate summary
 * @param changeSequenceNumber - Sequence number of latest change to new node/subtree
 * @param referenceSequenceNumber - Reference sequence number of last acked summary,
 * or undefined if not loaded from summary
 * @param config - Configure behavior of summarizer node
 * @param getGCDataFn - Function to get the GC data of this node
 * @param gcDetailsInInitialSummaryP - Function to get the initial GC details of this node
 */
export const createRootSummarizerNodeWithGC = (
    logger: ITelemetryLogger,
    summarizeInternalFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
    changeSequenceNumber: number,
    referenceSequenceNumber: number | undefined,
    config: ISummarizerNodeConfig = {},
    getGCDataFn?: () => Promise<IGarbageCollectionData>,
    getInitialGCSummaryDetailsFn?: () => Promise<IGarbageCollectionSummaryDetails>,
): IRootSummarizerNodeWithGC => new SummarizerNodeWithGC(
    logger,
    summarizeInternalFn,
    config,
    changeSequenceNumber,
    referenceSequenceNumber === undefined ? undefined : SummaryNode.createForRoot(referenceSequenceNumber),
    undefined /* initialSummary */,
    undefined /* wipSummaryLogger */,
    getGCDataFn,
    getInitialGCSummaryDetailsFn,
    [""] /* usedRoutes */, // Add self route (empty string) because root node is always considered used.
);
