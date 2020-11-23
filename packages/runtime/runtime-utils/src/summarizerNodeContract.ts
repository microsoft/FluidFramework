/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    IGraphNode,
    ISummarizeInternalResult,
    ISummarizerNode,
    ISummarizerNodeConfig,
    ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions";
import { SummarizerNode } from "./summarizerNode";
import { ReadAndParseBlob } from "./summarizerNodeUtils";
import { SummarizerNodeWithGC } from "./summarizerNodeWithGc";

export { ReadAndParseBlob } from "./summarizerNodeUtils";

export interface ISummarizerNodeRootContract {
    startSummary(referenceSequenceNumber: number, summaryLogger: ITelemetryLogger): void;
    completeSummary(proposalHandle: string): void;
    clearSummary(): void;
    refreshLatestSummary(
        proposalHandle: string | undefined,
        getSnapshot: () => Promise<ISnapshotTree>,
        readAndParseBlob: ReadAndParseBlob,
        correlatedSummaryLogger: ITelemetryLogger,
    ): Promise<void>;
}

export interface IRootSummarizerNode extends ISummarizerNode, ISummarizerNodeRootContract {}

export interface IRootSummarizerNodeWithGC extends ISummarizerNodeWithGC, ISummarizerNodeRootContract {}

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
): IRootSummarizerNode => SummarizerNode.createRoot(
        logger,
        summarizeInternalFn,
        changeSequenceNumber,
        referenceSequenceNumber,
        config,
    );

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
): IRootSummarizerNodeWithGC => SummarizerNodeWithGC.createRoot(
        logger,
        summarizeInternalFn,
        changeSequenceNumber,
        referenceSequenceNumber,
        config,
        getInitialGCNodesFn,
    );
