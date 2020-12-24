/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { cloneGCData } from "@fluidframework/garbage-collector";
import { ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
    CreateChildSummarizerNodeParam,
    gcBlobKey,
    IContextSummarizeResult,
    IGarbageCollectionData,
    IGarbageCollectionDetails,
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
    ISummaryNode,
    ReadAndParseBlob,
    SummaryNode,
} from "./summarizerNodeUtils";

export interface IRootSummarizerNodeWithGC extends ISummarizerNodeWithGC, ISummarizerNodeRootContract {}

interface ISummaryNodeWithGC extends ISummaryNode {
    readonly serializedUsedRoutes: string;
}

// Extend SummaryNode to add used routes tracking to it.
class SummaryNodeWithGC extends SummaryNode implements ISummaryNodeWithGC {
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
    public usedRoutes: string[] = [];
    private gcData: IGarbageCollectionData | undefined;

    // Tracks the work-in-progress used state during summary.
    private wipSerializedUsedRoutes: string | undefined;

    // This is the last known used state of this node as seen by the server as part of a summary.
    private referenceUsedRoutes: string[] | undefined;

    // The initial GC details of this node.
    private readonly initialGCDetailsP: LazyPromise<IGarbageCollectionDetails>;

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
        latestSummary?: ISummaryNode,
        initialSummary?: IInitialSummary,
        wipSummaryLogger?: ITelemetryLogger,
        private readonly getGCDataFn?: () => Promise<IGarbageCollectionData>,
        getInitialGCDetailsFn?: () => Promise<IGarbageCollectionDetails>,
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

        this.initialGCDetailsP = new LazyPromise(async () => {
            return getInitialGCDetailsFn ? getInitialGCDetailsFn() : { usedRoutes: [] };
        });
    }

    public async summarize(fullTree: boolean, trackState: boolean = true): Promise<IContextSummarizeResult> {
        // Update the reference used state from the initial GC details. This is used to find out if the used state has
        // changed from the last state seen by the server. If so, we cannot reuse previous summary.
        if (this.referenceUsedRoutes === undefined) {
            this.referenceUsedRoutes = (await this.initialGCDetailsP).usedRoutes;
        }

        // If trackState is true, get summary from base summarizer node which tracks summary state.
        // If trackState is false, get summary from summarizeInternal.
        if (trackState) {
            const summarizeResult = await super.summarize(fullTree);

            if (!this.isUsed() && this.hasUsedRoutesChanged()) {
                const summaryTree = summarizeResult.summary;
                assert(summaryTree.type === SummaryType.Tree, "Reusing previous summary when reference state changed");
                // Mark the summary tree as unreferenced here. This will happen in the following issue:
                // https://github.com/microsoft/FluidFramework/issues/4687
            }

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

        if (!super.hasChanged()) {
            // There is no new data since last summary. If we have the GC data from previous run, return it.
            if (this.gcData !== undefined) {
                return cloneGCData(this.gcData);
            }

            // This is the first time GC data is requested in this client, so we need to get initial GC data.
            // Note: Initial GC data may not be available for clients with old summary. In such cases, we fall back
            // to getting GC data by calling getGCDataFn.
            const initialGCData = (await this.initialGCDetailsP)?.gcData;
            if (initialGCData !== undefined) {
                this.gcData = cloneGCData(initialGCData);
                return initialGCData;
            }
        }

        const gcData = await this.getGCDataFn();
        this.gcData = cloneGCData(gcData);
        return gcData;
    }

    /**
     * Called during the start of a summary. Update the work-in-progress used state.
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
        assert(this.wipSerializedUsedRoutes !== undefined, "wip routes should have been set in startSummary");
        const wipSerializedUsedRoutes = this.wipSerializedUsedRoutes;

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
        const summaryNode = this.pendingSummaries.get(proposalHandle) as ISummaryNodeWithGC;
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
        const gcDetailsHash = snapshotTree.blobs[gcBlobKey];
        if (gcDetailsHash !== undefined) {
            const gcDetails = await readAndParseBlob<IGarbageCollectionDetails>(gcDetailsHash);
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
        getInitialGCDetailsFn?: () => Promise<IGarbageCollectionDetails>,
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
            getInitialGCDetailsFn,
        );
        this.initializeChild(child);

        this.children.set(id, child);
        return child;
    }

    /**
     * Override the getChild method to return an instance of SummarizerNodeWithGC.
     */
    public getChild(id: string): ISummarizerNodeWithGC | undefined {
        return this.children.get(id) as SummarizerNodeWithGC;
    }

    /**
     * Override the hasChanged method and add a condition to check if this node's used routes changed.
     */
    protected hasChanged(): boolean {
        return super.hasChanged() || this.hasUsedRoutesChanged();
    }

    private isUsed(): boolean {
        return this.usedRoutes.includes("") || this.usedRoutes.includes("/");
    }

    private hasUsedRoutesChanged(): boolean {
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
 * @param initialGCDetailsP - Function to get the initial GC details of this node
 */
export const createRootSummarizerNodeWithGC = (
    logger: ITelemetryLogger,
    summarizeInternalFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
    changeSequenceNumber: number,
    referenceSequenceNumber: number | undefined,
    config: ISummarizerNodeConfig = {},
    getGCDataFn?: () => Promise<IGarbageCollectionData>,
    getInitialGCDetailsFn?: () => Promise<IGarbageCollectionDetails>,
): IRootSummarizerNodeWithGC => new SummarizerNodeWithGC(
    logger,
    summarizeInternalFn,
    config,
    changeSequenceNumber,
    referenceSequenceNumber === undefined ? undefined : SummaryNode.createForRoot(referenceSequenceNumber),
    undefined /* initialSummary */,
    undefined /* wipSummaryLogger */,
    getGCDataFn,
    getInitialGCDetailsFn,
);
