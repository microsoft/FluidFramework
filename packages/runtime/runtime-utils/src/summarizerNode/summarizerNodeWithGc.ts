/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { cloneGCData } from "@fluidframework/garbage-collector";
import {
    IContextSummarizeResult,
    ISummarizeInternalResult,
    ISummarizerNodeConfig,
    ISummarizerNodeWithGC,
    CreateChildSummarizerNodeParam,
    IGCData,
} from "@fluidframework/runtime-definitions";
import { SummarizerNode } from "./summarizerNode";
import { ICreateChildDetails, IInitialSummary, ISummarizerNodeRootContract, SummaryNode } from "./summarizerNodeUtils";

export interface IRootSummarizerNodeWithGC extends ISummarizerNodeWithGC, ISummarizerNodeRootContract {}

/**
 * Extends the functionality of SummarizerNode to manage this node's garbage collection data:
 * - It caches the GC data returned by the getGCData method.
 * - Gets the initial GC data if required.
 * - Adds trackState param to summarize. If trackState is false, it bypasses the SummarizerNode and calls
 *   directly into summarizeInternal method.
 */
export class SummarizerNodeWithGC extends SummarizerNode implements IRootSummarizerNodeWithGC {
    private gcData: IGCData | undefined;

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
        private readonly getGCDataFn?: () => Promise<IGCData>,
        private readonly getInitialGCDataFn?: () => Promise<IGCData | undefined>,
    ) {
        super(
            logger,
            async (fullTree: boolean) => this.summarizeFn(fullTree, true /* trackState */),
            config,
            changeSequenceNumber,
            latestSummary,
            initialSummary,
            wipSummaryLogger,
        );
    }

    public async summarize(fullTree: boolean, trackState: boolean = true): Promise<IContextSummarizeResult> {
        if (trackState) {
            const summarizeResult = await super.summarize(fullTree);
            return {
                ...summarizeResult,
                gcNodes: [],
            };
        } else {
            return this.summarizeFn(fullTree, trackState);
        }
    }

    /**
     * Returns the GC data of this node. If nothing has changed since the last time we summarized, it tried to reuse
     * existing data.
     */
    public async getGCData(): Promise<IGCData> {
        assert(this.getGCDataFn !== undefined, "GC data cannot be retrieved without getGCDataFn");

        if (!this.hasChanged()) {
            // Nothing has changed since last summary. If we have the GC data from previous run, return it.
            if (this.gcData !== undefined) {
                return cloneGCData(this.gcData);
            }

            // This is the first time GC data is requested in this client, so we need to get initial GC data.
            // Note: Initial GC data may not be available for clients with old summary format. In such cases, we
            // fall back to getting GC data by calling getGCDataFn.
            const initialGCData = this.getInitialGCDataFn ? await this.getInitialGCDataFn() : undefined;
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
        getGCDataFn?: () => Promise<IGCData>,
        getInitialGCDataFn?: () => Promise<IGCData | undefined>,
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
            getInitialGCDataFn,
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
 * @param getInitialGCNodesFn - Function to get the initial GC data of this node
 */
export const createRootSummarizerNodeWithGC = (
    logger: ITelemetryLogger,
    summarizeInternalFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
    changeSequenceNumber: number,
    referenceSequenceNumber: number | undefined,
    config: ISummarizerNodeConfig = {},
    getGCDataFn?: () => Promise<IGCData>,
    getInitialGCDataFn?: () => Promise<IGCData | undefined>,
): IRootSummarizerNodeWithGC => new SummarizerNodeWithGC(
    logger,
    summarizeInternalFn,
    config,
    changeSequenceNumber,
    referenceSequenceNumber === undefined ? undefined : SummaryNode.createForRoot(referenceSequenceNumber),
    undefined /* initialSummary */,
    undefined /* wipSummaryLogger */,
    getGCDataFn,
    getInitialGCDataFn,
);
