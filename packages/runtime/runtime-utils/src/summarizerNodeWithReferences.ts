/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, unreachableCase } from "@fluidframework/common-utils";
import { SummaryType } from "@fluidframework/protocol-definitions";
import {
    IContextSummarizeResult,
    IFluidObjectReferences,
    ISummarizeInternalResult,
    ISummarizerNodeConfig,
    ISummarizerNodeWithReferences,
    ISummaryTreeWithStats,
    CreateChildSummarizerNodeParam,
    CreateSummarizerNodeSource,
} from "@fluidframework/runtime-definitions";
import { EscapedPath, IInitialSummary, SummarizerNode, SummaryNode } from "./summarizerNode";
import { convertToSummaryTree, calculateStats } from "./summaryUtils";
import { cloneFluidObjectReferences } from "./fluidObjectReferencesUtils";

/**
 * Extends the functionality of SummarizerNode to manage a list of references to Fluid objects from this node.
 * These references are used in garbage collection. It adds the following functionalities:
 * - Caches the list of Fluid object references returned by caller's summarizeInternal method.
 * - Gets the initial value for the references if required.
 * - Adds the cached list of references to the result of SummarizerNode's summarize.
 * - Adds trackState param to summarize. If trackState is false, it bypasses the SummarizerNode and calls
 *   directly into caller's summarizeInternal method.
 */
export class SummarizerNodeWithReferences extends SummarizerNode implements ISummarizerNodeWithReferences {
    private references: IFluidObjectReferences[] | undefined;
    protected constructor(
        logger: ITelemetryLogger,
        private readonly summarizeFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
        config: ISummarizerNodeConfig,
        changeSequenceNumber: number,
        /** Undefined means created without summary */
        latestSummary?: SummaryNode,
        initialSummary?: IInitialSummary,
        /** Function to get initial Fluid object references */
        private readonly getInitialFluidObjectReferencesFn?: () => Promise<IFluidObjectReferences[]>,
    ) {
        super(
            logger,
            async (fullTree: boolean) => this.summarizeInternal(fullTree, true /* trackState */),
            config,
            changeSequenceNumber,
            latestSummary,
            initialSummary,
        );
    }

    public async summarize(fullTree: boolean, trackState: boolean = true): Promise<IContextSummarizeResult> {
        /**
         * If trackState is true, call summarizer node to get the summary since it tracks the state from summary. It
         * may update the Fluid object references cache if the node's data has changed since last summary.
         * If trackState is false, get the summary directly from the summarizeInternal method which will update the
         * Fluid object references cache.
         */
        if (trackState) {
            const summarizeResult = await super.summarize(fullTree);

            // If this is the first time we are summarizing and nothing has changed since the last summary, we would
            // not have updated the references cache. So, we need to get its initial value.
            if (this.references === undefined) {
                this.references = this.getInitialFluidObjectReferencesFn
                    ? await this.getInitialFluidObjectReferencesFn()
                    : [];
            }

            return {
                ...summarizeResult,
                references: cloneFluidObjectReferences(this.references),
            };
        } else {
            return this.summarizeInternal(fullTree, trackState);
        }
    }

    private async summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        const summarizeResult = await this.summarizeFn(fullTree, trackState);
        // back-compat 0.30 - Older versions will not return references. Set it to empty array.
        if (summarizeResult.references === undefined) {
            summarizeResult.references = [];
        }
        // Clone and cache the Fluid object references. This will be used when a node's data hasn't changed and this
        // method is not called.
        this.references = cloneFluidObjectReferences(summarizeResult.references);
        return summarizeResult;
    }

    /**
     * Override the createRoot method to return an instance of SummarizerNodeWithReferences.
     */
    public static createRoot(
        logger: ITelemetryLogger,
        /** Summarize function */
        summarizeInternalFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
        /** Sequence number of latest change to new node/subtree */
        changeSequenceNumber: number,
        /**
         * Reference sequence number of last acked summary,
         * or undefined if not loaded from summary.
         */
        referenceSequenceNumber: number | undefined,
        config: ISummarizerNodeConfig = {},
        /** Function to get initial Fluid object references */
        getInitialFluidObjectReferencesFn?: () => Promise<IFluidObjectReferences[]>,
    ): SummarizerNodeWithReferences {
        const maybeSummaryNode = referenceSequenceNumber === undefined ? undefined : new SummaryNode({
            referenceSequenceNumber,
            basePath: undefined,
            localPath: EscapedPath.create(""), // root hard-coded to ""
        });
        return new SummarizerNodeWithReferences(
            logger,
            summarizeInternalFn,
            config,
            changeSequenceNumber,
            maybeSummaryNode,
            undefined /* initialSummary */,
            getInitialFluidObjectReferencesFn,
        );
    }

    /**
     * Override the createChild method to return an instance of SummarizerNodeWithReferences.
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
        /** Function to get initial Fluid object references */
        getInitialFluidObjectReferencesFn?: () => Promise<IFluidObjectReferences[]>,
    ): ISummarizerNodeWithReferences {
        assert(!this.children.has(id), "Create SummarizerNode child already exists");

        const latestSummary = this.latestSummary;
        let child: SummarizerNodeWithReferences;
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
                child = new SummarizerNodeWithReferences(
                    this.logger,
                    summarizeInternalFn,
                    config,
                    createParam.sequenceNumber,
                    summaryNode,
                    initialSummary,
                    getInitialFluidObjectReferencesFn,
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
                child = new SummarizerNodeWithReferences(
                    this.logger,
                    summarizeInternalFn,
                    config,
                    latestSummary?.referenceSequenceNumber ?? -1,
                    latestSummary?.createForChild(id),
                    childInitialSummary,
                    getInitialFluidObjectReferencesFn,
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

    /**
     * Override the getChild method to return an instance of SummarizerNodeWithReferences.
     */
    public getChild(id: string): ISummarizerNodeWithReferences | undefined {
        return this.children.get(id) as SummarizerNodeWithReferences;
    }
}
