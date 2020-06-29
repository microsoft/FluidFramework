/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SummaryTree,
    ISummaryTree,
    ISequencedDocumentMessage,
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

export interface ISummarizerNodeProvider {
    createChildFromSummary(changeSequenceNumber: number, id: string): ISummarizerNode;
    createChildWithoutSummary(changeSequenceNumber: number): ISummarizerNode;
}

export interface ISummarizerNode extends ISummarizerNodeProvider {
    /** Latest successful summary reference sequence number */
    readonly referenceSequenceNumber: number;
    /**
     * True if a change has been recorded with sequence number exceeding
     * the latest successful summary reference sequence number.
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
     * If an error is encountered and trackChanges is enabled, it will try to make
     * a summary with a pointer to the previous summary + a blob of outstanding ops.
     * @param summarizeInternalFn - internal summarize function
     * @param fullTree - true to skip optimizations and always generate the full tree
     */
    summarize(
        summarizeInternalFn: () => Promise<ISummarizeInternalResult>,
        fullTree: boolean,
    ): Promise<ISummarizeResult>;
    createTrackingChildFromSummary(changeSequenceNumber: number, id: string): ITrackingSummarizerNode;
    createTrackingChildWithoutSummary(changeSequenceNumber: number): ITrackingSummarizerNode;
}

export interface ITrackingSummarizerNode extends ISummarizerNode {
    /**
     * Prepends additional ops to the tracked outstanding ops. This is used when
     * loading from a summary which is decoded containing an outstanding ops blob.
     * @param pathParts - additional path parts resulting from decoding the summary
     * @param outstandingOps - outstanding ops resulting from decoding the summary
     */
    prependOutstandingOps(pathParts: string[], outstandingOps: ISequencedDocumentMessage[]): void;
    /**
     * Records an op representing a change to this node/subtree.
     * @param op - op of change to record
     */
    recordChange(op: ISequencedDocumentMessage): void;
}
