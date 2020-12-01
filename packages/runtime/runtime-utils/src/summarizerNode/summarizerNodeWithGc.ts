/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { cloneGCNodes } from "@fluidframework/gc-utils";
import {
    IContextSummarizeResult,
    IGraphNode,
    ISummarizeInternalResult,
    ISummarizerNodeConfig,
    ISummarizerNodeWithGC,
    CreateChildSummarizerNodeParam,
} from "@fluidframework/runtime-definitions";
import { SummarizerNode } from "./summarizerNode";
import { ICreateChildDetails, IInitialSummary, ISummarizerNodeRootContract, SummaryNode } from "./summarizerNodeUtils";

export interface IRootSummarizerNodeWithGC extends ISummarizerNodeWithGC, ISummarizerNodeRootContract {}

/**
 * Extends the functionality of SummarizerNode to manage this node's garbage collection data:
 * - It caches the list of GC nodes returned by the summarizeInternal method.
 * - Gets the initial value of the GC nodes if required.
 * - Adds the cached list of GC nodes to the result of SummarizerNode's summarize.
 * - Adds trackState param to summarize. If trackState is false, it bypasses the SummarizerNode and calls
 *   directly into summarizeInternal method.
 */
export class SummarizerNodeWithGC extends SummarizerNode implements IRootSummarizerNodeWithGC {
    private gcNodes: IGraphNode[] | undefined;

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
        /** Function to get the initial value of garbage collection nodes */
        private readonly getInitialGCNodesFn?: () => Promise<IGraphNode[]>,
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
    }

    public async summarize(fullTree: boolean, trackState: boolean = true): Promise<IContextSummarizeResult> {
        /**
         * If trackState is true, call parent summarizer node to get the summary since it tracks the state from summary.
         * It may update the GC nodes cache if data has changed since last summary.
         * If trackState is false, get the summary directly from the summarizeInternal method which will update the
         * GC nodes cache.
         */
        if (trackState) {
            const summarizeResult = await super.summarize(fullTree);

            // If this is the first time we are summarizing and nothing has changed since the last summary, we would
            // not have updated the GC nodes cache. So, we need to get its initial value.
            if (this.gcNodes === undefined) {
                this.gcNodes = this.getInitialGCNodesFn
                    ? await this.getInitialGCNodesFn()
                    : [];
            }

            return {
                ...summarizeResult,
                gcNodes: cloneGCNodes(this.gcNodes),
            };
        } else {
            return this.summarizeInternal(fullTree, trackState);
        }
    }

    private async summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        const summarizeResult = await this.summarizeFn(fullTree, trackState);
        // back-compat 0.30 - Older versions will not return GC nodes. Set it to empty array.
        if (summarizeResult.gcNodes === undefined) {
            summarizeResult.gcNodes = [];
        }
        // Clone and cache the GC nodes. This will be used when a node's data hasn't changed and this
        // method is not called.
        this.gcNodes = cloneGCNodes(summarizeResult.gcNodes);
        return summarizeResult;
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
        /** Function to get the initial value of garbage collection nodes */
        getInitialGCNodesFn?: () => Promise<IGraphNode[]>,
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
            getInitialGCNodesFn,
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
 * @param getInitialGCNodesFn - Function to get the initial value of garbage collection nodes
 */
export const createRootSummarizerNodeWithGC = (
    logger: ITelemetryLogger,
    summarizeInternalFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
    changeSequenceNumber: number,
    referenceSequenceNumber: number | undefined,
    config: ISummarizerNodeConfig = {},
    getInitialGCNodesFn?: () => Promise<IGraphNode[]>,
): IRootSummarizerNodeWithGC => new SummarizerNodeWithGC(
    logger,
    summarizeInternalFn,
    config,
    changeSequenceNumber,
    referenceSequenceNumber === undefined ? undefined : SummaryNode.createForRoot(referenceSequenceNumber),
    undefined /* initialSummary */,
    undefined /* wipSummaryLogger */,
    getInitialGCNodesFn,
);
