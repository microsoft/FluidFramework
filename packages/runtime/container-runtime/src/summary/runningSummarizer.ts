/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	isFluidError,
	MonitoringContext,
	createChildMonitoringContext,
	createChildLogger,
} from "@fluidframework/telemetry-utils";
import { assert, delay, Deferred, PromiseTimer } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ISummaryConfiguration } from "../containerRuntime";
import { opSize } from "../opProperties";
import { SummarizeHeuristicRunner } from "./summarizerHeuristics";
import {
	IEnqueueSummarizeOptions,
	ISummarizeOptions,
	ISummarizeHeuristicData,
	ISummarizeHeuristicRunner,
	IOnDemandSummarizeOptions,
	EnqueueSummarizeResult,
	SummarizerStopReason,
	ISubmitSummaryOptions,
	SubmitSummaryResult,
	ISummaryCancellationToken,
	ISummarizeResults,
	ISummarizeTelemetryProperties,
	ISummarizerRuntime,
	ISummarizeRunnerTelemetry,
	IRefreshSummaryAckOptions,
} from "./summarizerTypes";
import { IAckedSummary, IClientSummaryWatcher, SummaryCollection } from "./summaryCollection";
import {
	raceTimer,
	SummarizeReason,
	SummarizeResultBuilder,
	SummaryGenerator,
} from "./summaryGenerator";

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
 * An instance of RunningSummarizer manages the heuristics for summarizing.
 * Until disposed, the instance of RunningSummarizer can assume that it is
 * in a state of running, meaning it is connected and initialized.  It keeps
 * track of summaries that it is generating as they are broadcast and acked/nacked.
 * This object is created and controlled by Summarizer object.
 */
export class RunningSummarizer implements IDisposable {
	public static async start(
		logger: ITelemetryBaseLogger,
		summaryWatcher: IClientSummaryWatcher,
		configuration: ISummaryConfiguration,
		submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
		refreshLatestSummaryAckCallback: (options: IRefreshSummaryAckOptions) => Promise<void>,
		heuristicData: ISummarizeHeuristicData,
		summaryCollection: SummaryCollection,
		cancellationToken: ISummaryCancellationToken,
		stopSummarizerCallback: (reason: SummarizerStopReason) => void,
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

		// Before doing any heuristics or proceeding with its refreshing, if there is a summary ack received while
		// this summarizer catches up, let's refresh state before proceeding with the summarization.
		const lastAckRefSeq = await summarizer.handleSummaryAck();

		await summarizer.waitStart();

		// Handle summary acks asynchronously
		// Note: no exceptions are thrown from processIncomingSummaryAcks handler as it handles all exceptions
		summarizer.processIncomingSummaryAcks(lastAckRefSeq).catch((error) => {
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

	public get disposed() {
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

	/** The maximum number of summary attempts to do when submit summary fails. */
	private readonly maxAttemptsForSubmitFailures: number;

	private constructor(
		baseLogger: ITelemetryBaseLogger,
		private readonly summaryWatcher: IClientSummaryWatcher,
		private readonly configuration: ISummaryConfiguration,
		private readonly submitSummaryCallback: (
			options: ISubmitSummaryOptions,
		) => Promise<SubmitSummaryResult>,
		private readonly refreshLatestSummaryAckCallback: (
			options: IRefreshSummaryAckOptions,
		) => Promise<void>,
		private readonly heuristicData: ISummarizeHeuristicData,
		private readonly summaryCollection: SummaryCollection,
		private readonly cancellationToken: ISummaryCancellationToken,
		private readonly stopSummarizerCallback: (reason: SummarizerStopReason) => void,
		private readonly runtime: ISummarizerRuntime,
	) {
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

		const maxAckWaitTime = Math.min(this.configuration.maxAckWaitTime, maxSummarizeAckWaitTime);

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

		this.generator = new SummaryGenerator(
			this.pendingAckTimer,
			this.heuristicData,
			this.submitSummaryCallback,
			() => {
				this.totalSuccessfulAttempts++;
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

	private async handleSummaryAck(): Promise<number> {
		const lastAck: IAckedSummary | undefined = this.summaryCollection.latestAck;
		let refSequenceNumber = -1;
		// In case we haven't received the lastestAck yet, just return.
		if (lastAck !== undefined) {
			refSequenceNumber = lastAck.summaryOp.referenceSequenceNumber;
			const summaryLogger = this.tryGetCorrelatedLogger(refSequenceNumber) ?? this.mc.logger;
			const summaryOpHandle = lastAck.summaryOp.contents.handle;
			const summaryAckHandle = lastAck.summaryAck.contents.handle;
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
				async () =>
					this.refreshLatestSummaryAckCallback({
						proposalHandle: summaryOpHandle,
						ackHandle: summaryAckHandle,
						summaryRefSeq: refSequenceNumber,
						summaryLogger,
					}).catch(async (error) => {
						// If the error is 404, so maybe the fetched version no longer exists on server. We just
						// ignore this error in that case, as that means we will have another summaryAck for the
						// latest version with which we will refresh the state. However in case of single commit
						// summary, we might me missing a summary ack, so in that case we are still fine as the
						// code in `submitSummary` function in container runtime, will refresh the latest state
						// by calling `refreshLatestSummaryAckFromServer` and we will be fine.
						const isIgnoredError =
							isFluidError(error) &&
							error.errorType === DriverErrorType.fileNotFoundOrAccessDeniedError;

						summaryLogger.sendTelemetryEvent(
							{
								eventName: isIgnoredError
									? "HandleSummaryAckErrorIgnored"
									: "HandleLastSummaryAckError",
								referenceSequenceNumber: refSequenceNumber,
								proposalHandle: summaryOpHandle,
								ackHandle: summaryAckHandle,
							},
							error,
						);
					}),
				() => {},
			);
			refSequenceNumber++;
		}
		return refSequenceNumber;
	}

	/**
	 * Responsible for receiving and processing all the summaryAcks.
	 * In case there was a summary ack processed by the running summarizer before processIncomingSummaryAcks is called,
	 * it will wait for the summary ack that is newer than the one indicated by the lastAckRefSeq.
	 * @param lastAckRefSeq - Identifies the minimum reference sequence number the summarizer needs to wait for.
	 * In case of a negative number, the summarizer will wait for ANY summary ack that is greater than the deltaManager's initial sequence number,
	 * and, in case of a positive one, it will wait for a summary ack that is greater than this current reference sequence number.
	 */
	private async processIncomingSummaryAcks(lastAckRefSeq: number) {
		let refSequenceNumber =
			lastAckRefSeq > 0 ? lastAckRefSeq : this.runtime.deltaManager.initialSequenceNumber;
		while (!this.disposed) {
			const summaryLogger = this.tryGetCorrelatedLogger(refSequenceNumber) ?? this.mc.logger;

			// Initialize ack with undefined if exception happens inside of waitSummaryAck on second iteration,
			// we record undefined, not previous handles.
			await this.summaryCollection.waitSummaryAck(refSequenceNumber);

			summaryLogger.sendTelemetryEvent({
				eventName: "processIncomingSummaryAcks",
				referenceSequenceNumber: refSequenceNumber,
				lastAckRefSeq,
			});

			refSequenceNumber = await this.handleSummaryAck();
			// A valid Summary Ack must have been processed.
			assert(refSequenceNumber >= 0, 0x58f /* Invalid ref sequence number */);
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
	 * RunningSummarizer's logger includes the sequenced index of the current summary on each event.
	 * If some other Summarizer code wants that event on their logs they can get it here,
	 * but only if they're logging about that same summary.
	 * @param summaryOpRefSeq - RefSeq number of the summary op, to ensure the log correlation will be correct
	 */
	public tryGetCorrelatedLogger = (summaryOpRefSeq) =>
		this.heuristicData.lastAttempt.refSequenceNumber === summaryOpRefSeq
			? this.mc.logger
			: undefined;

	/** We only want a single heuristic runner micro-task (will provide better optimized grouping of ops) */
	private heuristicRunnerMicroTaskExists = false;

	public handleOp(op: ISequencedDocumentMessage, runtimeMessage: boolean) {
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
	private opCanTriggerSummary(op: ISequencedDocumentMessage, runtimeMessage: boolean): boolean {
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
					// ISummarizeOptions, using defaults: { refreshLatestAck: false, fullTree: false }
					{},
				);
			}
		}

		// Note that trySummarizeOnce() call above returns right away, without waiting.
		// So we need to wait for its completion, otherwise it would be destroyed right away.
		// That said, if summary lock was taken upfront, this wait might wait on  multiple retries to
		// submit summary. We should reconsider this flow and make summarizer move to exit faster.
		// This resolves when the current pending summary gets an ack or fails.
		await this.summarizingLock;
	}

	private async waitStart() {
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

	private beforeSummaryAction() {
		this.summarizeCount++;
	}

	private afterSummaryAction() {
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
	 * @returns - result of action.
	 */
	private async lockedSummaryAction<T>(
		before: () => void,
		action: () => Promise<T>,
		after: () => void,
	) {
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
	 * @returns ISummarizeResult - result of running a summary.
	 */
	private trySummarizeOnce(
		summarizeProps: ISummarizeTelemetryProperties,
		options: ISummarizeOptions,
		resultsBuilder = new SummarizeResultBuilder(),
	): ISummarizeResults {
		this.lockedSummaryAction(
			() => {
				this.beforeSummaryAction();
			},
			async () => {
				const summarizeResult = this.generator.summarize(
					summarizeProps,
					options,
					this.cancellationToken,
					resultsBuilder,
				);
				// ensure we wait till the end of the process
				return summarizeResult.receivedSummaryAckOrNack;
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

	/** Heuristics summarize attempt. */
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
				return this.mc.config.getBoolean("Fluid.Summarizer.TryDynamicRetries")
					? this.trySummarizeWithRetries(reason)
					: this.trySummarizeWithStaticAttempts(reason);
			},
			() => {
				this.afterSummaryAction();
			},
		).catch((error) => {
			this.mc.logger.sendErrorEvent({ eventName: "UnexpectedSummarizeError" }, error);
		});
	}

	/**
	 * Tries to summarize 2 times with pre-defined summary options. If an attempt fails with "retryAfterSeconds"
	 * param, that attempt is tried once more.
	 */
	private async trySummarizeWithStaticAttempts(reason: SummarizeReason) {
		const attemptOptions: ISummarizeOptions[] = [
			{ refreshLatestAck: false, fullTree: false },
			{ refreshLatestAck: true, fullTree: false },
		];
		let summaryAttempts = 0;
		let summaryAttemptsPerPhase = 0;
		let summaryAttemptPhase = 0;
		while (summaryAttemptPhase < attemptOptions.length) {
			if (this.cancellationToken.cancelled) {
				return;
			}

			// We only want to attempt 1 summary when reason is "lastSummary"
			if (++summaryAttempts > 1 && reason === "lastSummary") {
				return;
			}

			summaryAttemptsPerPhase++;

			const summarizeOptions = attemptOptions[summaryAttemptPhase];
			const summarizeProps: ISummarizeTelemetryProperties = {
				summarizeReason: reason,
				summaryAttempts,
				summaryAttemptsPerPhase,
				summaryAttemptPhase: summaryAttemptPhase + 1, // make everything 1-based
				...summarizeOptions,
			};

			// Note: no need to account for cancellationToken.waitCancelled here, as
			// this is accounted SummaryGenerator.summarizeCore that controls receivedSummaryAckOrNack.
			const resultSummarize = this.generator.summarize(
				summarizeProps,
				summarizeOptions,
				this.cancellationToken,
			);
			const ackNackResult = await resultSummarize.receivedSummaryAckOrNack;
			if (ackNackResult.success) {
				return;
			}

			// Check for retryDelay that can come from summaryNack, upload summary or submit summary flows.
			// Retry the same step only once per retryAfter response.
			const submitResult = await resultSummarize.summarySubmitted;
			const delaySeconds = !submitResult.success
				? submitResult.data?.retryAfterSeconds
				: ackNackResult.data?.retryAfterSeconds;
			if (delaySeconds === undefined || summaryAttemptsPerPhase > 1) {
				summaryAttemptPhase++;
				summaryAttemptsPerPhase = 0;
			}

			if (delaySeconds !== undefined) {
				this.mc.logger.sendPerformanceEvent({
					eventName: "SummarizeAttemptDelay",
					duration: delaySeconds,
					summaryNackDelay: ackNackResult.data?.retryAfterSeconds !== undefined,
					...summarizeProps,
				});
				await delay(delaySeconds * 1000);
			}
		}
		this.stopSummarizerCallback("failToSummarize");
	}

	/**
	 * Tries to summarize with retries where retry is based on the failure params.
	 * For example, summarization may be retried for failures with "retryAfterSeconds" param.
	 */
	private async trySummarizeWithRetries(reason: SummarizeReason) {
		// The max number of attempts are based on the stage at which summarization failed. If it fails before it is
		// submitted, a different value is used compared to if it fails after submission. Usually, in the former case,
		// we would retry more often as its cheaper and retries are likely to succeed.
		// This makes it harder to predict how many attempts would actually happen as that depends on how far an attempt
		// made. To keep things simple, the max attempts is reset after every attempt based on where it failed. This may
		// result in some failures not being retried depending on what happened before this attempt. That's fine because
		// such scenarios are very unlikely and even if it happens, it would resolve when a new summarizer starts over.
		let maxAttempts = defaultMaxAttempts;
		let currentAttempt = 0;
		let success = false;
		let done = false;
		do {
			if (this.cancellationToken.cancelled) {
				success = true;
				done = true;
				break;
			}

			currentAttempt++;
			const summarizeOptions: ISummarizeOptions = {
				refreshLatestAck: false,
				fullTree: false,
			};
			const summarizeProps: ISummarizeTelemetryProperties = {
				summarizeReason: reason,
				summaryAttempts: currentAttempt,
				...summarizeOptions,
			};
			const summarizeResult = this.generator.summarize(
				summarizeProps,
				summarizeOptions,
				this.cancellationToken,
			);

			// Ack / nack is the final step, so if it succeeds we're done.
			const ackNackResult = await summarizeResult.receivedSummaryAckOrNack;
			if (ackNackResult.success) {
				success = true;
				done = true;
				break;
			}

			const submitSummaryResult = await summarizeResult.summarySubmitted;
			let retryAfterSeconds: number | undefined;

			// Update max attempts and retry params from the failure result.
			// If submit summary failed, use the params from "summarySubmitted" result. Else, use the params
			// from "receivedSummaryAckOrNack" result.
			// Note: Check "summarySubmitted" result first because if it fails, ack nack would fail as well.
			if (!submitSummaryResult.success) {
				maxAttempts = this.maxAttemptsForSubmitFailures;
				retryAfterSeconds = submitSummaryResult.data?.retryAfterSeconds;
			} else {
				maxAttempts = defaultMaxAttempts;
				retryAfterSeconds = ackNackResult.data?.retryAfterSeconds;
			}

			// If the failure doesn't have "retryAfterSeconds" or the max number of attempts have been done, we're done.
			if (retryAfterSeconds === undefined || currentAttempt >= maxAttempts) {
				success = false;
				done = true;
				break;
			}

			this.mc.logger.sendPerformanceEvent({
				eventName: "SummarizeAttemptDelay",
				duration: retryAfterSeconds,
				summaryNackDelay: ackNackResult.data?.retryAfterSeconds !== undefined,
				stage: submitSummaryResult.data?.stage,
				dynamicRetries: true, // To differentiate this telemetry from regular retry logic
				...summarizeProps,
			});
			await delay(retryAfterSeconds * 1000);
		} while (!done);

		// If summarization isn't successful, stop the summarizer.
		if (!success) {
			this.stopSummarizerCallback("failToSummarize");
		}
	}

	/** {@inheritdoc (ISummarizer:interface).summarizeOnDemand} */
	public summarizeOnDemand(
		options: IOnDemandSummarizeOptions,
		resultsBuilder: SummarizeResultBuilder = new SummarizeResultBuilder(),
	): ISummarizeResults {
		if (this.stopping) {
			resultsBuilder.fail("RunningSummarizer stopped or disposed", undefined);
			return resultsBuilder.build();
		}
		// Check for concurrent summary attempts. If one is found,
		// return a promise that caller can await before trying again.
		if (this.summarizingLock !== undefined) {
			// The heuristics are blocking concurrent summarize attempts.
			throw new UsageError("Attempted to run an already-running summarizer on demand");
		}

		const { reason, ...summarizeOptions } = options;
		const result = this.trySummarizeOnce(
			{ summarizeReason: `onDemand/${reason}` },
			summarizeOptions,
			resultsBuilder,
		);
		return result;
	}

	/** {@inheritdoc (ISummarizer:interface).enqueueSummarize} */
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
				undefined,
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

	private tryRunEnqueuedSummary() {
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

	private disposeEnqueuedSummary() {
		if (this.enqueuedSummary !== undefined) {
			this.enqueuedSummary.resultsBuilder.fail(
				"RunningSummarizer stopped or disposed",
				undefined,
			);
			this.enqueuedSummary = undefined;
		}
	}
}
