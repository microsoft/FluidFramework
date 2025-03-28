/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { IPromiseTimerResult } from "@fluidframework/core-utils/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

import { ISummaryCancellationToken, type IRetriableFailureError } from "./summarizerTypes.js";

export type raceTimerResult<T> =
	| { result: "done"; value: T }
	| { result: IPromiseTimerResult["timerResult"] }
	| { result: "cancelled" };

/**
 * Wait for a promise or PromiseTimer to elapse.
 */
export async function raceTimer<T>(
	promise: Promise<T>,
	timer: Promise<IPromiseTimerResult>,

	cancellationToken?: ISummaryCancellationToken,
): Promise<raceTimerResult<T>> {
	const promises: Promise<raceTimerResult<T>>[] = [
		promise.then((value) => ({ result: "done", value }) as const),
		timer.then(({ timerResult: result }) => ({ result }) as const),
	];
	if (cancellationToken !== undefined) {
		promises.push(
			cancellationToken.waitCancelled.then(() => ({ result: "cancelled" }) as const),
		);
	}
	return Promise.race(promises);
}

export type SummarizeReason =
	/**
	 * Attempt to summarize after idle timeout has elapsed.
	 * Idle timer restarts whenever an op is received. So this
	 * triggers only after some amount of time has passed with
	 * no ops being received.
	 */
	| "idle"
	/**
	 * Attempt to summarize after a maximum time since last
	 * successful summary has passed. This measures time since
	 * last summary ack op was processed.
	 */
	| "maxTime"
	/**
	 * Attempt to summarize after a maximum number of ops have
	 * passed since the last successful summary. This compares
	 * op sequence numbers with the reference sequence number
	 * of the summarize op corresponding to the last summary
	 * ack op.
	 */
	| "maxOps"
	/**
	 * Special case to attempt to summarize one last time before the
	 * summarizer client closes itself. This is to prevent cases where
	 * the summarizer client never gets a chance to summarize, because
	 * there are too many outstanding ops and/or parent client cannot
	 * stay connected long enough for summarizer client to catch up.
	 */
	| "lastSummary"
	/**
	 * On-demand summary requested with specified reason.
	 */
	| `onDemand;${string}`
	/**
	 * Enqueue summarize attempt with specified reason.
	 */
	| `enqueue;${string}`;

const summarizeErrors = {
	/**
	 * Error encountered while generating the summary tree, uploading
	 * it to storage, or submitting the op. It could be a result of
	 * the client becoming disconnected while generating or an actual error.
	 */
	submitSummaryFailure: "Error while generating, uploading, or submitting summary",
	/**
	 * The summaryAckWaitTimeout time has elapsed before receiving the summarize op
	 * sent by this summarize attempt. It is expected to be broadcast quickly.
	 */
	summaryOpWaitTimeout: "Timeout while waiting for summarize op broadcast",
	/**
	 * The summaryAckWaitTimeout time has elapsed before receiving either a
	 * summaryAck or summaryNack op from the server in response to this
	 * summarize attempt. It is expected that the server should respond.
	 */
	summaryAckWaitTimeout: "Timeout while waiting for summaryAck/summaryNack op",
	/**
	 * The server responded with a summaryNack op, thus rejecting this
	 * summarize attempt.
	 */
	summaryNack: "Server rejected summary via summaryNack op",

	disconnect: "Summary cancelled due to summarizer or main client disconnect",
} as const;

export type SummarizeErrorCode = keyof typeof summarizeErrors;

// Helper functions to report failures and return.
export const getFailMessage = (errorCode: SummarizeErrorCode): string =>
	`${errorCode}: ${summarizeErrors[errorCode]}`;

/**
 * Errors type for errors hit during summary that may be retriable.
 */
export class RetriableSummaryError extends LoggingError implements IRetriableFailureError {
	constructor(
		message: string,
		public readonly retryAfterSeconds?: number,
		props?: ITelemetryBaseProperties,
	) {
		super(message, props);
	}
}
