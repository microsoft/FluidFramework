/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDeltaManager,
	ContainerWarning,
} from "@fluidframework/container-definitions/internal";
import type {
	ISummarizerEvents,
	SummarizerStopReason,
} from "@fluidframework/container-runtime-definitions/internal";
import {
	IEventProvider,
	ITelemetryBaseProperties,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { ISummaryStats } from "@fluidframework/runtime-definitions/internal";
import {
	ITelemetryLoggerExt,
	ITelemetryLoggerPropertyBag,
} from "@fluidframework/telemetry-utils/internal";

import { ISummaryConfigurationHeuristics } from "../containerRuntime.js";

import {
	ISummaryAckMessage,
	ISummaryNackMessage,
	ISummaryOpMessage,
} from "./summaryCollection.js";
import { SummarizeReason } from "./summaryGenerator.js";

/**
 * Similar to AbortSignal, but using promise instead of events
 * @param T - cancellation reason type
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */
export interface ICancellationToken<T> {
	/**
	 * Tells if this cancellable token is cancelled
	 */
	readonly cancelled: boolean;
	/**
	 * Promise that gets fulfilled when this cancellable token is cancelled
	 * @returns reason of cancellation
	 */
	readonly waitCancelled: Promise<T>;
}

/**
 * Similar to AbortSignal, but using promise instead of events
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export type ISummaryCancellationToken = ICancellationToken<SummarizerStopReason>;

/**
 * Data required to update internal tracking state after receiving a Summary Ack.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IRefreshSummaryAckOptions {
	/**
	 * Handle from the ack's summary op.
	 */
	readonly proposalHandle: string | undefined;
	/**
	 * Handle from the summary ack just received
	 */
	readonly ackHandle: string;
	/**
	 * Reference sequence number from the ack's summary op
	 */
	readonly summaryRefSeq: number;
	/**
	 * Telemetry logger to which telemetry events will be forwarded.
	 */
	readonly summaryLogger: ITelemetryLoggerExt;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface ISummarizerInternalsProvider {
	/**
	 * Encapsulates the work to walk the internals of the running container to generate a summary
	 */

	submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult>;

	/**
	 * Callback whenever a new SummaryAck is received, to update internal tracking state
	 */

	refreshLatestSummaryAck(options: IRefreshSummaryAckOptions): Promise<void>;
}

/**
 * @internal
 */
export interface ISummarizingWarning extends ContainerWarning {
	readonly errorType: "summarizingError";
	readonly logged: boolean;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IConnectableRuntime {
	readonly disposed: boolean;
	readonly connected: boolean;
	readonly clientId: string | undefined;
	once(event: "connected" | "disconnected" | "dispose", listener: () => void): this;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface ISummarizerRuntime extends IConnectableRuntime {
	readonly baseLogger: ITelemetryBaseLogger;
	/**
	 * clientId of parent (non-summarizing) container that owns summarizer container
	 */

	readonly summarizerClientId: string | undefined;
	readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
	disposeFn(): void;
	closeFn(): void;
	on(
		event: "op",
		listener: (op: ISequencedDocumentMessage, runtimeMessage?: boolean) => void,
	): this;
	off(
		event: "op",
		listener: (op: ISequencedDocumentMessage, runtimeMessage?: boolean) => void,
	): this;
}

/**
 * Options affecting summarize behavior.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface ISummarizeOptions {
	/**
	 * True to generate the full tree with no handle reuse optimizations; defaults to false
	 */
	readonly fullTree?: boolean;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface ISubmitSummaryOptions extends ISummarizeOptions {
	/**
	 * Logger to use for correlated summary events
	 */
	readonly summaryLogger: ITelemetryLoggerExt;
	/**
	 * Tells when summary process should be cancelled
	 */

	readonly cancellationToken: ISummaryCancellationToken;
	/**
	 * Summarization may be attempted multiple times. This tells whether this is the final summarization attempt.
	 */
	readonly finalAttempt?: boolean;
	/**
	 * The sequence number of the latest summary used to validate if summary state is correct before summarizing
	 */
	readonly latestSummaryRefSeqNum: number;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IOnDemandSummarizeOptions extends ISummarizeOptions {
	/**
	 * Reason for generating summary.
	 */
	readonly reason: string;
	/**
	 * In case of a failure, will attempt to retry based on if the failure is retriable.
	 */
	readonly retryOnFailure?: boolean;
}

/**
 * Options to use when enqueueing a summarize attempt.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IEnqueueSummarizeOptions extends IOnDemandSummarizeOptions {
	/**
	 * If specified, The summarize attempt will not occur until after this sequence number.
	 */
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
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IGeneratedSummaryStats extends ISummaryStats {
	/**
	 * The total number of data stores in the container.
	 */
	readonly dataStoreCount: number;
	/**
	 * The number of data stores that were summarized in this summary.
	 */
	readonly summarizedDataStoreCount: number;
	/**
	 * The number of data stores whose GC reference state was updated in this summary.
	 */
	readonly gcStateUpdatedDataStoreCount?: number;
	/**
	 * The size of the gc blobs in this summary.
	 */
	readonly gcTotalBlobsSize?: number;
	/**
	 * The number of gc blobs in this summary.
	 */
	readonly gcBlobNodeCount?: number;
	/**
	 * The summary number for a container's summary. Incremented on summaries throughout its lifetime.
	 */
	readonly summaryNumber: number;
}

/**
 * Type for summarization failures that are retriable.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IRetriableFailureError extends Error {
	readonly retryAfterSeconds?: number;
}

/**
 * Base results for all submitSummary attempts.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IBaseSummarizeResult {
	readonly stage: "base";
	/**
	 * Retriable error object related to failed summarize attempt.
	 */

	readonly error: IRetriableFailureError | undefined;
	/**
	 * Reference sequence number as of the generate summary attempt.
	 */
	readonly referenceSequenceNumber: number;
	readonly minimumSequenceNumber: number;
}

/**
 * Results of submitSummary after generating the summary tree.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IGenerateSummaryTreeResult extends Omit<IBaseSummarizeResult, "stage"> {
	readonly stage: "generate";
	/**
	 * Generated summary tree.
	 */
	readonly summaryTree: ISummaryTree;
	/**
	 * Stats for generated summary tree.
	 */

	readonly summaryStats: IGeneratedSummaryStats;
	/**
	 * Time it took to generate the summary tree and stats.
	 */
	readonly generateDuration: number;
}

/**
 * Results of submitSummary after uploading the tree to storage.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IUploadSummaryResult extends Omit<IGenerateSummaryTreeResult, "stage"> {
	readonly stage: "upload";
	/**
	 * The handle returned by storage pointing to the uploaded summary tree.
	 */
	readonly handle: string;
	/**
	 * Time it took to upload the summary tree to storage.
	 */
	readonly uploadDuration: number;
}

/**
 * Results of submitSummary after submitting the summarize op.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */
export interface ISubmitSummaryOpResult extends Omit<IUploadSummaryResult, "stage" | "error"> {
	readonly stage: "submit";
	/**
	 * The client sequence number of the summarize op submitted for the summary.
	 */
	readonly clientSequenceNumber: number;
	/**
	 * Time it took to submit the summarize op to the broadcasting service.
	 */
	readonly submitOpDuration: number;
}

/**
 * Strict type representing result of a submitSummary attempt.
 * The result consists of 4 possible stages, each with its own data.
 * The data is cumulative, so each stage will contain the data from the previous stages.
 * If the final "submitted" stage is not reached, the result may contain the error object.
 *
 * Stages:
 *
 * 1. "base" - stopped before the summary tree was even generated, and the result only contains the base data
 *
 * 2. "generate" - the summary tree was generated, and the result will contain that tree + stats
 *
 * 3. "upload" - the summary was uploaded to storage, and the result contains the server-provided handle
 *
 * 4. "submit" - the summarize op was submitted, and the result contains the op client sequence number.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export type SubmitSummaryResult =
	| IBaseSummarizeResult
	| IGenerateSummaryTreeResult
	| IUploadSummaryResult
	| ISubmitSummaryOpResult;

/**
 * The stages of Summarize, used to describe how far progress succeeded in case of a failure at a later stage.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export type SummaryStage = SubmitSummaryResult["stage"] | "unknown";

/**
 * The data in summarizer result when submit summary stage fails.
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface SubmitSummaryFailureData {
	stage: SummaryStage;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IBroadcastSummaryResult {
	readonly summarizeOp: ISummaryOpMessage;
	readonly broadcastDuration: number;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface IAckSummaryResult {
	readonly summaryAckOp: ISummaryAckMessage;
	readonly ackNackDuration: number;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface INackSummaryResult {
	readonly summaryNackOp: ISummaryNackMessage;
	readonly ackNackDuration: number;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export type SummarizeResultPart<TSuccess, TFailure = undefined> =
	| {
			success: true;
			data: TSuccess;
	  }
	| {
			success: false;
			data: TFailure | undefined;
			message: string;

			error: IRetriableFailureError;
	  };

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface ISummarizeResults {
	/**
	 * Resolves when we generate, upload, and submit the summary.
	 */
	readonly summarySubmitted: Promise<
		SummarizeResultPart<SubmitSummaryResult, SubmitSummaryFailureData>
	>;
	/**
	 * Resolves when we observe our summarize op broadcast.
	 */

	readonly summaryOpBroadcasted: Promise<SummarizeResultPart<IBroadcastSummaryResult>>;
	/**
	 * Resolves when we receive a summaryAck or summaryNack.
	 */
	readonly receivedSummaryAckOrNack: Promise<
		SummarizeResultPart<IAckSummaryResult, INackSummaryResult>
	>;
}

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export type EnqueueSummarizeResult =
	| (ISummarizeResults & {
			/**
			 * Indicates that another summarize attempt is not already enqueued,
			 * and this attempt has been enqueued.
			 */
			readonly alreadyEnqueued?: undefined;
	  })
	| (ISummarizeResults & {
			/**
			 * Indicates that another summarize attempt was already enqueued.
			 */
			readonly alreadyEnqueued: true;
			/**
			 * Indicates that the other enqueued summarize attempt was abandoned,
			 * and this attempt has been enqueued enqueued.
			 */
			readonly overridden: true;
	  })
	| {
			/**
			 * Indicates that another summarize attempt was already enqueued.
			 */
			readonly alreadyEnqueued: true;
			/**
			 * Indicates that the other enqueued summarize attempt remains enqueued,
			 * and this attempt has not been enqueued.
			 */
			readonly overridden?: undefined;
	  };

/**
 * @legacy
 * @internal
 * @deprecated - This type will be moved to internal in 2.30. External usage is not necessary or supported.
 */

export interface ISummarizer extends IEventProvider<ISummarizerEvents> {
	/**
	 * Allows {@link ISummarizer} to be used with our {@link @fluidframework/core-interfaces#FluidObject} pattern.
	 */

	readonly ISummarizer?: ISummarizer;

	/*
	 * Asks summarizer to move to exit.
	 * Summarizer will finish current processes, which may take a while.
	 * For example, summarizer may complete last summary before exiting.
	 */

	stop(reason: SummarizerStopReason): void;

	/* Closes summarizer. Any pending processes (summary in flight) are abandoned. */
	close(): void;

	run(onBehalfOf: string): Promise<SummarizerStopReason>;

	/**
	 * Attempts to generate a summary on demand. If already running, takes no action.
	 * @param options - options controlling the summarize attempt
	 * @returns an alreadyRunning promise if a summarize attempt is already in progress,
	 * which will resolve when the current attempt completes. At that point caller can
	 * decide to try again or not. Otherwise, it will return an object containing promises
	 * that resolve as the summarize attempt progresses. They will resolve with success
	 * false if a failure is encountered.
	 */

	summarizeOnDemand(options: IOnDemandSummarizeOptions): ISummarizeResults;
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

/**
 * Data about an attempt to summarize used for heuristics.
 */
export interface ISummarizeAttempt {
	/**
	 * Reference sequence number when summary was generated or attempted
	 */
	readonly refSequenceNumber: number;

	/**
	 * Time of summary attempt after it was sent or attempted
	 */
	readonly summaryTime: number;

	/**
	 * Sequence number of summary op
	 */
	summarySequenceNumber?: number;
}

/**
 * Data relevant for summary heuristics.
 */
export interface ISummarizeHeuristicData {
	/**
	 * Latest received op sequence number
	 */
	lastOpSequenceNumber: number;

	/**
	 * Most recent summary attempt from this client
	 */
	readonly lastAttempt: ISummarizeAttempt;

	/**
	 * Most recent summary that received an ack
	 */
	readonly lastSuccessfulSummary: Readonly<ISummarizeAttempt>;

	/**
	 * Number of runtime ops since last summary
	 */
	numRuntimeOps: number;

	/**
	 * Number of non-runtime ops since last summary
	 */
	numNonRuntimeOps: number;

	/**
	 * Cumulative size in bytes of all the ops since the last summary
	 */
	totalOpsSize: number;

	/**
	 * Wether or not this instance contains adjusted metrics due to missing op data
	 */
	hasMissingOpData: boolean;

	/**
	 * Updates lastAttempt and lastSuccessfulAttempt based on the last summary.
	 * @param lastSummary - last ack summary
	 */
	updateWithLastSummaryAckInfo(lastSummary: ISummarizeAttempt): void;

	/**
	 * Records a summary attempt. If the attempt was successfully sent,
	 * provide the reference sequence number, otherwise it will be set
	 * to the last seen op sequence number.
	 * @param referenceSequenceNumber - reference sequence number of sent summary
	 */
	recordAttempt(referenceSequenceNumber?: number): void;

	/**
	 * Mark that the last sent summary attempt has received an ack
	 */
	markLastAttemptAsSuccessful(): void;

	opsSinceLastSummary: number;
}

/**
 * Responsible for running heuristics determining when to summarize.
 */
export interface ISummarizeHeuristicRunner {
	/**
	 * Start specific heuristic trackers (ex: idle timer)
	 */
	start(): void;

	/**
	 * Runs the heuristics to determine if it should try to summarize
	 */
	run(): void;

	/**
	 * Runs a different heuristic to check if it should summarize before closing
	 */
	shouldRunLastSummary(): boolean;

	/**
	 * Disposes of resources
	 */
	dispose(): void;
}

type ISummarizeTelemetryRequiredProperties =
	/**
	 * Reason code for attempting to summarize
	 */

	"summarizeReason";

type ISummarizeTelemetryOptionalProperties =
	/**
	 * Number of attempts within the last time window, used for calculating the throttle delay.
	 */
	| "summaryAttempts"
	/**
	 * Summarization may be attempted multiple times. This tells whether this is the final summarization attempt
	 */
	| "finalAttempt"
	| keyof ISummarizeOptions;

export type ISummarizeTelemetryProperties = Pick<
	ITelemetryBaseProperties,
	ISummarizeTelemetryRequiredProperties
> &
	Partial<Pick<ITelemetryBaseProperties, ISummarizeTelemetryOptionalProperties>>;

/**
 * Strategy used to heuristically determine when we should run a summary
 */
export interface ISummaryHeuristicStrategy {
	/**
	 * Summarize reason for this summarize heuristic strategy (ex: "maxTime")
	 */

	summarizeReason: Readonly<SummarizeReason>;

	/**
	 * Determines if this strategy's summarize criteria been met
	 * @param configuration - summary configuration we are to check against
	 * @param heuristicData - heuristic data used to confirm conditions are met
	 */
	shouldRunSummary(
		configuration: ISummaryConfigurationHeuristics,
		heuristicData: ISummarizeHeuristicData,
	): boolean;
}

type SummaryGeneratorRequiredTelemetryProperties =
	/**
	 * True to generate the full tree with no handle reuse optimizations
	 */
	| "fullTree"
	/**
	 * Time since we last attempted to generate a summary
	 */
	| "timeSinceLastAttempt"
	/**
	 * Time since we last successfully generated a summary
	 */
	| "timeSinceLastSummary";

type SummaryGeneratorOptionalTelemetryProperties =
	/**
	 * Reference sequence number as of the generate summary attempt.
	 */
	| "referenceSequenceNumber"
	/**
	 * minimum sequence number (at the reference sequence number)
	 */
	| "minimumSequenceNumber"
	/**
	 * Delta between the current reference sequence number and the reference sequence number of the last attempt
	 */
	| "opsSinceLastAttempt"
	/**
	 * Delta between the current reference sequence number and the reference sequence number of the last summary
	 */
	| "opsSinceLastSummary"
	/**
	 * Delta in sum of op sizes between the current reference sequence number and the reference
	 * sequence number of the last summary
	 */
	| "opsSizesSinceLastSummary"
	/**
	 * Delta between the number of non-runtime ops since the last summary
	 */
	| "nonRuntimeOpsSinceLastSummary"
	/**
	 * Delta between the number of runtime ops since the last summary
	 */
	| "runtimeOpsSinceLastSummary"
	/**
	 * Wether or not this instance contains adjusted metrics due to missing op data
	 */
	| "hasMissingOpData"
	/**
	 * Time it took to generate the summary tree and stats.
	 */
	| "generateDuration"
	/**
	 * The handle returned by storage pointing to the uploaded summary tree.
	 */
	| "handle"
	/**
	 * Time it took to upload the summary tree to storage.
	 */
	| "uploadDuration"
	/**
	 * The client sequence number of the summarize op submitted for the summary.
	 */
	| "clientSequenceNumber"
	/**
	 * Time it took for this summary to be acked after it was generated
	 */
	| "ackWaitDuration"
	/**
	 * Reference sequence number of the ack/nack message
	 */
	| "ackNackSequenceNumber"
	/**
	 * Actual sequence number of the summary op proposal.
	 */
	| "summarySequenceNumber"
	/**
	 * Optional Retry-After time in seconds. If specified, the client should wait this many seconds before retrying.
	 */
	| "nackRetryAfter"
	/**
	 * The stage at which the submit summary method failed at. This can help determine what type of failure we have
	 */
	| "stage";

export type SummaryGeneratorTelemetry = Pick<
	ITelemetryBaseProperties,
	SummaryGeneratorRequiredTelemetryProperties
> &
	Partial<Pick<ITelemetryBaseProperties, SummaryGeneratorOptionalTelemetryProperties>>;

export interface ISummarizeRunnerTelemetry extends ITelemetryLoggerPropertyBag {
	/**
	 * Number of times the summarizer run.
	 */
	summarizeCount: () => number;
	/**
	 * Number of successful attempts to summarize.
	 */

	summarizerSuccessfulAttempts: () => number;
}
