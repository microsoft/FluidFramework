/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IEvent,
    IEventProvider,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { Deferred } from "@fluidframework/common-utils";
import {
    IFluidRouter,
    IFluidRunnable,
    IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { ContainerWarning, IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISummaryTree,
} from "@fluidframework/protocol-definitions";
import { IGarbageCollectionData, ISummaryStats } from "@fluidframework/runtime-definitions";
import { IConnectableRuntime } from "./runWhileConnectedCoordinator";
import { ISummaryAckMessage, ISummaryNackMessage, ISummaryOpMessage } from "./summaryCollection";

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideSummarizer>> { }
}

export const ISummarizer: keyof IProvideSummarizer = "ISummarizer";

export interface IProvideSummarizer {
    readonly ISummarizer: ISummarizer;
}

export interface ISummarizerInternalsProvider {
    /** Encapsulates the work to walk the internals of the running container to generate a summary */
    generateSummary(options: IGenerateSummaryOptions): Promise<GenerateSummaryResult>;

    /** Callback whenever a new SummaryAck is received, to update internal tracking state */
    refreshLatestSummaryAck(
        proposalHandle: string,
        ackHandle: string,
        summaryLogger: ITelemetryLogger,
    ): Promise<void>;
}

export interface ISummarizingWarning extends ContainerWarning {
    readonly errorType: "summarizingError";
    readonly logged: boolean;
}

export interface ISummarizerRuntime extends IConnectableRuntime {
    readonly logger: ITelemetryLogger;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly summarizerClientId: string | undefined;
    nextSummarizerD?: Deferred<ISummarizer>;
    closeFn(): void;
    on(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
    on(event: "disconnected", listener: () => void): this;
    removeListener(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
}

export interface IGenerateSummaryOptions {
    /** True to generate the full tree with no handle reuse optimizations; defaults to false */
    fullTree?: boolean,
    /** True to ask the server what the latest summary is first; defaults to false */
    refreshLatestAck?: boolean,
    /** Logger to use for correlated summary events */
    summaryLogger: ITelemetryLogger,
}

/**
 * In addition to the normal summary tree + stats, this contains additional stats
 * only relevant at the root of the tree.
 */
export interface IGeneratedSummaryStats extends ISummaryStats {
    readonly dataStoreCount: number;
    readonly summarizedDataStoreCount: number;
}

/** Base results for all generateSummary attempts. */
export interface IBaseSummarizeResult {
    readonly stage: "base";
    /** Error object related to failed summarize attempt. */
    readonly error: any;
    /** Reference sequence number as of the generate summary attempt. */
    readonly referenceSequenceNumber: number;
}

/** Results of generateSummary after generating the summary tree. */
export interface IGenerateSummaryTreeResult extends Omit<IBaseSummarizeResult, "stage"> {
    readonly stage: "generate";
    /** Generated summary tree. */
    readonly summaryTree: ISummaryTree;
    /** Stats for generated summary tree. */
    readonly summaryStats: IGeneratedSummaryStats;
    /** Garbage collection data gathered while generating the summary. */
    readonly gcData: IGarbageCollectionData;
    /** Time it took to generate the summary tree and stats. */
    readonly generateDuration: number;
}

/** Results of generateSummary after uploading the tree to storage. */
export interface IUploadSummaryResult extends Omit<IGenerateSummaryTreeResult, "stage"> {
    readonly stage: "upload";
    /** The handle returned by storage pointing to the uploaded summary tree. */
    readonly handle: string;
    /** Time it took to upload the summary tree to storage. */
    readonly uploadDuration: number;
}

/** Results of generateSummary after submitting the summarize op. */
export interface ISubmitSummaryOpResult extends Omit<IUploadSummaryResult, "stage" | "error"> {
    readonly stage: "submit";
    /** The client sequence number of the summarize op submitted for the summary. */
    readonly clientSequenceNumber: number;
    /** Time it took to submit the summarize op to the broadcasting service. */
    readonly submitOpDuration: number;
}

/**
 * Strict type representing result of a generateSummary attempt.
 * The result consists of 4 possible stages, each with its own data.
 * The data is cumulative, so each stage will contain the data from the previous stages.
 * If the final "submitted" stage is not reached, the result may contain the error object.
 * Stages:
 *  1. "base" - stopped before the summary tree was even generated, and the result only contains the base data
 *  2. "generate" - the summary tree was generated, and the result will contain that tree + stats
 *  3. "upload" - the summary was uploaded to storage, and the result contains the server-provided handle
 *  4. "submit" - the summarize op was submitted, and the result contains the op client sequence number.
 */
export type GenerateSummaryResult =
    | IBaseSummarizeResult
    | IGenerateSummaryTreeResult
    | IUploadSummaryResult
    | ISubmitSummaryOpResult;

export interface IBroadcastSummaryResult {
    readonly summarizeOp: ISummaryOpMessage;
    readonly broadcastDuration: number;
}

export interface IAckNackSummaryResult {
    readonly summaryAckNackOp: ISummaryAckMessage | ISummaryNackMessage;
    readonly ackNackDuration: number;
}

export type SummarizeResultPart<T> = {
    success: true;
    data: T;
} | {
    success: false;
    data: T | undefined;
    message: string;
    error: any;
};

export interface ISummarizeResults {
    /** Resolves when we generate, upload, and submit the summary. */
    readonly summarySubmitted: Promise<SummarizeResultPart<GenerateSummaryResult>>;
    /** Resolves when we observe our summarize op broadcast. */
    readonly summaryOpBroadcasted: Promise<SummarizeResultPart<IBroadcastSummaryResult>>;
    /** Resolves when we receive a summaryAck or summaryNack. */
    readonly receivedSummaryAckOrNack: Promise<SummarizeResultPart<IAckNackSummaryResult>>;
}

export type OnDemandSummarizeResult = (ISummarizeResults & {
    /** Indicates that an already running summarize attempt does not exist. */
    readonly alreadyRunning?: undefined;
}) | {
    /** Resolves when an already running summarize attempt completes. */
    readonly alreadyRunning: Promise<void>;
};

export type SummarizerStopReason =
    /** Summarizer client failed to summarize in all 3 consecutive attempts. */
    | "failToSummarize"
    /**
     * Summarizer client detected that its parent is no longer elected the summarizer.
     * Normally, the parent client would realize it is disconnected first and call stop
     * giving a "parentNotConnected" stop reason. If the summarizer client attempts to
     * generate a summary and realizes at that moment that the parent is not elected,
     * only then will it stop itself with this message.
     */
    | "parentNoLongerSummarizer"
    /** Parent client reported that it is no longer connected. */
    | "parentNotConnected"
    /**
     * Parent client reported that it is no longer elected the summarizer.
     * This is the normal flow; a disconnect will always trigger the parent
     * client to no longer be elected as responsible for summaries. Then it
     * tries to stop its spawned summarizer client.
     */
    | "parentShouldNotSummarize"
    /** Parent client reported that it is disposed. */
    | "disposed";

export interface ISummarizerEvents extends IEvent {
    /**
     * An event indicating that the Summarizer is having problems summarizing
     */
    (event: "summarizingError", listener: (error: ISummarizingWarning) => void);
}

export interface ISummarizer
    extends IEventProvider<ISummarizerEvents>, IFluidRouter, IFluidRunnable, IFluidLoadable {
    /**
     * Returns a promise that will be resolved with the next Summarizer after context reload
     */
    setSummarizer(): Promise<ISummarizer>;
    stop(reason?: SummarizerStopReason): void;
    run(onBehalfOf: string): Promise<void>;
    updateOnBehalfOf(onBehalfOf: string): void;

    /** Attempts to generate a summary on demand. */
    summarizeOnDemand(
        reason: string,
        options: Omit<IGenerateSummaryOptions, "summaryLogger">,
    ): OnDemandSummarizeResult;
}
