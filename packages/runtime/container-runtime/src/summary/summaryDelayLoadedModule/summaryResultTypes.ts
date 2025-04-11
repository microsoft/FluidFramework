/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SubmitSummaryFailureData,
	SubmitSummaryResult,
	SummarizeResultPart,
} from "../summarizerTypes.js";
import type {
	ISummaryAckMessage,
	ISummaryNackMessage,
	ISummaryOpMessage,
} from "../summaryCollection.js";

/**
 * @legacy
 * @alpha
 */
export interface IBroadcastSummaryResult {
	readonly summarizeOp: ISummaryOpMessage;
	readonly broadcastDuration: number;
}

/**
 * @legacy
 * @alpha
 */
export interface IAckSummaryResult {
	readonly summaryAckOp: ISummaryAckMessage;
	readonly ackNackDuration: number;
}

/**
 * @legacy
 * @alpha
 */
export interface INackSummaryResult {
	readonly summaryNackOp: ISummaryNackMessage;
	readonly ackNackDuration: number;
}

/**
 * @legacy
 * @alpha
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
 * @alpha
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
