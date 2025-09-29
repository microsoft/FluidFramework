/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISummaryStats } from "@fluidframework/runtime-definitions/internal";

/**
 * In addition to the normal summary tree + stats, this contains additional stats only relevant at the root of the tree.
 * @legacy @beta
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
 * @legacy @beta
 */
export interface IRetriableFailureError extends Error {
	readonly retryAfterSeconds?: number;
}

/**
 * Base results for all submitSummary attempts.
 * @legacy @beta
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
 * @legacy @beta
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
 * @legacy @beta
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
 * @legacy @beta
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
 * @legacy @beta
 */
export type SubmitSummaryResult =
	| IBaseSummarizeResult
	| IGenerateSummaryTreeResult
	| IUploadSummaryResult
	| ISubmitSummaryOpResult;

/**
 * The stages of Summarize, used to describe how far progress succeeded in case of a failure at a later stage.
 * @legacy @beta
 */
export type SummaryStage = SubmitSummaryResult["stage"] | "unknown";

/**
 * The data in summarizer result when submit summary stage fails.
 * @legacy @beta
 */
export interface SubmitSummaryFailureData {
	readonly stage: SummaryStage;
}

/**
 * @legacy @beta
 */
export type SummarizeResultPart<TSuccess, TFailure = undefined> =
	| {
			readonly success: true;
			readonly data: TSuccess;
	  }
	| {
			readonly success: false;
			readonly data: TFailure | undefined;
			readonly message: string;
			readonly error: IRetriableFailureError;
	  };

/**
 * @legacy @beta
 */
export interface IBroadcastSummaryResult<TSummaryOpMessage = unknown> {
	readonly summarizeOp: TSummaryOpMessage;
	readonly broadcastDuration: number;
}

/**
 * @legacy @beta
 */
export interface IAckSummaryResult<TSummaryAckMessage = unknown> {
	readonly summaryAckOp: TSummaryAckMessage;
	readonly ackNackDuration: number;
}

/**
 * @legacy @beta
 */
export interface INackSummaryResult<TSummaryNackMessage = unknown> {
	readonly summaryNackOp: TSummaryNackMessage;
	readonly ackNackDuration: number;
}

/**
 * @legacy @beta
 */
export interface ISummarizeResults<
	TSummaryOpMessage = unknown,
	TSummaryAckMessage = unknown,
	TSummaryNackMessage = unknown,
> {
	/**
	 * Resolves when we generate, upload, and submit the summary.
	 */
	readonly summarySubmitted: Promise<
		SummarizeResultPart<SubmitSummaryResult, SubmitSummaryFailureData>
	>;
	/**
	 * Resolves when we observe our summarize op broadcast.
	 */
	readonly summaryOpBroadcasted: Promise<
		SummarizeResultPart<IBroadcastSummaryResult<TSummaryOpMessage>>
	>;
	/**
	 * Resolves when we receive a summaryAck or summaryNack.
	 */
	readonly receivedSummaryAckOrNack: Promise<
		SummarizeResultPart<
			IAckSummaryResult<TSummaryAckMessage>,
			INackSummaryResult<TSummaryNackMessage>
		>
	>;
}

/**
 * @legacy @beta
 */
export type EnqueueSummarizeResult<
	TSummaryOpMessage = unknown,
	TSummaryAckMessage = unknown,
	TSummaryNackMessage = unknown,
> =
	| (ISummarizeResults<TSummaryOpMessage, TSummaryAckMessage, TSummaryNackMessage> & {
			/**
			 * Indicates that another summarize attempt is not already enqueued,
			 * and this attempt has been enqueued.
			 */
			readonly alreadyEnqueued?: undefined;
	  })
	| (ISummarizeResults<TSummaryOpMessage, TSummaryAckMessage, TSummaryNackMessage> & {
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
 * @legacy @beta
 */
export interface SummaryOpContents {
	readonly handle?: string;
	readonly [key: string]: unknown;
}

/**
 * @legacy @beta
 */
export interface SummaryAckMessage {
	readonly contents: SummaryOpContents;
	readonly [key: string]: unknown;
}

/**
 * @legacy @beta
 */
export interface OnDemandSummarizeResults {
	readonly summarySubmitted: SummarizeResultPart<
		SubmitSummaryResult,
		SubmitSummaryFailureData
	>;
	readonly summaryOpBroadcasted: SummarizeResultPart<
		IBroadcastSummaryResult<Record<string, unknown>>
	>;
	readonly receivedSummaryAckOrNack: SummarizeResultPart<
		IAckSummaryResult<SummaryAckMessage>,
		INackSummaryResult<Record<string, unknown>>
	>;
}

/**
 * @legacy @beta
 */
export interface SummarizeResultsPromisesLike {
	readonly summarySubmitted: Promise<OnDemandSummarizeResults["summarySubmitted"]>;
	readonly summaryOpBroadcasted: Promise<OnDemandSummarizeResults["summaryOpBroadcasted"]>;
	readonly receivedSummaryAckOrNack: Promise<
		OnDemandSummarizeResults["receivedSummaryAckOrNack"]
	>;
}

/**
 * @legacy @beta
 */
export interface OnDemandSummarizeOptions {
	readonly reason?: string | undefined;
	readonly retryOnFailure?: boolean | undefined;
	readonly fullTree?: boolean | undefined;
}

/**
 * @legacy @beta
 */
export interface SummarizerLike {
	readonly ISummarizer?: SummarizerLike;
	summarizeOnDemand(options: OnDemandSummarizeOptions): SummarizeResultsPromisesLike;
}

/**
 * @legacy @beta
 */
export const summarizerRequestUrl = "_summarizer";

/**
 * @legacy @beta
 */
export interface ISummarizerSummarySuccess {
	readonly success: true;
	readonly summaryResults: OnDemandSummarizeResults;
}

/**
 * @legacy @beta
 */
export interface ISummarizerSummaryFailure {
	readonly success: false;
	readonly error: Error;
}

/**
 * @legacy @beta
 */
export type LoadSummarizerSummaryResult =
	| ISummarizerSummarySuccess
	| ISummarizerSummaryFailure;
