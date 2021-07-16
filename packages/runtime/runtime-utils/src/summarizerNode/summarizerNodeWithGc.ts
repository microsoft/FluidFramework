/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
    ISummarizerNodeConfigWithGC,
    ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions";
import { ReadAndParseBlob } from "../utils";
import { SummarizerNode } from "./summarizerNode";
import {
    EscapedPath,
    ICreateChildDetails,
    IInitialSummary,
    ISummarizerNodeRootContract,
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
 * - Caches the result of `getGCData` to be used if nothing changes between summaries.
 * - Adds GC data to the result of summarize.
 * - Manages the used routes of this node. These are used to identify if this node is referenced in the document
 *   and to determine if the node's used state changed since last summary.
 * - Adds trackState param to summarize. If trackState is false, it bypasses the SummarizerNode and calls
 *   directly into summarizeInternal method.
 */
export class SummarizerNodeWithGC extends SummarizerNode implements IRootSummarizerNodeWithGC {
    // Tracks the work-in-progress used routes during summary.
    private wipSerializedUsedRoutes: string | undefined;

    // This is the last known used routes of this node as seen by the server as part of a summary.
    private referenceUsedRoutes: string[] | undefined;

    // The GC details of this node in the initial summary.
    private readonly gcDetailsInInitialSummaryP: LazyPromise<IGarbageCollectionSummaryDetails>;

    private _gcData: IGarbageCollectionData | undefined;
    public get gcData(): IGarbageCollectionData | undefined {
        return this._gcData;
    }

    // Set used routes to have self route by default. This makes the node referenced by default. This is done to ensure
    // that this node is not marked as collected when running GC has been disabled. Once, the option to disable GC is
    // removed (from runGC flag in IContainerRuntimeOptions), this should be changed to be have no routes by default.
    private _usedRoutes: string[] = [""];
    public get usedRoutes(): string[] {
        return this._usedRoutes;
    }

    // True if GC is disabled for this node. If so, do not track GC specific state for a summary.
    private readonly gcDisabled: boolean;

    /**
     * Do not call constructor directly.
     * Use createRootSummarizerNodeWithGC to create root node, or createChild to create child nodes.
     */
    public constructor(
        logger: ITelemetryLogger,
        private readonly summarizeFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
        config: ISummarizerNodeConfigWithGC,
        changeSequenceNumber: number,
        /** Undefined means created without summary */
        latestSummary?: SummaryNode,
        initialSummary?: IInitialSummary,
        wipSummaryLogger?: ITelemetryLogger,
        private readonly getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
        getInitialGCSummaryDetailsFn?: () => Promise<IGarbageCollectionSummaryDetails>,
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

        this.gcDisabled = config.gcDisabled === true;

        this.gcDetailsInInitialSummaryP = new LazyPromise(async () => {
            // back-compat: 0.32. getInitialGCSummaryDetailsFn() returns undefined in 0.31. Remove undefined check
            // when N > 34.
            const gcSummaryDetails = await getInitialGCSummaryDetailsFn?.();
            return gcSummaryDetails ?? { usedRoutes: [] };
        });
    }

    /**
     * Loads state from this node's initial GC summary details. This contains the following data from the last summary
     * seen by the server for this client:
     * - usedRoutes: This is used to figure out if the used state of this node changed since last summary.
     * - gcData: The garbage collection data of this node that is required for running GC.
     */
    private async loadInitialGCSummaryDetails() {
        // If referenceUsedRoutes exists, don't do anything because we have already initialized.
        if (this.referenceUsedRoutes !== undefined) {
            return;
        }

        const gcDetailsInInitialSummary = await this.gcDetailsInInitialSummaryP;

        // Possible re-entrancy. It's possible that referenceUsedRoutes was set while we were waiting to get the
        // initial GC details.
        if (this.referenceUsedRoutes !== undefined) {
            return;
        }

        this.referenceUsedRoutes = gcDetailsInInitialSummary.usedRoutes;
        // If the GC details has GC data, initialize our GC data from it.
        if (gcDetailsInInitialSummary.gcData !== undefined) {
            this._gcData = cloneGCData(gcDetailsInInitialSummary.gcData);
        }
    }

    public async summarize(fullTree: boolean, trackState: boolean = true): Promise<IContextSummarizeResult> {
        // Load GC details from the initial summary, if it's not already loaded. If this is the first time this node is
        // being summarized, the used routes in it are needed to find out if this node has changed since last summary.
        // If it hasn't changed, the GC data in it needs to be returned as part of the summary.
        await this.loadInitialGCSummaryDetails();

        // If GC is not disabled and we are tracking a summary, GC should have run and updated the used routes for this
        //  summary by calling updateUsedRoutes which sets wipSerializedUsedRoutes.
        if (!this.gcDisabled && this.isTrackingInProgress()) {
            assert(this.wipSerializedUsedRoutes !== undefined,
                0x1b1 /* "wip used routes should be set if tracking a summary" */);
        }

        // If trackState is true, get summary from base summarizer node which tracks summary state.
        // If trackState is false, get summary from summarizeInternal.
        if (trackState) {
            const summarizeResult = await super.summarize(fullTree);

            // If there is no cached GC data, return empty data in summarize result. It is the caller's responsibility
            // to ensure that GC data is available by calling getGCData before calling summarize.
            const gcData = this._gcData !== undefined ? cloneGCData(this._gcData) : { gcNodes: {} };

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
        if (summarizeResult.gcData !== undefined) {
            this._gcData = cloneGCData(summarizeResult.gcData);
        }
        return summarizeResult;
    }

    /**
     * Returns the GC data of this node. If nothing has changed since last summary, it tries to reuse the data from
     * the previous summary. Else, it gets new GC data from the underlying Fluid object.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        assert(!this.gcDisabled, 0x1b2 /* "Getting GC data should not be called when GC is disabled!" */);
        assert(this.getGCDataFn !== undefined, 0x1b3 /* "GC data cannot be retrieved without getGCDataFn" */);

        // Load GC details from the initial summary, if not already loaded. If this is the first time this function is
        // called and the node's data has not changed since last summary, the GC data in initial details is returned.
        await this.loadInitialGCSummaryDetails();

        // If there is no new data since last summary and we have GC data from the previous run, return it. We may not
        // have data from previous GC run for clients with older summary format before GC was added. They won't have
        // GC details in their initial summary.
        if (!fullGC && !this.hasDataChanged() && this._gcData !== undefined) {
            return cloneGCData(this._gcData);
        }

        const gcData = await this.getGCDataFn(fullGC);
        this._gcData = cloneGCData(gcData);
        return gcData;
    }

    /**
     * Called during the start of a summary. Updates the work-in-progress used routes.
     */
    public startSummary(referenceSequenceNumber: number, summaryLogger: ITelemetryLogger) {
        // If GC is disabled, skip setting wip used routes since we should not track GC state.
        if (!this.gcDisabled) {
            assert(
                this.wipSerializedUsedRoutes === undefined,
                0x1b4 /* "We should not already be tracking used routes when to track a new summary" */);

            // back-compat: 0.33 - This will be done in `updateUsedRoutes`. Older clients do not have that method, so
            // keeping this one for now.
            this.wipSerializedUsedRoutes = JSON.stringify(this.usedRoutes);
        }
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
        let wipSerializedUsedRoutes: string | undefined;
        // If GC is disabled, don't set wip used routes.
        if (!this.gcDisabled) {
            wipSerializedUsedRoutes = this.wipSerializedUsedRoutes;
            assert(wipSerializedUsedRoutes !== undefined, 0x1b5 /* "We should have been tracking used routes" */);
        }

        super.completeSummaryCore(proposalHandle, parentPath, parentSkipRecursion);

        // If GC is disabled, skip setting pending summary with GC state.
        if (!this.gcDisabled) {
            const summaryNode = this.pendingSummaries.get(proposalHandle);
            if (summaryNode !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const summaryNodeWithGC = new SummaryNodeWithGC(wipSerializedUsedRoutes!, summaryNode);
                this.pendingSummaries.set(proposalHandle, summaryNodeWithGC);
            }
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
        // If GC is disabled, skip setting referenced used routes since we are not tracking GC state.
        if (!this.gcDisabled) {
            const summaryNode = this.pendingSummaries.get(proposalHandle) as SummaryNodeWithGC;
            if (summaryNode !== undefined) {
                this.referenceUsedRoutes = JSON.parse(summaryNode.serializedUsedRoutes);
            }
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
        // If GC is disabled, skip setting referenced used routes since we are not tracking GC state.
        if (!this.gcDisabled) {
            const gcDetailsBlob = snapshotTree.blobs[gcBlobKey];
            if (gcDetailsBlob !== undefined) {
                const gcDetails = await readAndParseBlob<IGarbageCollectionSummaryDetails>(gcDetailsBlob);

                // Possible re-entrancy. If we have already seen a summary later than this one, ignore it.
                if (this.referenceSequenceNumber >= referenceSequenceNumber) {
                    return;
                }

                this.referenceUsedRoutes = gcDetails.usedRoutes;
            }
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
        config: ISummarizerNodeConfigWithGC = {},
        getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
        getInitialGCSummaryDetailsFn?: () => Promise<IGarbageCollectionSummaryDetails>,
    ): ISummarizerNodeWithGC {
        assert(!this.children.has(id), 0x1b6 /* "Create SummarizerNode child already exists" */);

        const createDetails: ICreateChildDetails = this.getCreateDetailsForChild(id, createParam);
        const child = new SummarizerNodeWithGC(
            this.defaultLogger,
            summarizeInternalFn,
            {
                ...config,
                // Propagate our gcDisabled state to the child if its not explicity specified in child's config.
                gcDisabled: config.gcDisabled ?? this.gcDisabled,
            },
            createDetails.changeSequenceNumber,
            createDetails.latestSummary,
            createDetails.initialSummary,
            this.wipSummaryLogger,
            getGCDataFn,
            getInitialGCSummaryDetailsFn,
        );

        // back-compat: 0.33 - If a child is created during summarize, its wip used routes will updated in
        // `updateUsedRoutes` method. For older clients, do it here since that method does not exist.

        // There may be additional state that has to be updated in this child. For example, if a summary is being
        // tracked, the child's summary tracking state needs to be updated too.
        this.maybeUpdateChildState(child);

        this.children.set(id, child);
        return child;
    }

    /**
     * Deletes the child node with the given id.
     */
    public deleteChild(id: string): void {
        this.children.delete(id);
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

        // If GC is not disabled and we are tracking a summary, update the work-in-progress used routes so that it can
        // be tracked for this summary.
        if (!this.gcDisabled && this.isTrackingInProgress()) {
            this.wipSerializedUsedRoutes = JSON.stringify(this.usedRoutes);
        }
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
        // If GC is disabled, we are not tracking used state, return false.
        if (this.gcDisabled) {
            return false;
        }

        return this.referenceUsedRoutes === undefined ||
            JSON.stringify(this.usedRoutes) !== JSON.stringify(this.referenceUsedRoutes);
    }

    /**
     * Updates the work-in-progress state of the child if summary is in progress.
     * @param child - The child node to be updated.
     */
    protected maybeUpdateChildState(child: SummarizerNodeWithGC) {
        if (this.isTrackingInProgress()) {
            // Update the child's work-in-progress used routes.
            child.updateUsedRoutes(child.usedRoutes);
        }
        super.maybeUpdateChildState(child);
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
    config: ISummarizerNodeConfigWithGC = {},
    getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
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
);
