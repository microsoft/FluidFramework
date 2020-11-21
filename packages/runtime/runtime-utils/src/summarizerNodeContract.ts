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

export const createRootSummarizerNode = (
    logger: ITelemetryLogger,
    /** Summarize function */
    summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
    /** Sequence number of latest change to new node/subtree */
    changeSequenceNumber: number,
    /**
     * Reference sequence number of last acked summary,
     * or undefined if not loaded from summary.
     */
    referenceSequenceNumber: number | undefined,
    config: ISummarizerNodeConfig = {},
): IRootSummarizerNode => SummarizerNode.createRoot(
        logger,
        summarizeInternalFn,
        changeSequenceNumber,
        referenceSequenceNumber,
        config,
    );

export const createRootSummarizerNodeWithGC = (
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
    /** Function to get the initial value of garbage collection nodes */
    getInitialGCNodesFn?: () => Promise<IGraphNode[]>,
): IRootSummarizerNodeWithGC => SummarizerNodeWithGC.createRoot(
        logger,
        summarizeInternalFn,
        changeSequenceNumber,
        referenceSequenceNumber,
        config,
        getInitialGCNodesFn,
    );
