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
    readonly referenceSequenceNumber: number;
    hasChanged(): boolean;
    invalidate(sequenceNumber: number): void;
    summarize(
        summarizeInternalFn: () => Promise<ISummarizeInternalResult>,
        fullTree: boolean,
    ): Promise<ISummarizeResult>;
    createTrackingChildFromSummary(changeSequenceNumber: number, id: string): ITrackingSummarizerNode;
    createTrackingChildWithoutSummary(changeSequenceNumber: number): ITrackingSummarizerNode;
}

export interface ITrackingSummarizerNode extends ISummarizerNode {
    prependOutstandingOps(pathParts: string[], outstandingOps: ISequencedDocumentMessage[]): void;
    recordChange(op: ISequencedDocumentMessage): void;
}
