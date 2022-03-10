/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { assert, delay, Deferred, PromiseTimer } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import {
    ISequencedDocumentMessage,
    ISummaryConfiguration,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { SummarizeHeuristicRunner } from "./summarizerHeuristics";
import {
    IEnqueueSummarizeOptions,
    ISummarizeOptions,
    ISummarizeHeuristicData,
    ISummarizeHeuristicRunner,
    ISummarizerOptions,
    IOnDemandSummarizeOptions,
    EnqueueSummarizeResult,
    SummarizerStopReason,
    ISubmitSummaryOptions,
    SubmitSummaryResult,
    ISummaryCancellationToken,
    ISummarizeResults,
} from "./summarizerTypes";
import { IClientSummaryWatcher, SummaryCollection } from "./summaryCollection";
import {
    raceTimer,
    SummarizeReason,
    SummarizeResultBuilder,
    SummaryGenerator,
} from "./summaryGenerator";

const maxSummarizeAckWaitTime = 10 * 60 * 1000; // 10 minutes

/**
 * An instance of RunningSummarizer manages the heuristics for summarizing.
 * Until disposed, the instance of RunningSummarizer can assume that it is
 * in a state of running, meaning it is connected and initialized.  It keeps
 * track of summaries that it is generating as they are broadcast and acked/nacked.
 * This object is created and controlled by Summarizer object.
 */
export class RunningSummarizer implements IDisposable {
    public static async start(
        logger: ITelemetryLogger,
        summaryWatcher: IClientSummaryWatcher,
        configuration: ISummaryConfiguration,
        submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
        heuristicData: ISummarizeHeuristicData,
        raiseSummarizingError: (errorMessage: string) => void,
        summaryCollection: SummaryCollection,
        cancellationToken: ISummaryCancellationToken,
        stopSummarizerCallback: (reason: SummarizerStopReason) => void,
        options?: Readonly<Partial<ISummarizerOptions>>,
    ): Promise<RunningSummarizer> {
        const summarizer = new RunningSummarizer(
            logger,
            summaryWatcher,
            configuration,
            submitSummaryCallback,
            heuristicData,
            raiseSummarizingError,
            summaryCollection,
            cancellationToken,
            stopSummarizerCallback,
            options);

        await summarizer.waitStart();

        // Run the heuristics after starting
        summarizer.heuristicRunner?.run();
        return summarizer;
    }

    public get disposed() { return this._disposed; }

    private stopping = false;
    private _disposed = false;
    private summarizingLock: Promise<void> | undefined;
    private tryWhileSummarizing = false;
    private readonly pendingAckTimer: PromiseTimer;
    private heuristicRunner?: ISummarizeHeuristicRunner;
    private readonly generator: SummaryGenerator;
    private readonly logger: ITelemetryLogger;
    private enqueuedSummary: {
        reason: SummarizeReason;
        afterSequenceNumber: number;
        options: ISummarizeOptions;
        readonly resultsBuilder: SummarizeResultBuilder;
    } | undefined;
    private summarizeCount = 0;
    private totalSuccessfulAttempts = 0;

    private constructor(
        baseLogger: ITelemetryLogger,
        private readonly summaryWatcher: IClientSummaryWatcher,
        private readonly configuration: ISummaryConfiguration,
        private readonly submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly raiseSummarizingError: (errorMessage: string) => void,
        private readonly summaryCollection: SummaryCollection,
        private readonly cancellationToken: ISummaryCancellationToken,
        private readonly stopSummarizerCallback: (reason: SummarizerStopReason) => void,
        { disableHeuristics = false }: Readonly<Partial<ISummarizerOptions>> = {},
    ) {
        this.logger = ChildLogger.create(
            baseLogger, "Running",
            {
                all: {
                    summarizeCount: () => this.summarizeCount,
                    summarizerSuccessfulAttempts: () => this.totalSuccessfulAttempts,
                },
            },
        );

        if (!disableHeuristics) {
            this.heuristicRunner = new SummarizeHeuristicRunner(
                heuristicData,
                configuration,
                (reason) => this.trySummarize(reason));
        }

        // Cap the maximum amount of time client will wait for a summarize op ack to maxSummarizeAckWaitTime
        // configuration.maxAckWaitTime is composed from defaults, server values, and runtime overrides
        const maxAckWaitTime = Math.min(this.configuration.maxAckWaitTime, maxSummarizeAckWaitTime);

        this.pendingAckTimer = new PromiseTimer(
            maxAckWaitTime,
            () => {
                // pre-0.58 error message: summaryAckWaitTimeout
                this.raiseSummarizingError("Pending summary ack not received in time");
                // Note: summarizeCount (from ChildLogger definition) may be 0,
                // since this code path is hit when RunningSummarizer first starts up,
                // before this instance has kicked off a new summarize run.
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime,
                    referenceSequenceNumber: this.heuristicData.lastAttempt.refSequenceNumber,
                    summarySequenceNumber: this.heuristicData.lastAttempt.summarySequenceNumber,
                    timePending: Date.now() - this.heuristicData.lastAttempt.summaryTime,
                });
            });
        // Set up pending ack timeout by op timestamp differences for previous summaries.
        summaryCollection.setPendingAckTimerTimeoutCallback(maxAckWaitTime, () => {
            if (this.pendingAckTimer.hasTimer) {
                this.logger.sendTelemetryEvent({
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
            this.raiseSummarizingError,
            () => { this.totalSuccessfulAttempts++; },
            this.summaryWatcher,
            this.logger,
        );
    }

    public dispose(): void {
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
            ? this.logger
            : undefined;

    public handleSystemOp(op: ISequencedDocumentMessage) {
        switch (op.type) {
            case MessageType.ClientLeave:
            case MessageType.ClientJoin:
            case MessageType.Propose: {
                // Synchronously handle quorum ops like regular ops
                this.handleOp(undefined, op);
                return;
            }
            default: {
                return;
            }
        }
    }

    public handleOp(error: any, { sequenceNumber, type, clientId, contents }: ISequencedDocumentMessage) {
        if (error !== undefined) {
            return;
        }
        this.heuristicData.lastOpSequenceNumber = sequenceNumber;

        // Check for enqueued on-demand summaries; Intentionally do nothing otherwise
        if (!this.tryRunEnqueuedSummary()) {
            this.heuristicRunner?.run();
        }
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
                    {});
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
            this.heuristicData.initialize({
                refSequenceNumber: waitStartResult.value.summaryOp.referenceSequenceNumber,
                summaryTime: waitStartResult.value.summaryOp.timestamp,
                summarySequenceNumber: waitStartResult.value.summaryOp.sequenceNumber,
            });
        }
    }

    /**
     * Runs single summary action that prevents any other concurrent actions.
     * Assumes that caller checked upfront for lack of concurrent action (this.summarizingLock)
     * before calling this API. I.e. caller is responsible for either erroring out or waiting on this promise.
     * @param action - action to perform.
     * @returns - result of action.
     */
    private async lockedSummaryAction<T>(action: () => Promise<T>) {
        assert (this.summarizingLock === undefined, 0x25b /* "Caller is responsible for checking lock" */);

        const summarizingLock = new Deferred<void>();
        this.summarizingLock = summarizingLock.promise;

        this.summarizeCount++;

        return action().finally(() => {
            summarizingLock.resolve();
            this.summarizingLock = undefined;

            const retry = this.tryWhileSummarizing;
            this.tryWhileSummarizing = false;

            // After summarizing, we should check to see if we need to summarize again.
            // Rerun the heuristics and check for enqueued summaries.
            if (!this.stopping && !this.tryRunEnqueuedSummary() && retry) {
                this.heuristicRunner?.run();
            }
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
        summarizeProps: ITelemetryProperties,
        options: ISummarizeOptions,
        cancellationToken = this.cancellationToken,
        resultsBuilder = new SummarizeResultBuilder()): ISummarizeResults
    {
        this.lockedSummaryAction(async () => {
            const summarizeResult = this.generator.summarize(
                summarizeProps,
                options,
                cancellationToken,
                resultsBuilder);
            // ensure we wait till the end of the process
            return summarizeResult.receivedSummaryAckOrNack;
        }).catch((error) => {
            // SummaryGenerator.summarize() does not throw exceptions - it converts them to failed result
            // on resultsBuilder
            // We do not care about exceptions on receivedSummaryAckOrNack - caller should check results
            // and take a appropriate action.
        });

        return resultsBuilder.build();
    }

    /** Heuristics summarize attempt. */
    private trySummarize(
        summarizeReason: SummarizeReason,
        cancellationToken = this.cancellationToken): void
    {
        if (this.summarizingLock !== undefined) {
            // lockedSummaryAction() will retry heuristic-based summary at the end of current attempt
            // if it's still needed
            this.tryWhileSummarizing = true;
            return;
        }

        this.lockedSummaryAction(async () => {
            const attempts: (ISummarizeOptions & { delaySeconds?: number })[] = [
                { refreshLatestAck: false, fullTree: false },
                { refreshLatestAck: true, fullTree: false },
                { refreshLatestAck: true, fullTree: false, delaySeconds: 2 * 60 },
                { refreshLatestAck: true, fullTree: true, delaySeconds: 10 * 60 },
            ];
            let overrideDelaySeconds: number | undefined;
            let summaryAttempts = 0;
            let summaryAttemptsPerPhase = 0;

            let lastResult: { message: string; error: any; } | undefined;

            for (let summaryAttemptPhase = 0; summaryAttemptPhase < attempts.length;) {
                if (this.cancellationToken.cancelled) {
                    return;
                }

                summaryAttempts++;
                summaryAttemptsPerPhase++;

                const { delaySeconds: regularDelaySeconds = 0, ...options } = attempts[summaryAttemptPhase];
                const delaySeconds = overrideDelaySeconds ?? regularDelaySeconds;

                const summarizeProps: ITelemetryProperties = {
                    summarizeReason,
                    summaryAttempts,
                    summaryAttemptsPerPhase,
                    summaryAttemptPhase: summaryAttemptPhase + 1, // make everything 1-based
                    ...options,
                };

                if (delaySeconds > 0) {
                    this.logger.sendPerformanceEvent({
                        eventName: "SummarizeAttemptDelay",
                        duration: delaySeconds,
                        reason: overrideDelaySeconds !== undefined ? "nack with retryAfter" : undefined,
                        ...summarizeProps,
                    });
                    await delay(delaySeconds * 1000);
                }
                // Note: no need to account for cancellationToken.waitCancelled here, as
                // this is accounted SummaryGenerator.summarizeCore that controls receivedSummaryAckOrNack.
                const resultSummarize = this.generator.summarize(summarizeProps, options, cancellationToken);
                const result = await resultSummarize.receivedSummaryAckOrNack;

                if (result.success) {
                    this.totalSuccessfulAttempts++;
                    return;
                }
                // Check for retryDelay that can come from summaryNack or upload summary flow.
                // Retry the same step only once per retryAfter response.
                overrideDelaySeconds = result.retryAfterSeconds;
                if (overrideDelaySeconds === undefined || summaryAttemptsPerPhase > 1) {
                    summaryAttemptPhase++;
                    summaryAttemptsPerPhase = 0;
                }
                lastResult = result;
            }

            // If all attempts failed, log error (with last attempt info) and close the summarizer container
            this.logger.sendErrorEvent({
                eventName: "FailToSummarize",
                summarizeReason,
                message: lastResult?.message,
            }, lastResult?.error);

            this.stopSummarizerCallback("failToSummarize");
        }).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "UnexpectedSummarizeError" }, error);
        });
    }

    /** {@inheritdoc (ISummarizer:interface).summarizeOnDemand} */
    public summarizeOnDemand(
        resultsBuilder: SummarizeResultBuilder = new SummarizeResultBuilder(),
        {
            reason,
            ...options
        }: IOnDemandSummarizeOptions): ISummarizeResults {
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
        const result = this.trySummarizeOnce(
            { summarizeReason: `onDemand/${reason}` },
            options,
            this.cancellationToken,
            resultsBuilder);
        return result;
    }

    /** {@inheritdoc (ISummarizer:interface).enqueueSummarize} */
    public enqueueSummarize({
        reason,
        afterSequenceNumber = 0,
        override = false,
        ...options
    }: IEnqueueSummarizeOptions): EnqueueSummarizeResult {
        const onDemandReason = `enqueue;${reason}` as const;
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
            reason: onDemandReason,
            afterSequenceNumber,
            options,
            resultsBuilder: new SummarizeResultBuilder(),
        };
        const results = this.enqueuedSummary.resultsBuilder.build();
        this.tryRunEnqueuedSummary();
        return overridden ? {
            ...results,
            alreadyEnqueued: true,
            overridden: true,
        } : results;
    }

    private tryRunEnqueuedSummary() {
        if (this.stopping) {
            this.disposeEnqueuedSummary();
            return false;
        }
        if (
            this.enqueuedSummary === undefined
            || this.heuristicData.lastOpSequenceNumber < this.enqueuedSummary.afterSequenceNumber
            || this.summarizingLock !== undefined
        ) {
            // If no enqueued summary is ready or a summary is already in progress, take no action.
            return false;
        }
        const { reason, resultsBuilder, options } = this.enqueuedSummary;
        // Set to undefined first, so that subsequent enqueue attempt while summarize will occur later.
        this.enqueuedSummary = undefined;
        this.trySummarizeOnce(
            { summarizeReason: `enqueuedSummary/${reason}` },
            options,
            this.cancellationToken,
            resultsBuilder);
        return true;
    }

    private disposeEnqueuedSummary() {
        if (this.enqueuedSummary !== undefined) {
            this.enqueuedSummary.resultsBuilder.fail("RunningSummarizer stopped or disposed", undefined);
            this.enqueuedSummary = undefined;
        }
    }
}
