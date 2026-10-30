/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	SubmitSummaryFailureData,
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	SubmitSummaryResult,
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	SummarizeResultPart,
} from "../summarizerTypes.js";
import type {
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	ISummaryAckMessage,
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	ISummaryNackMessage,
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	ISummaryOpMessage,
} from "../summaryCollection.js";

/**
 * @deprecated This detailed summarizer broadcast result will become internal.
 * There is no supported replacement for these implementation-level results.
 * See {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/88250 | AB#88250} for tracking.
 * @legacy @beta
 */
export interface IBroadcastSummaryResult {
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	readonly summarizeOp: ISummaryOpMessage;
	readonly broadcastDuration: number;
}

/**
 * @deprecated This detailed summarizer acknowledgement result will become internal.
 * There is no supported replacement for these implementation-level results.
 * See {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/88250 | AB#88250} for tracking.
 * @legacy @beta
 */
export interface IAckSummaryResult {
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	readonly summaryAckOp: ISummaryAckMessage;
	readonly ackNackDuration: number;
}

/**
 * @deprecated This detailed summarizer negative acknowledgement result will become internal.
 * There is no supported replacement for these implementation-level results.
 * See {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/88250 | AB#88250} for tracking.
 * @legacy @beta
 */
export interface INackSummaryResult {
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	readonly summaryNackOp: ISummaryNackMessage;
	readonly ackNackDuration: number;
}

/**
 * @deprecated This detailed summarizer result interface will become internal.
 * For application-requested summaries, use {@link @fluidframework/container-loader#loadSummarizerContainerAndMakeSummary}
 * from `@fluidframework/container-loader/legacy`.
 * Its result does not expose the same stage promises or acknowledgement results.
 * See {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/88250 | AB#88250} for tracking.
 * @legacy @beta
 */
export interface ISummarizeResults {
	/**
	 * Resolves when we generate, upload, and submit the summary.
	 */
	readonly summarySubmitted: Promise<
		// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
		SummarizeResultPart<SubmitSummaryResult, SubmitSummaryFailureData>
	>;
	/**
	 * Resolves when we observe our summarize op broadcast.
	 */
	// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
	readonly summaryOpBroadcasted: Promise<SummarizeResultPart<IBroadcastSummaryResult>>;
	/**
	 * Resolves when we receive a summaryAck or summaryNack.
	 */
	readonly receivedSummaryAckOrNack: Promise<
		// eslint-disable-next-line import-x/no-deprecated -- Internal implementation use is supported (AB#88250).
		SummarizeResultPart<IAckSummaryResult, INackSummaryResult>
	>;
}

/**
 * @deprecated This summarizer enqueue result type will become internal.
 * There is no supported replacement for enqueueing summaries.
 * See {@link https://dev.azure.com/fluidframework/internal/_workitems/edit/88250 | AB#88250} for tracking.
 * @legacy @beta
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
