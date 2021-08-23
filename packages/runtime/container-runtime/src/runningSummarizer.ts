/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, delay, Deferred, PromiseTimer } from "@fluidframework/common-utils";
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
    OnDemandSummarizeResult,
    IOnDemandSummarizeOptions,
    EnqueueSummarizeResult,
    SummarizerStopReason,
    ISubmitSummaryOptions,
    SubmitSummaryResult,
    ICancellable,
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
 */
export class RunningSummarizer implements IDisposable {
    public static async start(
        logger: ITelemetryLogger,
        summaryWatcher: IClientSummaryWatcher,
        configuration: ISummaryConfiguration,
        submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
        heuristicData: ISummarizeHeuristicData,
        raiseSummarizingError: (description: string) => void,
        summaryCollection: SummaryCollection,
        cancellable: ICancellable,
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
            cancellable,
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
    private readonly heuristicRunner?: ISummarizeHeuristicRunner;
    private readonly generator: SummaryGenerator;
    private readonly logger: ITelemetryLogger;
    private enqueuedSummary: {
        reason: SummarizeReason;
        afterSequenceNumber: number;
        options: ISummarizeOptions;
        readonly resultsBuilder: SummarizeResultBuilder;
    } | undefined;

    private constructor(
        baseLogger: ITelemetryLogger,
        private readonly summaryWatcher: IClientSummaryWatcher,
        private readonly configuration: ISummaryConfiguration,
        private readonly submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly raiseSummarizingError: (description: string) => void,
        private readonly summaryCollection: SummaryCollection,
        private readonly cancellable: ICancellable,
        private readonly stopSummarizerCallback: (reason: SummarizerStopReason) => void,
        { disableHeuristics = false }: Readonly<Partial<ISummarizerOptions>> = {},
    ) {
        this.logger = ChildLogger.create(
            baseLogger, "Running", { all: { summaryGenTag: () => this.generator.getSummarizeCount() } });

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
                this.raiseSummarizingError("SummaryAckWaitTimeout");
                // Note: summaryGenTag (from ChildLogger definition) may be 0,
                // since this code path is hit when RunningSummarizer first starts up,
                // before this instance has kicked off a new summarize run.
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime,
                    refSequenceNumber: this.heuristicData.lastAttempt.refSequenceNumber,
                    summarySequenceNumber: this.heuristicData.lastAttempt.summarySequenceNumber,
                    timePending: Date.now() - this.heuristicData.lastAttempt.summaryTime,
                });
            });
        // Set up pending ack timeout by op timestamp differences for previous summaries.
        summaryCollection.setPendingAckTimerTimeoutCallback(maxAckWaitTime, () => {
            if (this.pendingAckTimer.hasTimer) {
                this.logger.sendTelemetryEvent({
                    eventName: "MissingSummaryAckFoundByOps",
                    refSequenceNumber: this.heuristicData.lastAttempt.refSequenceNumber,
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
            this.summaryWatcher,
            this.logger,
        );
    }

    public dispose(): void {
        this.summaryWatcher.dispose();
        this.heuristicRunner?.dispose();
        this.generator.dispose();
        this.pendingAckTimer.clear();
        this.disposeEnqueuedSummary();
        this._disposed = true;
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
            case MessageType.Propose:
            case MessageType.Reject: {
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

        if (this.tryRunEnqueuedSummary()) {
            // Intentionally do nothing; check for enqueued on-demand summaries
        } else if (type === MessageType.Save) {
            // Check for ops requesting summary
            // Note: as const is only required until TypeScript version 4.3
            this.trySummarize(`save;${clientId}: ${contents}` as const);
        } else {
            this.heuristicRunner?.run();
        }
    }

    public async waitStop(): Promise<void> {
        if (this.disposed) {
            return;
        }
        this.disposeEnqueuedSummary();
        if (this.stopping) {
            await Promise.all([
                this.summarizingLock,
                this.generator.waitSummarizing(),
            ]);
            return;
        }
        this.stopping = true;
        if (this.heuristicRunner?.runOnClose()) {
            // This resolves when the current pending summary gets an ack or fails.
            // We wait for the result in case a safe summary is needed, and to get
            // better telemetry.
            await Promise.all([
                this.summarizingLock,
                this.generator.waitSummarizing(),
            ]);
        }
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

    /** Heuristics summarize attempt. */
    private trySummarize(reason: SummarizeReason): void {
        if (this.summarizingLock !== undefined || this.generator.isSummarizing()) {
            // Indicate that heuristics tried to summarize, and check immediately
            // after completion if heuristics still indicate we should summarize.
            this.tryWhileSummarizing = true;
            return;
        }
        const summarizingLock = new Deferred<void>();
        this.summarizingLock = summarizingLock.promise;

        (async () => {
            const attempts = [
                { refreshLatestAck: false, fullTree: false },
                { refreshLatestAck: true, fullTree: false },
                { refreshLatestAck: true, fullTree: false, delaySeconds: 2 * 60 },
                { refreshLatestAck: true, fullTree: true, delaySeconds: 10 * 60 },
            ];
            let overrideDelaySeconds: number | undefined;
            let retryNumber = 0;
            // Note: intentionally incrementing retryNumber in for loop rather than attemptPhase.
            for (let attemptPhase = 0; attemptPhase < attempts.length; retryNumber++) {
                if (this.cancellable.cancelled) {
                    return;
                }

                const { delaySeconds: regularDelaySeconds = 0, ...options } = attempts[attemptPhase];
                const delaySeconds = overrideDelaySeconds ?? regularDelaySeconds;
                if (delaySeconds > 0) {
                    this.logger.sendPerformanceEvent({
                        eventName: "SummarizeAttemptDelay",
                        duration: delaySeconds,
                        reason: overrideDelaySeconds !== undefined ? "nack with retryAfter" : undefined,
                    });
                    await delay(delaySeconds * 1000);
                }
                const attemptReason = retryNumber > 0 ? `retry${retryNumber}` as const : reason;

                // Note: no need to account for this.cancellable.waitCancelled here, as
                // this is accounted SummaryGenerator.summarizeCore that controls receivedSummaryAckOrNack.
                const resultSummarize = this.generator.summarize(attemptReason, options, this.cancellable);
                const result = await resultSummarize.receivedSummaryAckOrNack;
                await this.generator.waitSummarizing();

                if (result.success) {
                    assert(result.data.summaryAckNackOp.type === MessageType.SummaryAck, "not nack");
                    return;
                }
                // Check for retryDelay that can come from summaryNack or upload summary flow.
                const retryAfterSeconds = result.retryAfterSeconds;
                if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
                    if (overrideDelaySeconds !== undefined) {
                        // Retry the same step only once per retryAfter response.
                        attemptPhase++;
                    }
                    overrideDelaySeconds = retryAfterSeconds;
                } else {
                    attemptPhase++;
                    overrideDelaySeconds = undefined;
                }
            }
            // If all attempts failed, close the summarizer container
            this.logger.sendErrorEvent({ eventName: "FailToSummarize" });
            this.stopSummarizerCallback("failToSummarize");
        })().finally(() => {
            summarizingLock.resolve();
            this.summarizingLock = undefined;
            this.checkSummarizeAgain();
        }).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "UnexpectedSummarizeError" }, error);
        });
    }

    /** {@inheritdoc (ISummarizer:interface).summarizeOnDemand} */
    public summarizeOnDemand({
        reason,
        ...options
    }: IOnDemandSummarizeOptions): OnDemandSummarizeResult {
        if (this.stopping || this.disposed) {
            const failBuilder = new SummarizeResultBuilder();
            failBuilder.fail("RunningSummarizer stopped or disposed", undefined);
            return failBuilder.build();
        }
        const onDemandReason = `onDemand;${reason}` as const;
        // Check for concurrent summary attempts. If one is found,
        // return a promise that caller can await before trying again.
        if (this.summarizingLock !== undefined) {
            // The heuristics are blocking concurrent summarize attempts.
            return { alreadyRunning: this.summarizingLock };
        }
        if (this.generator.isSummarizing()) {
            // Another summary is currently being generated.
            return { alreadyRunning: this.generator.waitSummarizing() };
        }
        const result = this.generator.summarize(onDemandReason, options, this.cancellable);
        result.receivedSummaryAckOrNack.finally(() => this.checkSummarizeAgain());
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

    /**
     * After summarizing, we should check to see if we need to summarize again.
     * Rerun the heuristics and check for enqueued summaries.
     */
    private checkSummarizeAgain() {
        if (this.tryRunEnqueuedSummary()) {
            this.tryWhileSummarizing = false;
        } else if (this.tryWhileSummarizing) {
            this.tryWhileSummarizing = false;
            if (!this.stopping && !this._disposed) {
                this.heuristicRunner?.run();
            }
        }
    }

    private tryRunEnqueuedSummary() {
        if (this.stopping || this.disposed) {
            this.disposeEnqueuedSummary();
            return false;
        }
        if (
            this.enqueuedSummary === undefined
            || this.heuristicData.lastOpSequenceNumber < this.enqueuedSummary.afterSequenceNumber
            || this.summarizingLock !== undefined
            || this.generator.isSummarizing()
        ) {
            // If no enqueued summary is ready or a summary is already in progress, take no action.
            return false;
        }
        const { reason, resultsBuilder, options } = this.enqueuedSummary;
        // Set to undefined first, so that subsequent enqueue attempt while summarize will occur later.
        this.enqueuedSummary = undefined;
        this.generator.summarize(reason, options, this.cancellable, resultsBuilder).receivedSummaryAckOrNack.finally(
            () => this.checkSummarizeAgain());
        return true;
    }

    private disposeEnqueuedSummary() {
        if (this.enqueuedSummary !== undefined) {
            this.enqueuedSummary.resultsBuilder.fail("RunningSummarizer stopped or disposed", undefined);
            this.enqueuedSummary = undefined;
        }
    }
}
