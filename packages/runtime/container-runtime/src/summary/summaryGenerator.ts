/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import {
	assert,
	Deferred,
	IPromiseTimer,
	IPromiseTimerResult,
	Timer,
} from "@fluidframework/core-utils/internal";
import { DriverErrorTypes, MessageType } from "@fluidframework/driver-definitions/internal";
import { getRetryDelaySecondsFromError } from "@fluidframework/driver-utils/internal";
import {
	isFluidError,
	ITelemetryLoggerExt,
	LoggingError,
	PerformanceEvent,
	wrapError,
} from "@fluidframework/telemetry-utils/internal";

import {
	IAckSummaryResult,
	IBroadcastSummaryResult,
	INackSummaryResult,
	// eslint-disable-next-line import/no-deprecated
	IRefreshSummaryAckOptions,
	// eslint-disable-next-line import/no-deprecated
	ISubmitSummaryOptions,
	ISummarizeHeuristicData,
	ISummarizeResults,
	// eslint-disable-next-line import/no-deprecated
	ISummaryCancellationToken,
	SubmitSummaryFailureData,
	SubmitSummaryResult,
	SummarizeResultPart,
	SummaryGeneratorTelemetry,
	type IRetriableFailureError,
} from "./summarizerTypes.js";
import { IClientSummaryWatcher } from "./summaryCollection.js";

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
	// eslint-disable-next-line import/no-deprecated
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

// Send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // Double and resend 5 times

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

/**
 * This class generates and tracks a summary attempt.
 */
export class SummaryGenerator {
	private readonly summarizeTimer: Timer;
	constructor(
		private readonly pendingAckTimer: IPromiseTimer,
		private readonly heuristicData: ISummarizeHeuristicData,
		private readonly submitSummaryCallback: (
			// eslint-disable-next-line import/no-deprecated
			options: ISubmitSummaryOptions,
		) => Promise<SubmitSummaryResult>,
		private readonly successfulSummaryCallback: () => void,
		private readonly refreshLatestSummaryCallback: (
			// eslint-disable-next-line import/no-deprecated
			options: IRefreshSummaryAckOptions,
		) => Promise<void>,
		private readonly summaryWatcher: Pick<IClientSummaryWatcher, "watchSummary">,
		private readonly logger: ITelemetryLoggerExt,
	) {
		this.summarizeTimer = new Timer(maxSummarizeTimeoutTime, () =>
			this.summarizeTimerHandler(maxSummarizeTimeoutTime, 1),
		);
	}

	/**
	 * Generates summary and listens for broadcast and ack/nack.
	 * Returns true for ack, false for nack, and undefined for failure or timeout.
	 * @param summaryOptions - options controlling how the summary is generated or submitted.
	 * @param resultsBuilder - optional, result builder to use to build pass or fail result.
	 */
	public summarize(
		// eslint-disable-next-line import/no-deprecated
		summaryOptions: ISubmitSummaryOptions,
		resultsBuilder = new SummarizeResultBuilder(),
	): ISummarizeResults {
		this.summarizeCore(summaryOptions, resultsBuilder).catch((error) => {
			const message = "UnexpectedSummarizeError";
			summaryOptions.summaryLogger.sendErrorEvent({ eventName: message }, error);
			resultsBuilder.fail(message, error);
		});

		return resultsBuilder.build();
	}

	private async summarizeCore(
		// eslint-disable-next-line import/no-deprecated
		submitSummaryOptions: ISubmitSummaryOptions,
		resultsBuilder: SummarizeResultBuilder,
	): Promise<void> {
		const { summaryLogger, cancellationToken, ...summarizeOptions } = submitSummaryOptions;

		// Note: timeSinceLastAttempt and timeSinceLastSummary for the
		// first summary are basically the time since the summarizer was loaded.
		const timeSinceLastAttempt = Date.now() - this.heuristicData.lastAttempt.summaryTime;
		const timeSinceLastSummary =
			Date.now() - this.heuristicData.lastSuccessfulSummary.summaryTime;
		let summarizeTelemetryProps: SummaryGeneratorTelemetry = {
			...summarizeOptions,
			fullTree: summarizeOptions.fullTree ?? false,
			timeSinceLastAttempt,
			timeSinceLastSummary,
		};

		const summarizeEvent = PerformanceEvent.start(
			summaryLogger,
			{
				eventName: "Summarize",
				...summarizeTelemetryProps,
			},
			{ start: true, end: true, cancel: "generic" },
		);

		let summaryData: SubmitSummaryResult | undefined;

		/**
		 * Summarization can fail during submit, during op broadcast or during nack.
		 * For submit failures, submitFailureResult should be provided. For nack failures, nackSummaryResult should
		 * be provided. For op broadcast failures, only errors / properties should be provided.
		 */
		const fail = (
			errorCode: SummarizeErrorCode,
			error: IRetriableFailureError,
			properties?: SummaryGeneratorTelemetry,
			submitFailureResult?: SubmitSummaryFailureData,
			nackSummaryResult?: INackSummaryResult,
		): void => {
			// Report any failure as an error unless it was due to cancellation (like "disconnected" error)
			// If failure happened on upload, we may not yet realized that socket disconnected, so check
			// offlineError too.
			const category =
				cancellationToken.cancelled ||
				(isFluidError(error) && error?.errorType === DriverErrorTypes.offlineError)
					? "generic"
					: "error";

			const reason = getFailMessage(errorCode);
			summarizeEvent.cancel(
				{
					...properties,
					reason,
					category,
					retryAfterSeconds: error.retryAfterSeconds,
				},
				error,
			); // disconnect & summaryAckTimeout do not have proper error.

			resultsBuilder.fail(reason, error, submitFailureResult, nackSummaryResult);
		};

		// Wait to generate and send summary
		this.summarizeTimer.start();
		try {
			// Need to save refSeqNum before we record new attempt (happens as part of submitSummaryCallback)
			const lastAttemptRefSeqNum = this.heuristicData.lastAttempt.refSequenceNumber;

			summaryData = await this.submitSummaryCallback(submitSummaryOptions);

			// Cumulatively add telemetry properties based on how far generateSummary went.
			const referenceSequenceNumber = summaryData.referenceSequenceNumber;
			summarizeTelemetryProps = {
				...summarizeTelemetryProps,
				referenceSequenceNumber,
				minimumSequenceNumber: summaryData.minimumSequenceNumber,
				opsSinceLastAttempt: referenceSequenceNumber - lastAttemptRefSeqNum,
				opsSinceLastSummary:
					referenceSequenceNumber - this.heuristicData.lastSuccessfulSummary.refSequenceNumber,
				stage: summaryData.stage,
			};
			summarizeTelemetryProps = this.addSummaryDataToTelemetryProps(
				summaryData,
				summarizeTelemetryProps,
			);

			if (summaryData.stage !== "submit") {
				const errorCode: SummarizeErrorCode = "submitSummaryFailure";
				const retriableError =
					summaryData.error ?? new RetriableSummaryError(getFailMessage(errorCode));
				return fail(errorCode, retriableError, summarizeTelemetryProps, {
					stage: summaryData.stage,
				});
			}

			/**
			 * With incremental summaries, if the full tree was not summarized, only data stores that changed should
			 * be summarized. A data store is considered changed if either or both of the following is true:
			 * - It has received an op.
			 * - Its reference state changed, i.e., it went from referenced to unreferenced or vice-versa.
			 *
			 * In the extreme case, every op can be for a different data store and each op can result in the reference
			 * state change of multiple data stores. So, the total number of data stores that are summarized should not
			 * exceed the number of ops since last summary + number of data store whose reference state changed.
			 */
			if (!submitSummaryOptions.fullTree) {
				const { summarizedDataStoreCount, gcStateUpdatedDataStoreCount = 0 } =
					summaryData.summaryStats;
				if (
					summarizedDataStoreCount >
					gcStateUpdatedDataStoreCount + this.heuristicData.opsSinceLastSummary
				) {
					summaryLogger.sendErrorEvent({
						eventName: "IncrementalSummaryViolation",
						summarizedDataStoreCount,
						gcStateUpdatedDataStoreCount,
						opsSinceLastSummary: this.heuristicData.opsSinceLastSummary,
					});
				}
			}

			// Log event here on summary success only, as Summarize_cancel duplicates failure logging.
			summarizeEvent.reportEvent("generate", { ...summarizeTelemetryProps });
			resultsBuilder.summarySubmitted.resolve({ success: true, data: summaryData });
		} catch (error) {
			return fail(
				"submitSummaryFailure",
				wrapError(
					error,
					(message) =>
						new RetriableSummaryError(message, getRetryDelaySecondsFromError(error)),
				),
				undefined /* properties */,
				{
					stage: "unknown",
				},
			);
		} finally {
			if (summaryData === undefined) {
				this.heuristicData.recordAttempt();
			}
			this.summarizeTimer.clear();
		}

		try {
			const pendingTimeoutP = this.pendingAckTimer.start();
			const summary = this.summaryWatcher.watchSummary(summaryData.clientSequenceNumber);

			// Wait for broadcast
			const waitBroadcastResult = await raceTimer(
				summary.waitBroadcast(),
				pendingTimeoutP,
				cancellationToken,
			);
			if (waitBroadcastResult.result === "cancelled") {
				const errorCode: SummarizeErrorCode = "disconnect";
				return fail(errorCode, new RetriableSummaryError(getFailMessage(errorCode)));
			}
			if (waitBroadcastResult.result !== "done") {
				// The summary op may not have been received within the timeout due to a transient error. So,
				// fail with a retriable error to re-attempt the summary if possible.
				const errorCode: SummarizeErrorCode = "summaryOpWaitTimeout";
				return fail(
					errorCode,
					new RetriableSummaryError(getFailMessage(errorCode), 0 /* retryAfterSeconds */),
				);
			}
			const summarizeOp = waitBroadcastResult.value;

			const broadcastDuration = Date.now() - this.heuristicData.lastAttempt.summaryTime;
			resultsBuilder.summaryOpBroadcasted.resolve({
				success: true,
				data: { summarizeOp, broadcastDuration },
			});

			this.heuristicData.lastAttempt.summarySequenceNumber = summarizeOp.sequenceNumber;
			summaryLogger.sendTelemetryEvent({
				eventName: "Summarize_Op",
				duration: broadcastDuration,
				referenceSequenceNumber: summarizeOp.referenceSequenceNumber,
				summarySequenceNumber: summarizeOp.sequenceNumber,
				handle: summarizeOp.contents.handle,
			});

			// Wait for ack/nack
			const waitAckNackResult = await raceTimer(
				summary.waitAckNack(),
				pendingTimeoutP,
				cancellationToken,
			);
			if (waitAckNackResult.result === "cancelled") {
				const errorCode: SummarizeErrorCode = "disconnect";
				return fail(errorCode, new RetriableSummaryError(getFailMessage(errorCode)));
			}
			if (waitAckNackResult.result !== "done") {
				const errorCode: SummarizeErrorCode = "summaryAckWaitTimeout";
				// The summary ack may not have been received within the timeout due to a transient error. So,
				// fail with a retriable error to re-attempt the summary if possible.
				return fail(
					errorCode,
					new RetriableSummaryError(getFailMessage(errorCode), 0 /* retryAfterSeconds */),
				);
			}
			const ackNackOp = waitAckNackResult.value;
			this.pendingAckTimer.clear();

			// Update for success/failure
			const ackNackDuration = Date.now() - this.heuristicData.lastAttempt.summaryTime;

			// adding new properties
			summarizeTelemetryProps = {
				ackWaitDuration: ackNackDuration,
				ackNackSequenceNumber: ackNackOp.sequenceNumber,
				summarySequenceNumber: ackNackOp.contents.summaryProposal.summarySequenceNumber,
				...summarizeTelemetryProps,
			};
			if (ackNackOp.type === MessageType.SummaryAck) {
				this.heuristicData.markLastAttemptAsSuccessful();
				this.successfulSummaryCallback();
				summarizeEvent.end({
					...summarizeTelemetryProps,
					handle: ackNackOp.contents.handle,
				});
				// This processes the summary ack of the successful summary. This is so that the next summary does not
				// start before the ack of the previous summary is processed.
				await this.refreshLatestSummaryCallback({
					proposalHandle: summarizeOp.contents.handle,
					ackHandle: ackNackOp.contents.handle,
					summaryRefSeq: summarizeOp.referenceSequenceNumber,
					summaryLogger,
				});
				resultsBuilder.receivedSummaryAckOrNack.resolve({
					success: true,
					data: {
						summaryAckOp: ackNackOp,
						ackNackDuration,
					},
				});
			} else {
				// Check for retryDelay in summaryNack response.
				assert(ackNackOp.type === MessageType.SummaryNack, 0x274 /* "type check" */);
				const summaryNack = ackNackOp.contents;
				const errorMessage = summaryNack?.message;
				const retryAfterSeconds = summaryNack?.retryAfter;

				const errorCode: SummarizeErrorCode = "summaryNack";

				// pre-0.58 error message prefix: summaryNack
				const error = new RetriableSummaryError(getFailMessage(errorCode), retryAfterSeconds, {
					errorMessage,
				});

				assert(
					getRetryDelaySecondsFromError(error) === retryAfterSeconds,
					0x25f /* "retryAfterSeconds" */,
				);
				// This will only set resultsBuilder.receivedSummaryAckOrNack, as other promises are already set.
				return fail(
					errorCode,
					error,
					{ ...summarizeTelemetryProps, nackRetryAfter: retryAfterSeconds },
					undefined /* submitFailureResult */,
					{ summaryNackOp: ackNackOp, ackNackDuration },
				);
			}
		} finally {
			this.pendingAckTimer.clear();
		}
	}

	private addSummaryDataToTelemetryProps(
		summaryData: SubmitSummaryResult,
		initialProps: SummaryGeneratorTelemetry,
	): SummaryGeneratorTelemetry {
		switch (summaryData.stage) {
			case "base":
				return initialProps;

			case "generate":
				return {
					...initialProps,
					...summaryData.summaryStats,
					generateDuration: summaryData.generateDuration,
				};

			case "upload":
				return {
					...initialProps,
					...summaryData.summaryStats,
					generateDuration: summaryData.generateDuration,
					handle: summaryData.handle,
					uploadDuration: summaryData.uploadDuration,
				};

			case "submit":
				return {
					...initialProps,
					...summaryData.summaryStats,
					generateDuration: summaryData.generateDuration,
					handle: summaryData.handle,
					uploadDuration: summaryData.uploadDuration,
					clientSequenceNumber: summaryData.clientSequenceNumber,
					hasMissingOpData: this.heuristicData.hasMissingOpData,
					opsSizesSinceLastSummary: this.heuristicData.totalOpsSize,
					nonRuntimeOpsSinceLastSummary: this.heuristicData.numNonRuntimeOps,
					runtimeOpsSinceLastSummary: this.heuristicData.numRuntimeOps,
				};

			default:
				assert(true, 0x397 /* Unexpected summary stage */);
		}

		return initialProps;
	}

	private summarizeTimerHandler(time: number, count: number): void {
		this.logger.sendPerformanceEvent({
			eventName: "SummarizeTimeout",
			timeoutTime: time,
			timeoutCount: count,
		});
		if (count < maxSummarizeTimeoutCount) {
			// Double and start a new timer
			const nextTime = time * 2;
			this.summarizeTimer.start(nextTime, () =>
				this.summarizeTimerHandler(nextTime, count + 1),
			);
		}
	}

	public dispose(): void {
		this.summarizeTimer.clear();
	}
}
