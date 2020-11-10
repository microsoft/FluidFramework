/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SummaryTree,
    ISummaryTree,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
} from "@fluidframework/protocol-definitions";

export interface ISummaryStats {
    treeNodeCount: number;
    blobNodeCount: number;
    handleNodeCount: number;
    totalBlobSize: number;
}

export interface ISummaryTreeWithStats {
    stats: ISummaryStats;
    summary: ISummaryTree;
}

export interface ISummarizeResult {
    stats: ISummaryStats;
    summary: SummaryTree;
}

export interface ISummarizeInternalResult extends ISummarizeResult {
    id: string;
}

export type SummarizeInternalFn = (fullTree: boolean) => Promise<ISummarizeInternalResult>;
export interface ISummarizerNodeConfig {
    /**
     * True to reuse previous handle when unchanged since last acked summary.
     * Defaults to true.
     */
    readonly canReuseHandle?: boolean,
    /**
     * True to always stop execution on error during summarize, or false to
     * attempt creating a summary that is a pointer ot the last acked summary
     * plus outstanding ops in case of internal summarize failure.
     * Defaults to false.
     *
     * BUG BUG: Default to true while we investigate problem
     * with differential summaries
     */
    readonly throwOnFailure?: true,
}

export enum CreateSummarizerNodeSource {
    FromSummary,
    FromAttach,
    Local,
}
export type CreateChildSummarizerNodeParam = {
    type: CreateSummarizerNodeSource.FromSummary;
} | {
    type: CreateSummarizerNodeSource.FromAttach;
    sequenceNumber: number;
    snapshot: ITree;
} | {
    type: CreateSummarizerNodeSource.Local;
};

export interface ISummarizerNode {
    /** Latest successfully acked summary reference sequence number */
    readonly referenceSequenceNumber: number;
    /**
     * True if a change has been recorded with sequence number exceeding
     * the latest successfully acked summary reference sequence number.
     * False implies that the previous summary can be reused.
     */
    hasChanged(): boolean;
    /**
     * Marks the node as having a change with the given sequence number.
     * @param sequenceNumber - sequence number of change
     */
    invalidate(sequenceNumber: number): void;
    /**
     * Calls the internal summarize function and handles internal state tracking.
     * If unchanged and fullTree is false, it will reuse previous summary subtree.
     * If an error is encountered and throwOnFailure is false, it will try to make
     * a summary with a pointer to the previous summary + a blob of outstanding ops.
     * @param fullTree - true to skip optimizations and always generate the full tree
     */
    summarize(fullTree: boolean): Promise<ISummarizeResult>;
    /**
     * Checks if the base snapshot was created as a failure summary. If it has
     * the base summary handle + outstanding ops blob, then this will return the
     * innermost base summary, and update the state by tracking the outstanding ops.
     * @param snapshot - the base summary to parse
     * @param readAndParseBlob - function to read and parse blobs from storage
     * @returns the base summary to be used
     */
    loadBaseSummary(
        snapshot: ISnapshotTree,
        readAndParseBlob: <T>(id: string) => Promise<T>,
    ): Promise<{ baseSummary: ISnapshotTree, outstandingOps: ISequencedDocumentMessage[] }>;
    /**
     * Records an op representing a change to this node/subtree.
     * @param op - op of change to record
     */
    recordChange(op: ISequencedDocumentMessage): void;

    createChild(
        /** Summarize function */
        summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
        /** Initial id or path part of this node */
        id: string,
        /**
         * Information needed to create the node.
         * If it is from a base summary, it will assert that a summary has been seen.
         * Attach information if it is created from an attach op.
         * If it is local, it will throw unsupported errors on calls to summarize.
         */
        createParam: CreateChildSummarizerNodeParam,
        /** Optional configuration affecting summarize behavior */
        config?: ISummarizerNodeConfig,
    ): ISummarizerNode;

    getChild(id: string): ISummarizerNode | undefined
}
