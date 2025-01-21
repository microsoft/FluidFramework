/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	ISummarizeEventProps,
	ISummarizerEvents,
	ISummarizerObservabilityProps,
	SummarizerStopReason,
} from "@fluidframework/container-runtime-definitions/internal";
import { IDisposable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, Deferred, PromiseTimer, delay } from "@fluidframework/core-utils/internal";
import {
	DriverErrorTypes,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	MonitoringContext,
	UsageError,
	createChildLogger,
	createChildMonitoringContext,
	isFluidError,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { ISummaryConfiguration } from "../containerRuntime.js";
import { opSize } from "../opProperties.js";

import { SummarizeHeuristicRunner } from "./summarizerHeuristics.js";
import {
	EnqueueSummarizeResult,
	IEnqueueSummarizeOptions,
	IOnDemandSummarizeOptions,
	// eslint-disable-next-line import/no-deprecated
	IRefreshSummaryAckOptions,
	// eslint-disable-next-line import/no-deprecated
	ISubmitSummaryOptions,
	ISummarizeHeuristicData,
	ISummarizeHeuristicRunner,
	ISummarizeOptions,
	ISummarizeResults,
	ISummarizeRunnerTelemetry,
	ISummarizeTelemetryProperties,
	// eslint-disable-next-line import/no-deprecated
	ISummarizerRuntime,
	// eslint-disable-next-line import/no-deprecated
	ISummaryCancellationToken,
	SubmitSummaryResult,
	type IRetriableFailureError,
} from "./summarizerTypes.js";
import {
	IAckedSummary,
	IClientSummaryWatcher,
	SummaryCollection,
} from "./summaryCollection.js";
import {
	RetriableSummaryError,
	SummarizeReason,
	SummarizeResultBuilder,
	SummaryGenerator,
	raceTimer,
} from "./summaryGenerator.js";

const maxSummarizeAckWaitTime = 10 * 60 * 1000; // 10 minutes

/**
 * The maximum number of summarization attempts that will be done by default in case of failures
 * that can be retried.
 */
export const defaultMaxAttempts = 2;
/**
 * The default value for maximum number of summarization attempts that will be done for summarization failures where
 * submit fails and the failure can be retried.
 */
export const defaultMaxAttemptsForSubmitFailures = 5;

/**
 *An instance of RunningSummarizer manages the heuristics for summarizing.
 *Until disposed, the instance of RunningSummarizer can assume that it is
 * in a state of running, meaning it is connected and initialized.  It keeps
 * track of summaries that it is generating as they are broadcast and acked/nacked.
 *This object is created and controlled by Summarizer object.
 */
export class RunningSummarizer
	extends TypedEventEmitter<ISummarizerEvents>
	implements IDisposable
{
	public static async start(
		logger: ITelemetryBaseLogger,
		summaryWatcher: IClientSummaryWatcher,
		configuration: ISummaryConfiguration,
		// eslint-disable-next-line import/no-deprecated
		submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
		// eslint-disable-next-line import/no-deprecated
		refreshLatestSummaryAckCallback: (options: IRefreshSummaryAckOptions) => Promise<void>,
		heuristicData: ISummarizeHeuristicData,
		summaryCollection: SummaryCollection,
		// eslint-disable-next-line import/no-deprecated
		cancellationToken: ISummaryCancellationToken,
		stopSummarizerCallback: (reason: SummarizerStopReason) => void,
		// eslint-disable-next-line import/no-deprecated
		runtime: ISummarizerRuntime,
	): Promise<RunningSummarizer> {
		const summarizer = new RunningSummarizer(
			logger,
			summaryWatcher,
			configuration,
			submitSummaryCallback,
			refreshLatestSummaryAckCallback,
			heuristicData,
			summaryCollection,
			cancellationToken,
			stopSummarizerCallback,
			runtime,
		);

		// If there have been any acks newer that the one this client loaded from until now, process them before
		// starting the running summarizer which will trigger summary heuristics.
		// This is done primarily to handle scenarios where the summarizer loads from a cached snapshot and there
		// is newer one available. The ack for the newer summary is processed before summarizing because otherwise
		// that summary would fail as it has an older parent.
		let nextReferenceSequenceNumber = runtime.deltaManager.initialSequenceNumber + 1;
		const latestAck = summaryCollection.latestAck;
		if (
			latestAck !== undefined &&
			latestAck.summaryOp.referenceSequenceNumber >= nextReferenceSequenceNumber
		) {
			await summarizer.handleSummaryAck(latestAck);
			nextReferenceSequenceNumber = latestAck.summaryOp.referenceSequenceNumber + 1;
		}

		await summarizer.waitStart();

		// Process summary acks asynchronously
		// Note: no exceptions are thrown from processIncomingSummaryAcks handler as it handles all exceptions
		summarizer.processIncomingSummaryAcks(nextReferenceSequenceNumber).catch((error) => {
			createChildLogger({ logger }).sendErrorEvent(
				{ eventName: "HandleSummaryAckFatalError" },
				error,
			);
		});

		// Update heuristic counts
		// By the time we get here, there are potentially ops missing from the heuristic summary counts
		// Examples of where this could happen:
		// 1. Op is processed during the time that we are initiating the RunningSummarizer instance but before we
		//    listen for the op events (will get missed by the handlers in the current workflow)
		// 2. Op was sequenced after the last time we summarized (op sequence number > summarize ref sequence number)
		const diff =
			runtime.deltaManager.lastSequenceNumber -
			(heuristicData.lastSuccessfulSummary.refSequenceNumber +
				heuristicData.numNonRuntimeOps +
				heuristicData.numRuntimeOps);
		heuristicData.hasMissingOpData = diff > 0;

		if (heuristicData.hasMissingOpData) {
			// Split the diff 50-50 and increment the counts appropriately
			heuristicData.numNonRuntimeOps += Math.ceil(diff / 2);
			heuristicData.numRuntimeOps += Math.floor(diff / 2);
		}

		// Update last seq number (in case the handlers haven't processed anything yet)
		heuristicData.lastOpSequenceNumber = runtime.deltaManager.lastSequenceNumber;

		// Start heuristics
		summarizer.heuristicRunner?.start();
		summarizer.heuristicRunner?.run();

		return summarizer;
	}

	public get disposed(): boolean {
		return this._disposed;
	}
	private stopping = false;
	private _disposed = false;
	private summarizingLock: Promise<void> | undefined;
	private tryWhileSummarizing = false;
	private readonly pendingAckTimer: PromiseTimer;
	private heuristicRunner?: ISummarizeHeuristicRunner;
	private readonly generator: SummaryGenerator;
	private readonly mc: MonitoringContext;

	private enqueuedSummary:
		| {
				reason: SummarizeReason;
				afterSequenceNumber: number;
				summarizeOptions: ISummarizeOptions;
				readonly resultsBuilder: SummarizeResultBuilder;
		  }
		| undefined;
	private summarizeCount = 0;
	private totalSuccessfulAttempts = 0;
	private initialized = false;

	private readonly runtimeListener;

	/**
	 * The maximum number of summary attempts to do when submit summary fails.
	 */
	private readonly maxAttemptsForSubmitFailures: number;

	/**
	 * These are necessary to store outside of methods because of the logic around runnning a lastSummary.
	 * We want the lastSummary to also be captured as "all attempts failed".
	 */
	private lastSummarizeFailureEventProps: Omit<ISummarizeEventProps, "result"> | undefined =
		undefined;

	private constructor(
		baseLogger: ITelemetryBaseLogger,
		private readonly summaryWatcher: IClientSummaryWatcher,
		private readonly configuration: ISummaryConfiguration,
		private readonly submitSummaryCallback: (
			// eslint-disable-next-line import/no-deprecated
			options: ISubmitSummaryOptions,
		) => Promise<SubmitSummaryResult>,
		private readonly refreshLatestSummaryAckCallback: (
			// eslint-disable-next-line import/no-deprecated
			options: IRefreshSummaryAckOptions,
		) => Promise<void>,
		private readonly heuristicData: ISummarizeHeuristicData,
		private readonly summaryCollection: SummaryCollection,
		// eslint-disable-next-line import/no-deprecated
		private readonly cancellationToken: ISummaryCancellationToken,
		private readonly stopSummarizerCallback: (reason: SummarizerStopReason) => void,
		// eslint-disable-next-line import/no-deprecated
		private readonly runtime: ISummarizerRuntime,
	) {
		super();

		const telemetryProps: ISummarizeRunnerTelemetry = {
			summarizeCount: () => this.summarizeCount,
			summarizerSuccessfulAttempts: () => this.totalSuccessfulAttempts,
		};

		this.mc = createChildMonitoringContext({
			logger: baseLogger,
			namespace: "Running",
			properties: {
				all: telemetryProps,
			},
		});

		if (configuration.state !== "disableHeuristics") {
			assert(
				this.configuration.state === "enabled",
				0x2ea /* "Configuration state should be enabled" */,
			);
			this.heuristicRunner = new SummarizeHeuristicRunner(
				heuristicData,
				this.configuration,
				(reason) => this.trySummarize(reason),
				this.mc.logger,
			);
		}

		assert(
			this.configuration.state !== "disabled",
			0x2eb /* "Summary not supported with configuration disabled" */,
		);

		// Cap the maximum amount of time client will wait for a summarize op ack to maxSummarizeAckWaitTime
		// configuration.maxAckWaitTime is composed from defaults, server values, and runtime overrides

		const maxAckWaitTime = Math.min(
			this.configuration.maxAckWaitTime,
			maxSummarizeAckWaitTime,
		);

		this.pendingAckTimer = new PromiseTimer(maxAckWaitTime, () => {
			// Note: summarizeCount (from ChildLogger definition) may be 0,
			// since this code path is hit when RunningSummarizer first starts up,
			// before this instance has kicked off a new summarize run.
			this.mc.logger.sendErrorEvent({
				eventName: "SummaryAckWaitTimeout",
				message: "Pending summary ack not received in time",
				maxAckWaitTime,
				referenceSequenceNumber: this.heuristicData.lastAttempt.refSequenceNumber,
				summarySequenceNumber: this.heuristicData.lastAttempt.summarySequenceNumber,
				timePending: Date.now() - this.heuristicData.lastAttempt.summaryTime,
			});
		});
		// Set up pending ack timeout by op timestamp differences for previous summaries.
		summaryCollection.setPendingAckTimerTimeoutCallback(maxAckWaitTime, () => {
			if (this.pendingAckTimer.hasTimer) {
				this.mc.logger.sendTelemetryEvent({
					eventName: "MissingSummaryAckFoundByOps",
					referenceSequenceNumber: this.heuristicData.lastAttempt.refSequenceNumber,
					summarySequenceNumber: this.heuristicData.lastAttempt.summarySequenceNumber,
				});
				this.pendingAckTimer.clear();
			}
		});

		const immediatelyRefreshLatestSummaryAck =
			this.mc.config.getBoolean("Fluid.Summarizer.immediatelyRefreshLatestSummaryAck") ?? true;
		this.generator = new SummaryGenerator(
			this.pendingAckTimer,
			this.heuristicData,
			this.submitSummaryCallback,
			() => {
				this.totalSuccessfulAttempts++;
			},
			// eslint-disable-next-line import/no-deprecated
			async (options: IRefreshSummaryAckOptions) => {
				if (immediatelyRefreshLatestSummaryAck) {
					await this.refreshLatestSummaryAckAndHandleError(options);
				}
			},
			this.summaryWatcher,
			this.mc.logger,
		);

		// Listen to runtime for ops
		this.runtimeListener = (op: ISequencedDocumentMessage, runtimeMessage?: boolean) => {
			this.handleOp(op, runtimeMessage === true);
		};
		this.runtime.on("op", this.runtimeListener);

		// The max attempts for submit failures can be overridden via a feature flag. This allows us to
		// tweak this as per telemetry data until we arrive at a stable number.
		// If its set to a number higher than `defaultMaxAttemptsForSubmitFailures`, it will be ignored.
		const overrideMaxAttempts = this.mc.config.getNumber(
			"Fluid.Summarizer.AttemptsForSubmitFailures",
		);
		this.maxAttemptsForSubmitFailures =
			overrideMaxAttempts && overrideMaxAttempts < defaultMaxAttemptsForSubmitFailures
				? overrideMaxAttempts
				: defaultMaxAttemptsForSubmitFailures;
	}

	private async handleSummaryAck(ack: IAckedSummary): Promise<void> {
		const refSequenceNumber = ack.summaryOp.referenceSequenceNumber;
		const summaryLogger = this.tryGetCorrelatedLogger(refSequenceNumber) ?? this.mc.logger;
		const summaryOpHandle = ack.summaryOp.contents.handle;
		const summaryAckHandle = ack.summaryAck.contents.handle;
		while (this.summarizingLock !== undefined) {
			summaryLogger.sendTelemetryEvent({
				eventName: "RefreshAttemptWithSummarizerRunning",
				referenceSequenceNumber: refSequenceNumber,
				proposalHandle: summaryOpHandle,
				ackHandle: summaryAckHandle,
			});
			await this.summarizingLock;
		}

		// Make sure we block any summarizer from being executed/enqueued while
		// executing the refreshLatestSummaryAck.
		// https://dev.azure.com/fluidframework/internal/_workitems/edit/779
		await this.lockedSummaryAction(
			() => {},
			async () => {
				// eslint-disable-next-line import/no-deprecated
				const options: IRefreshSummaryAckOptions = {
					proposalHandle: summaryOpHandle,
					ackHandle: summaryAckHandle,
					summaryRefSeq: refSequenceNumber,
					summaryLogger,
				};
				await this.refreshLatestSummaryAckAndHandleError(options);
			},
			() => {},
		);
	}

	private readonly refreshLatestSummaryAckAndHandleError = async (
		// eslint-disable-next-line import/no-deprecated
		options: IRefreshSummaryAckOptions,
	): Promise<void> => {
		return this.refreshLatestSummaryAckCallback(options).catch(async (error) => {
			// If the error is 404, so maybe the fetched version no longer exists on server. We just
			// ignore this error in that case, as that means we will have another summaryAck for the
			// latest version with which we will refresh the state. However in case of single commit
			// summary, we might be missing a summary ack, so in that case we are still fine as the
			// code in `submitSummary` function in container runtime, will refresh the latest state
			// by calling `prefetchLatestSummaryThenClose`. We will load the next summarizer from the
			// updated state and be fine.
			const isIgnoredError =
				isFluidError(error) &&
				error.errorType === DriverErrorTypes.fileNotFoundOrAccessDeniedError;

			options.summaryLogger.sendTelemetryEvent(
				{
					eventName: isIgnoredError
						? "HandleSummaryAckErrorIgnored"
						: "HandleLastSummaryAckError",
					referenceSequenceNumber: options.summaryRefSeq,
					proposalHandle: options.proposalHandle,
					ackHandle: options.ackHandle,
				},
				error,
			);
		});
	};

	/**
	 * Responsible for receiving and processing all the summary acks.
	 * It starts processing ACKs after the one for the summary this client loaded from (initialSequenceNumber). Any
	 * ACK before that is not interesting as it will simply be ignored.
	 *
	 * @param referenceSequenceNumber - The referenceSequenceNumber of the summary from which to start processing
	 * acks.
	 */
	private async processIncomingSummaryAcks(referenceSequenceNumber: number): Promise<void> {
		// Start waiting for acks that are for summaries newer that the one this client loaded from.
		let nextReferenceSequenceNumber = referenceSequenceNumber;
		while (!this.disposed) {
			const ackedSummary = await this.summaryCollection.waitSummaryAck(
				nextReferenceSequenceNumber,
			);
			await this.handleSummaryAck(ackedSummary);
			nextReferenceSequenceNumber = ackedSummary.summaryOp.referenceSequenceNumber + 1;
		}
	}

	public dispose(): void {
		this.runtime.off("op", this.runtimeListener);
		this.summaryWatcher.dispose();
		this.heuristicRunner?.dispose();
		this.heuristicRunner = undefined;
		this.generator.dispose();
		this.pendingAckTimer.clear();
		this.disposeEnqueuedSummary();
		this._disposed = true;
		this.stopping = true;
	}

	/**
	 *RunningSummarizer's logger includes the sequenced index of the current summary on each event.
	 *If some other Summarizer code wants that event on their logs they can get it here,
	 * but only if they're logging about that same summary.
	 * @param summaryOpRefSeq - RefSeq number of the summary op, to ensure the log correlation will be correct
	 */
	public tryGetCorrelatedLogger = (
		summaryOpRefSeq: number,
	): ITelemetryLoggerExt | undefined =>
		this.heuristicData.lastAttempt.refSequenceNumber === summaryOpRefSeq
			? this.mc.logger
			: undefined;

	/**
	 * We only want a single heuristic runner micro-task (will provide better optimized grouping of ops)
	 */
	private heuristicRunnerMicroTaskExists = false;

	public handleOp(op: ISequencedDocumentMessage, runtimeMessage: boolean): void {
		this.heuristicData.lastOpSequenceNumber = op.sequenceNumber;

		if (runtimeMessage) {
			this.heuristicData.numRuntimeOps++;
		} else {
			this.heuristicData.numNonRuntimeOps++;
		}

		this.heuristicData.totalOpsSize += opSize(op);

		// Check for enqueued on-demand summaries; Intentionally do nothing otherwise
		if (
			this.initialized &&
			this.opCanTriggerSummary(op, runtimeMessage) &&
			!this.tryRunEnqueuedSummary() &&
			!this.heuristicRunnerMicroTaskExists
		) {
			this.heuristicRunnerMicroTaskExists = true;
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			Promise.resolve()
				.then(() => {
					this.heuristicRunner?.run();
				})
				.finally(() => {
					this.heuristicRunnerMicroTaskExists = false;
				});
		}
	}

	/**
	 * Can the given op trigger a summary?
	 * # Currently always prevents summaries for Summarize and SummaryAck/Nack ops
	 * @param op - op to check
	 * @returns true if this op can trigger a summary
	 */
	private opCanTriggerSummary(
		op: ISequencedDocumentMessage,
		runtimeMessage: boolean,
	): boolean {
		switch (op.type) {
			case MessageType.Summarize:
			case MessageType.SummaryAck:
			case MessageType.SummaryNack:
				return false;
			default:
				return runtimeMessage || this.nonRuntimeOpCanTriggerSummary();
		}
	}

	private nonRuntimeOpCanTriggerSummary(): boolean {
		const opsSinceLastAck =
			this.heuristicData.lastOpSequenceNumber -
			this.heuristicData.lastSuccessfulSummary.refSequenceNumber;
		return (
			this.configuration.state === "enabled" &&
			(this.configuration.nonRuntimeHeuristicThreshold === undefined ||
				this.configuration.nonRuntimeHeuristicThreshold <= opsSinceLastAck)
		);
	}

	public async waitStop(allowLastSummary: boolean): Promise<void> {
		if (this.stopping) {
			return;
		}

		this.stopping = true;

		this.disposeEnqueuedSummary();

		// This will try to run lastSummary if needed.
		if (allowLastSummary && this.heuristicRunner?.shouldRunLastSummary()) {
			if (this.summarizingLock === undefined) {
				this.trySummarizeOnce(
					// summarizeProps
					{ summarizeReason: "lastSummary" },
					{},
					undefined,
					true /* isLastSummary */,
				);
			}
		}

		// Note that trySummarizeOnce() call above returns right away, without waiting.
		// So we need to wait for its completion, otherwise it would be destroyed right away.
		// That said, if summary lock was taken upfront, this wait might wait on  multiple retries to
		// submit summary. We should reconsider this flow and make summarizer move to exit faster.
		// This resolves when the current pending summary gets an ack or fails.
		await this.summarizingLock;

		if (this.lastSummarizeFailureEventProps !== undefined) {
			this.emit("summarizeAllAttemptsFailed", {
				...this.lastSummarizeFailureEventProps,
				numUnsummarizedRuntimeOps: this.heuristicData.numRuntimeOps,
				numUnsummarizedNonRuntimeOps: this.heuristicData.numNonRuntimeOps,
			});
		}
		this.lastSummarizeFailureEventProps = undefined;
	}

	private async waitStart(): Promise<void> {
		// Wait no longer than ack timeout for all pending
		const waitStartResult = await raceTimer(
			this.summaryWatcher.waitFlushed(),
			this.pendingAckTimer.start(),
		);
		this.pendingAckTimer.clear();

		// Remove pending ack wait timeout by op timestamp comparison, because
		// it has race conditions with summaries submitted by this same client.
		this.summaryCollection.unsetPendingAckTimerTimeoutCallback();

		if (waitStartResult.result === "done" && waitStartResult.value !== undefined) {
			this.heuristicData.updateWithLastSummaryAckInfo({
				refSequenceNumber: waitStartResult.value.summaryOp.referenceSequenceNumber,
				// This will be the Summarizer starting point so only use timestamps from client's machine.
				summaryTime: Date.now(),
				summarySequenceNumber: waitStartResult.value.summaryOp.sequenceNumber,
			});
		}
		this.initialized = true;
	}

	private beforeSummaryAction(): void {
		this.summarizeCount++;
	}

	private afterSummaryAction(): void {
		const retry = this.tryWhileSummarizing;
		this.tryWhileSummarizing = false;

		// After summarizing, we should check to see if we need to summarize again.
		// Rerun the heuristics and check for enqueued summaries.
		if (!this.stopping && !this.tryRunEnqueuedSummary() && retry) {
			this.heuristicRunner?.run();
		}
	}

	/**
	 * Runs single summary action that prevents any other concurrent actions.
	 * Assumes that caller checked upfront for lack of concurrent action (this.summarizingLock)
	 * before calling this API. I.e. caller is responsible for either erroring out or waiting on this promise.
	 * @param before - set of instructions to run before running the action.
	 * @param action - action to perform.
	 * @param after - set of instructions to run after running the action.
	 * @returns The result of the action.
	 */
	private async lockedSummaryAction<T>(
		before: () => void,
		action: () => Promise<T>,
		after: () => void,
	): Promise<T> {
		assert(
			this.summarizingLock === undefined,
			0x25b /* "Caller is responsible for checking lock" */,
		);

		const summarizingLock = new Deferred<void>();
		this.summarizingLock = summarizingLock.promise;

		before();

		return action().finally(() => {
			summarizingLock.resolve();
			this.summarizingLock = undefined;
			after();
		});
	}

	/**
	 * Runs single summarize attempt
	 * @param summarizeProps - props to log with each telemetry event associated with this attempt
	 * @param options - summary options
	 * @param cancellationToken - cancellation token to use to be able to cancel this summary, if needed
	 * @param resultsBuilder - optional, result builder to use.
	 * @param isLastSummary - optional, is the call to this method for a last summary when shutting down the summarizer?
	 * @returns ISummarizeResult - result of running a summary.
	 */
	private trySummarizeOnce(
		summarizeProps: ISummarizeTelemetryProperties,
		options: ISummarizeOptions,
		resultsBuilder = new SummarizeResultBuilder(),
		isLastSummary = false,
	): ISummarizeResults {
		this.lockedSummaryAction(
			() => {
				this.beforeSummaryAction();
			},
			async () => {
				const summaryLogger = createChildLogger({
					logger: this.mc.logger,
					properties: { all: summarizeProps },
				});
				// eslint-disable-next-line import/no-deprecated
				const summaryOptions: ISubmitSummaryOptions = {
					...options,
					summaryLogger,
					cancellationToken: this.cancellationToken,
					latestSummaryRefSeqNum: this.heuristicData.lastSuccessfulSummary.refSequenceNumber,
				};
				const summarizeResult = this.generator.summarize(summaryOptions, resultsBuilder);
				// ensure we wait till the end of the process
				const result = await summarizeResult.receivedSummaryAckOrNack;

				if (result.success) {
					this.emit("summarize", {
						result: "success",
						currentAttempt: 1,
						maxAttempts: 1,
						numUnsummarizedRuntimeOps: this.heuristicData.numRuntimeOps,
						numUnsummarizedNonRuntimeOps: this.heuristicData.numNonRuntimeOps,
						isLastSummary,
					});
					this.lastSummarizeFailureEventProps = undefined;
				} else {
					this.emit("summarize", {
						result: "failure",
						currentAttempt: 1,
						maxAttempts: 1,
						error: result.error,
						failureMessage: result.message,
						numUnsummarizedRuntimeOps: this.heuristicData.numRuntimeOps,
						numUnsummarizedNonRuntimeOps: this.heuristicData.numNonRuntimeOps,
						isLastSummary,
					});
					this.mc.logger.sendErrorEvent(
						{
							eventName: "SummarizeFailed",
							maxAttempts: 1,
							summaryAttempts: 1,
						},
						result.error,
					);
					if (isLastSummary) {
						this.lastSummarizeFailureEventProps = {
							currentAttempt: (this.lastSummarizeFailureEventProps?.currentAttempt ?? 0) + 1,
							maxAttempts: (this.lastSummarizeFailureEventProps?.currentAttempt ?? 0) + 1,
							error: result.error,
							failureMessage: result.message,
						};
					}
				}
			},
			() => {
				this.afterSummaryAction();
			},
		).catch((error) => {
			// SummaryGenerator.summarize() does not throw exceptions - it converts them to failed result
			// on resultsBuilder
			// We do not care about exceptions on receivedSummaryAckOrNack - caller should check results
			// and take a appropriate action.
		});

		return resultsBuilder.build();
	}

	/**
	 * Heuristics summarize attempt.
	 */
	private trySummarize(reason: SummarizeReason): void {
		if (this.summarizingLock !== undefined) {
			// lockedSummaryAction() will retry heuristic-based summary at the end of current attempt
			// if it's still needed
			this.tryWhileSummarizing = true;
			return;
		}

		this.lockedSummaryAction(
			() => {
				this.beforeSummaryAction();
			},
			async () => {
				return this.trySummarizeWithRetries(reason);
			},
			() => {
				this.afterSummaryAction();
			},
		).catch((error) => {
			this.mc.logger.sendErrorEvent({ eventName: "UnexpectedSummarizeError" }, error);
		});
	}

	/**
	 * Tries to summarize with retries where retry is based on the failure params.
	 * For example, summarization may be retried for failures with "retryAfterSeconds" param.
	 */
	private async trySummarizeWithRetries(
		reason: SummarizeReason,
	): Promise<ISummarizeResults | undefined> {
		// Helper to set summarize options, telemetry properties and call summarize.
		const attemptSummarize = (
			attemptNumber: number,
			finalAttempt: boolean,
		): {
			summarizeProps: ISummarizeTelemetryProperties;
			summarizeResult: ISummarizeResults;
		} => {
			const summarizeOptions: ISummarizeOptions = {
				fullTree: false,
			};
			const summarizeProps: ISummarizeTelemetryProperties = {
				summarizeReason: reason,
				summaryAttempts: attemptNumber,
				...summarizeOptions,
				finalAttempt,
			};
			const summaryLogger = createChildLogger({
				logger: this.mc.logger,
				properties: { all: summarizeProps },
			});
			// eslint-disable-next-line import/no-deprecated
			const summaryOptions: ISubmitSummaryOptions = {
				...summarizeOptions,
				summaryLogger,
				cancellationToken: this.cancellationToken,
				finalAttempt,
				latestSummaryRefSeqNum: this.heuristicData.lastSuccessfulSummary.refSequenceNumber,
			};
			const summarizeResult = this.generator.summarize(summaryOptions);
			return { summarizeProps, summarizeResult };
		};

		// The max number of attempts are based on the stage at which summarization failed. If it fails before it is
		// submitted, a different value is used compared to if it fails after submission. Usually, in the former case,
		// we would retry more often as its cheaper and retries are likely to succeed.
		// This makes it harder to predict how many attempts would actually happen as that depends on how far an attempt
		// made. To keep things simple, the max attempts is reset after every attempt based on where it failed. This may
		// result in some failures not being retried depending on what happened before this attempt. That's fine because
		// such scenarios are very unlikely and even if it happens, it would resolve when a new summarizer starts over.
		// For example - When failure switches from one the submit failures to nack failure, only one more retry will
		// happen irrespective of the value of `defaultMaxAttempts`.
		let maxAttempts = defaultMaxAttempts;
		let currentAttempt = 0;
		let retryAfterSeconds: number | undefined;
		let done = false;
		let status: "success" | "failure" | "canceled" = "success";
		let results: ISummarizeResults | undefined;
		let error: IRetriableFailureError | undefined;
		let failureMessage: string | undefined;
		do {
			currentAttempt++;
			if (this.cancellationToken.cancelled) {
				status = "canceled";
				done = true;
				break;
			}

			const attemptResult = attemptSummarize(currentAttempt, false /* finalAttempt */);
			results = attemptResult.summarizeResult;

			// Ack / nack is the final step, so if it succeeds we're done.
			const ackNackResult = await results.receivedSummaryAckOrNack;
			if (ackNackResult.success) {
				status = "success";
				done = true;
				break;
			}

			// Update max attempts from the failure result.
			// If submit summary failed, use maxAttemptsForSubmitFailures. Else use the defaultMaxAttempts.
			// Note: Check "summarySubmitted" result first because if it fails, ack nack would fail as well.
			const submitSummaryResult = await results.summarySubmitted;
			maxAttempts = !submitSummaryResult.success
				? this.maxAttemptsForSubmitFailures
				: defaultMaxAttempts;

			// Emit "summarize" event for this failed attempt.
			status = "failure";
			error = ackNackResult.error;
			failureMessage = ackNackResult.message;
			retryAfterSeconds = error.retryAfterSeconds;
			const eventProps: ISummarizeEventProps & ISummarizerObservabilityProps = {
				result: status,
				currentAttempt,
				maxAttempts,
				error,
				failureMessage,
				numUnsummarizedRuntimeOps: this.heuristicData.numRuntimeOps,
				numUnsummarizedNonRuntimeOps: this.heuristicData.numNonRuntimeOps,
			};
			this.emit("summarize", eventProps);

			// Break if the failure doesn't have "retryAfterSeconds" or we are one less from max number of attempts.
			// Note that the final attempt if "retryAfterSeconds" does exist happens outside of the do..while loop.
			if (retryAfterSeconds === undefined || currentAttempt >= maxAttempts - 1) {
				done = true;
			}

			// If the failure has "retryAfterSeconds", add a delay of that time before starting the next attempt.
			if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
				this.mc.logger.sendPerformanceEvent({
					eventName: "SummarizeAttemptDelay",
					duration: retryAfterSeconds * 1000,
					summaryNackDelay: ackNackResult.data !== undefined, // This will only be defined only for nack failures.
					stage: submitSummaryResult.data?.stage,
					...attemptResult.summarizeProps,
				});
				await delay(retryAfterSeconds * 1000);
			}
		} while (!done);

		// If the attempt was successful, emit "summarize" event and return. A failed attempt may be retried below.
		if (status !== "failure") {
			this.emit("summarize", {
				result: status,
				currentAttempt,
				maxAttempts,
				numUnsummarizedRuntimeOps: this.heuristicData.numRuntimeOps,
				numUnsummarizedNonRuntimeOps: this.heuristicData.numNonRuntimeOps,
			});
			return results;
		}

		// If summarization wasn't successful above and the failure contains "retryAfterSeconds", perform one last
		// attempt. This gives a chance to the runtime to perform additional steps in the last attempt.
		if (retryAfterSeconds !== undefined) {
			const { summarizeResult } = attemptSummarize(++currentAttempt, true /* finalAttempt */);
			// Ack / nack is the final step, so if it succeeds we're done.
			const ackNackResult = await summarizeResult.receivedSummaryAckOrNack;
			status = ackNackResult.success ? "success" : "failure";
			error = ackNackResult.success ? undefined : ackNackResult.error;
			failureMessage = ackNackResult.success ? undefined : ackNackResult.message;
			const eventProps: ISummarizeEventProps & ISummarizerObservabilityProps = {
				result: status,
				currentAttempt,
				maxAttempts,
				error,
				failureMessage,
				numUnsummarizedRuntimeOps: this.heuristicData.numRuntimeOps,
				numUnsummarizedNonRuntimeOps: this.heuristicData.numNonRuntimeOps,
			};
			this.emit("summarize", eventProps);
			results = summarizeResult;
		}

		// If summarization is still unsuccessful, stop the summarizer.
		if (status === "failure") {
			this.mc.logger.sendErrorEvent(
				{
					eventName: "SummarizeFailed",
					maxAttempts,
					summaryAttempts: currentAttempt,
				},
				error,
			);
			this.lastSummarizeFailureEventProps = {
				currentAttempt,
				maxAttempts,
				error,
				failureMessage,
			};
			this.stopSummarizerCallback("failToSummarize");
		}
		return results;
	}

	/**
	 * Attempts to generate a summary on demand with retries in case of failures. The retry logic is the same
	 * as heuristics based summaries.
	 */
	private async summarizeOnDemandWithRetries(
		reason: SummarizeReason,
		resultsBuilder: SummarizeResultBuilder,
	): Promise<ISummarizeResults> {
		const results = await this.trySummarizeWithRetries(reason);
		if (results === undefined) {
			resultsBuilder.fail(
				"Summarization was canceled",
				new RetriableSummaryError("Summarization was canceled"),
			);
			return resultsBuilder.build();
		}
		const submitResult = await results.summarySubmitted;
		const summaryOpBroadcastedResult = await results.summaryOpBroadcasted;
		const ackNackResult = await results.receivedSummaryAckOrNack;
		resultsBuilder.summarySubmitted.resolve(submitResult);
		resultsBuilder.summaryOpBroadcasted.resolve(summaryOpBroadcastedResult);
		resultsBuilder.receivedSummaryAckOrNack.resolve(ackNackResult);
		return resultsBuilder.build();
	}

	/**
	 *{@inheritdoc (ISummarizer:interface).summarizeOnDemand}
	 */
	public summarizeOnDemand(
		options: IOnDemandSummarizeOptions,
		resultsBuilder: SummarizeResultBuilder = new SummarizeResultBuilder(),
	): ISummarizeResults {
		if (this.stopping) {
			resultsBuilder.fail(
				"RunningSummarizer stopped or disposed",
				new RetriableSummaryError("RunningSummarizer stopped or disposed"),
			);
			return resultsBuilder.build();
		}
		// Check for concurrent summary attempts. If one is found,
		// return a promise that caller can await before trying again.
		if (this.summarizingLock !== undefined) {
			// The heuristics are blocking concurrent summarize attempts.
			throw new UsageError("Attempted to run an already-running summarizer on demand");
		}

		const { reason, ...summarizeOptions } = options;
		if (options.retryOnFailure === true) {
			this.summarizeOnDemandWithRetries(`onDemand;${reason}`, resultsBuilder).catch(
				(error) => {
					resultsBuilder.fail("summarize failed", error);
				},
			);
		} else {
			this.trySummarizeOnce(
				{ summarizeReason: `onDemand/${reason}` },
				summarizeOptions,
				resultsBuilder,
			);
		}
		return resultsBuilder.build();
	}

	/**
	 *{@inheritdoc (ISummarizer:interface).enqueueSummarize}
	 */
	public enqueueSummarize(options: IEnqueueSummarizeOptions): EnqueueSummarizeResult {
		const { reason, afterSequenceNumber = 0, override = false, ...summarizeOptions } = options;
		let overridden = false;
		if (this.enqueuedSummary !== undefined) {
			if (!override) {
				return { alreadyEnqueued: true };
			}
			// Override existing enqueued summarize attempt.
			this.enqueuedSummary.resultsBuilder.fail(
				"Aborted; overridden by another enqueue summarize attempt",
				new RetriableSummaryError(
					"Summary was overridden by another enqueue summarize attempt",
				),
			);
			this.enqueuedSummary = undefined;
			overridden = true;
		}

		this.enqueuedSummary = {
			reason: `enqueue;${reason}`,
			afterSequenceNumber,
			summarizeOptions,
			resultsBuilder: new SummarizeResultBuilder(),
		};
		const results = this.enqueuedSummary.resultsBuilder.build();
		this.tryRunEnqueuedSummary();
		return overridden
			? {
					...results,
					alreadyEnqueued: true,
					overridden: true,
				}
			: results;
	}

	private tryRunEnqueuedSummary(): boolean {
		if (this.stopping) {
			this.disposeEnqueuedSummary();
			return false;
		}
		if (
			this.enqueuedSummary === undefined ||
			this.heuristicData.lastOpSequenceNumber < this.enqueuedSummary.afterSequenceNumber ||
			this.summarizingLock !== undefined
		) {
			// If no enqueued summary is ready or a summary is already in progress, take no action.
			return false;
		}
		const { reason, resultsBuilder, summarizeOptions } = this.enqueuedSummary;
		// Set to undefined first, so that subsequent enqueue attempt while summarize will occur later.
		this.enqueuedSummary = undefined;
		this.trySummarizeOnce(
			{ summarizeReason: `enqueuedSummary/${reason}` },
			summarizeOptions,
			resultsBuilder,
		);
		return true;
	}

	private disposeEnqueuedSummary(): void {
		if (this.enqueuedSummary !== undefined) {
			this.enqueuedSummary.resultsBuilder.fail(
				"RunningSummarizer stopped or disposed",
				new RetriableSummaryError("RunningSummarizer stopped or disposed"),
			);
			this.enqueuedSummary = undefined;
		}
	}
}
