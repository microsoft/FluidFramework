/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IEvent,
    IEventProvider,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
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
import { ISummaryStats } from "@fluidframework/runtime-definitions";
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
    submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult>;

    /** Callback whenever a new SummaryAck is received, to update internal tracking state */
    refreshLatestSummaryAck(
        proposalHandle: string,
        ackHandle: string,
        summaryLogger: ITelemetryLogger,
    ): Promise<void>;
}

/** Options that control the behavior of a running summarizer. */
export interface ISummarizerOptions {
    /**
     * Set to true to disable the default heuristics from running; false by default.
     * This affects only the heuristics around when a summarizer should
     * submit summaries. So when it is disabled, summarizer clients should
     * not be expected to summarize unless an on-demand summary is requested.
     */
    disableHeuristics: boolean;
}

export interface ISummarizingWarning extends ContainerWarning {
    readonly errorType: "summarizingError";
    readonly logged: boolean;
}

export interface ISummarizerRuntime extends IConnectableRuntime {
    readonly logger: ITelemetryLogger;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly summarizerClientId: string | undefined;
    closeFn(): void;
    on(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
    on(event: "disconnected", listener: () => void): this;
    removeListener(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
}

/** Options affecting summarize behavior. */
export interface ISummarizeOptions {
    /** True to generate the full tree with no handle reuse optimizations; defaults to false */
    readonly fullTree?: boolean,
    /** True to ask the server what the latest summary is first; defaults to false */
    readonly refreshLatestAck?: boolean,
}

export interface ISubmitSummaryOptions extends ISummarizeOptions {
    /** Logger to use for correlated summary events */
    readonly summaryLogger: ITelemetryLogger,
}

export interface IOnDemandSummarizeOptions extends ISummarizeOptions {
    /** Reason for generating summary. */
    readonly reason: string;
}

/** Options to use when enqueueing a summarize attempt. */
export interface IEnqueueSummarizeOptions extends IOnDemandSummarizeOptions {
    /** If specified, The summarize attempt will not occur until after this sequence number. */
    readonly afterSequenceNumber?: number;
    /**
     * True to override the existing enqueued summarize attempt if there is one.
     * This will guarantee that this attempt gets enqueued. If override is false,
     * than an existing enqueued summarize attempt will block a new one from being
     * enqueued. There can only be one enqueued at a time. Defaults to false.
     */
    readonly override?: boolean;
}

/**
 * In addition to the normal summary tree + stats, this contains additional stats
 * only relevant at the root of the tree.
 */
export interface IGeneratedSummaryStats extends ISummaryStats {
    readonly dataStoreCount: number;
    readonly summarizedDataStoreCount: number;
}

/** Base results for all submitSummary attempts. */
export interface IBaseSummarizeResult {
    readonly stage: "base";
    /** Error object related to failed summarize attempt. */
    readonly error: any;
    /** Reference sequence number as of the generate summary attempt. */
    readonly referenceSequenceNumber: number;
    readonly retryAfterSeconds?: number;
}

/** Results of submitSummary after generating the summary tree. */
export interface IGenerateSummaryTreeResult extends Omit<IBaseSummarizeResult, "stage"> {
    readonly stage: "generate";
    /** Generated summary tree. */
    readonly summaryTree: ISummaryTree;
    /** Stats for generated summary tree. */
    readonly summaryStats: IGeneratedSummaryStats;
    /** Time it took to generate the summary tree and stats. */
    readonly generateDuration: number;
}

/** Results of submitSummary after uploading the tree to storage. */
export interface IUploadSummaryResult extends Omit<IGenerateSummaryTreeResult, "stage"> {
    readonly stage: "upload";
    /** The handle returned by storage pointing to the uploaded summary tree. */
    readonly handle: string;
    /** Time it took to upload the summary tree to storage. */
    readonly uploadDuration: number;
}

/** Results of submitSummary after submitting the summarize op. */
export interface ISubmitSummaryOpResult extends Omit<IUploadSummaryResult, "stage" | "error"> {
    readonly stage: "submit";
    /** The client sequence number of the summarize op submitted for the summary. */
    readonly clientSequenceNumber: number;
    /** Time it took to submit the summarize op to the broadcasting service. */
    readonly submitOpDuration: number;
}

/**
 * Strict type representing result of a submitSummary attempt.
 * The result consists of 4 possible stages, each with its own data.
 * The data is cumulative, so each stage will contain the data from the previous stages.
 * If the final "submitted" stage is not reached, the result may contain the error object.
 * Stages:
 *  1. "base" - stopped before the summary tree was even generated, and the result only contains the base data
 *  2. "generate" - the summary tree was generated, and the result will contain that tree + stats
 *  3. "upload" - the summary was uploaded to storage, and the result contains the server-provided handle
 *  4. "submit" - the summarize op was submitted, and the result contains the op client sequence number.
 */
export type SubmitSummaryResult =
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
    readonly retryAfterSeconds?: number;
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
    readonly summarySubmitted: Promise<SummarizeResultPart<SubmitSummaryResult>>;
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

export type EnqueueSummarizeResult = (ISummarizeResults & {
    /**
     * Indicates that another summarize attempt is not already enqueued,
     * and this attempt has been enqueued.
     */
    readonly alreadyEnqueued?: undefined;
}) | (ISummarizeResults & {
    /** Indicates that another summarize attempt was already enqueued. */
    readonly alreadyEnqueued: true;
    /**
     * Indicates that the other enqueued summarize attempt was abandoned,
     * and this attempt has been enqueued enqueued.
     */
    readonly overridden: true;
}) | {
    /** Indicates that another summarize attempt was already enqueued. */
    readonly alreadyEnqueued: true;
    /**
     * Indicates that the other enqueued summarize attempt remains enqueued,
     * and this attempt has not been enqueued.
     */
    readonly overridden?: undefined;
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
    stop(reason?: SummarizerStopReason): void;
    run(onBehalfOf: string, options?: Readonly<Partial<ISummarizerOptions>>): Promise<void>;
    updateOnBehalfOf(onBehalfOf: string): void;

    /**
     * Attempts to generate a summary on demand. If already running, takes no action.
     * @param options - options controlling the summarize attempt
     * @returns an alreadyRunning promise if a summarize attempt is already in progress,
     * which will resolve when the current attempt completes. At that point caller can
     * decide to try again or not. Otherwise, it will return an object containing promises
     * that resolve as the summarize attempt progresses. They will resolve with success
     * false if a failure is encountered.
     */
    summarizeOnDemand(options: IOnDemandSummarizeOptions): OnDemandSummarizeResult;
    /**
     * Enqueue an attempt to summarize after the specified sequence number.
     * If afterSequenceNumber is provided, the summarize attempt is "enqueued"
     * to run once an eligible op comes in with sequenceNumber \>= afterSequenceNumber.
     * @param options - options controlling the summarize attempt
     * @returns an object containing an alreadyEnqueued flag to indicate if another
     * summarize attempt has already been enqueued. It also may contain an overridden flag
     * when alreadyEnqueued is true, that indicates whether this attempt forced the
     * previous attempt to abort. If this attempt becomes enqueued, it returns an object
     * containing promises that resolve as the summarize attempt progresses. They will
     * resolve with success false if a failure is encountered.
     */
    enqueueSummarize(options: IEnqueueSummarizeOptions): EnqueueSummarizeResult;
}

/** Data about an attempt to summarize used for heuristics. */
export interface ISummarizeAttempt {
    /** Reference sequence number when summary was generated or attempted */
    readonly refSequenceNumber: number;

    /** Time of summary attempt after it was sent or attempted */
    readonly summaryTime: number;

    /** Sequence number of summary op */
    summarySequenceNumber?: number;
}

/** Data relevant for summary heuristics. */
export interface ISummarizeHeuristicData {
    /** Latest received op sequence number */
    lastOpSequenceNumber: number;

    /** Most recent summary attempt from this client */
    readonly lastAttempt: ISummarizeAttempt;

    /** Most recent summary that received an ack */
    readonly lastSuccessfulSummary: Readonly<ISummarizeAttempt>;

    /**
     * Initializes lastAttempt and lastSuccessfulAttempt based on the last summary.
     * @param lastSummary - last ack summary
     */
    initialize(lastSummary: ISummarizeAttempt): void;

    /**
     * Records a summary attempt. If the attempt was successfully sent,
     * provide the reference sequence number, otherwise it will be set
     * to the last seen op sequence number.
     * @param referenceSequenceNumber - reference sequence number of sent summary
     */
    recordAttempt(referenceSequenceNumber?: number): void;

    /** Mark that the last sent summary attempt has received an ack */
    markLastAttemptAsSuccessful(): void;
}

/** Responsible for running heuristics determining when to summarize. */
export interface ISummarizeHeuristicRunner {
    /** Runs the heuristic to determine if it should try to summarize */
    run(): void;

    /** Runs a different heuristic to check if it should summarize before closing */
    runOnClose(): boolean;

    /** Disposes of resources */
    dispose(): void;
}
