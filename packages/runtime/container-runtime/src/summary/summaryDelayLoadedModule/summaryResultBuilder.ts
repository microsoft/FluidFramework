/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Deferred } from "@fluidframework/core-utils/internal";

import {
	SubmitSummaryFailureData,
	SubmitSummaryResult,
	SummarizeResultPart,
	type IRetriableFailureError,
} from "../summarizerTypes.js";

import type {
	ISummaryAckMessage,
	ISummaryNackMessage,
	ISummaryOpMessage,
} from "./summaryCollection.js";

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

export class SummarizeResultBuilder {
	public readonly summarySubmitted = new Deferred<
		SummarizeResultPart<SubmitSummaryResult, SubmitSummaryFailureData>
	>();
	public readonly summaryOpBroadcasted = new Deferred<
		SummarizeResultPart<IBroadcastSummaryResult>
	>();
	public readonly receivedSummaryAckOrNack = new Deferred<
		SummarizeResultPart<IAckSummaryResult, INackSummaryResult>
	>();

	/**
	 * Fails one or more of the three results as per the passed params.
	 * If submit fails, all three results fail.
	 * If op broadcast fails, only op broadcast result and ack nack result fails.
	 * If ack nack fails, only ack nack result fails.
	 */
	public fail(
		message: string,
		error: IRetriableFailureError,
		submitFailureResult?: SubmitSummaryFailureData,
		nackSummaryResult?: INackSummaryResult,
	): void {
		assert(
			!this.receivedSummaryAckOrNack.isCompleted,
			0x25e /* "no reason to call fail if all promises have been completed" */,
		);

		const result: SummarizeResultPart<undefined> = {
			success: false,
			message,
			data: undefined,
			error,
		} as const;

		// Note that if any of these are already resolved, it will be a no-op. For example, if ack nack failed but
		// submit summary and op broadcast has already been resolved as passed, only ack nack result will get modified.
		this.summarySubmitted.resolve({ ...result, data: submitFailureResult });
		this.summaryOpBroadcasted.resolve(result);
		this.receivedSummaryAckOrNack.resolve({ ...result, data: nackSummaryResult });
	}
	public build(): ISummarizeResults {
		return {
			summarySubmitted: this.summarySubmitted.promise,
			summaryOpBroadcasted: this.summaryOpBroadcasted.promise,
			receivedSummaryAckOrNack: this.receivedSummaryAckOrNack.promise,
		} as const;
	}
}
