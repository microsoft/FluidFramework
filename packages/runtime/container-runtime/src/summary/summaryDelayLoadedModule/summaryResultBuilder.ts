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
} from "../index.js";

import type {
	IAckSummaryResult,
	IBroadcastSummaryResult,
	INackSummaryResult,
	ISummarizeResults,
} from "./summaryResultTypes.js";

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
