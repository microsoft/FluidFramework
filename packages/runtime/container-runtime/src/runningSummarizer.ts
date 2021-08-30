/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { assert, delay, Deferred, PromiseTimer } from "@fluidframework/common-utils";
import {
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISummaryConfiguration,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { SummarizeHeuristicRunner } from "./summarizerHeuristics";
import {
    IEnqueueSummarizeOptions,
    ISummarizeOptions,
    ISummarizer,
    ISummarizeHeuristicData,
    ISummarizeHeuristicRunner,
    ISummarizerInternalsProvider,
    ISummarizerOptions,
    OnDemandSummarizeResult,
    IOnDemandSummarizeOptions,
    EnqueueSummarizeResult,
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
        clientId: string,
        onBehalfOfClientId: string,
        logger: ITelemetryLogger,
        summaryWatcher: IClientSummaryWatcher,
        configuration: ISummaryConfiguration,
        internalsProvider: Pick<ISummarizer, "stop">
            & Pick<ISummarizerInternalsProvider, "submitSummary">,
        heuristicData: ISummarizeHeuristicData,
        raiseSummarizingError: (description: string) => void,
        summaryCollection: SummaryCollection,
        options?: Readonly<Partial<ISummarizerOptions>>,
    ): Promise<RunningSummarizer> {
        const summarizer = new RunningSummarizer(
            clientId,
            onBehalfOfClientId,
            logger,
            summaryWatcher,
            configuration,
            internalsProvider,
            heuristicData,
            raiseSummarizingError,
            summaryCollection,
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
    private summarizeCount = 0;

    private constructor(
        private readonly clientId: string,
        private readonly onBehalfOfClientId: string,
        baseLogger: ITelemetryLogger,
        private readonly summaryWatcher: IClientSummaryWatcher,
        private readonly configuration: ISummaryConfiguration,
        private readonly internalsProvider: Pick<ISummarizer, "stop">
            & Pick<ISummarizerInternalsProvider, "submitSummary">,
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly raiseSummarizingError: (description: string) => void,
        private readonly summaryCollection: SummaryCollection,
        { disableHeuristics = false }: Readonly<Partial<ISummarizerOptions>> = {},
    ) {
        this.logger = ChildLogger.create(
            baseLogger, "Running", { all: { summaryGenTag: () => this.summarizeCount } });

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
            this.internalsProvider,
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
            case MessageType.ClientLeave: {
                const leavingClientId = JSON.parse((op as ISequencedDocumentSystemMessage).data) as string;
                if (leavingClientId === this.clientId || leavingClientId === this.onBehalfOfClientId) {
                    // Ignore summarizer leave messages, to make sure not to start generating
                    // a summary as the summarizer is leaving
                    return;
                }
                // Leave ops for any other client fall through to handle normally
            }
            // Intentional fallthrough
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

        if (!this.stopping) {
            this.stopping = true;

            this.disposeEnqueuedSummary();

            // This will try to run lastSummary if needed.
            if (this.heuristicRunner?.shouldRunLastSummary()) {
                this.trySummarize("lastSummary");
            }
        }

        // This resolves when the current pending summary gets an ack or fails.
        // We wait for the result in case a safe summary is needed, and to get
        // better telemetry.
        await Promise.all([
            this.summarizingLock,
            this.generator.waitSummarizing(),
        ]);
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
    private trySummarize(summarizeReason: SummarizeReason): void {
        if (this.summarizingLock !== undefined || this.generator.isSummarizing()) {
            // Indicate that heuristics tried to summarize, and check immediately
            // after completion if heuristics still indicate we should summarize.
            this.tryWhileSummarizing = true;
            return;
        }
        const summarizingLock = new Deferred<void>();
        this.summarizingLock = summarizingLock.promise;

        this.summarizeCount++;

        (async () => {
            const attempts = [
                { refreshLatestAck: false, fullTree: false },
                { refreshLatestAck: true, fullTree: false },
                { refreshLatestAck: true, fullTree: false, delaySeconds: 2 * 60 },
                { refreshLatestAck: true, fullTree: true, delaySeconds: 10 * 60 },
            ];
            let overrideDelaySeconds: number | undefined;
            let totalRetries = 0;
            let retriesPerPhase = 0;
            // Note: intentionally incrementing retryNumber in for loop rather than attemptPhase.
            for (let attemptPhase = 0; attemptPhase < attempts.length;) {
                totalRetries++;
                retriesPerPhase++;
                const summarizeProps: ITelemetryProperties = {
                    summarizeReason,
                    summarizeTotalRetries: totalRetries,
                    summarizeRetryPerPhase: retriesPerPhase,
                    summarizeAttemptPhase: attemptPhase + 1, // make everything 1-based
                };

                const { delaySeconds: regularDelaySeconds = 0, ...options } = attempts[attemptPhase];
                const delaySeconds = overrideDelaySeconds ?? regularDelaySeconds;
                if (delaySeconds > 0) {
                    this.logger.sendPerformanceEvent({
                        eventName: "SummarizeAttemptDelay",
                        duration: delaySeconds,
                        reason: overrideDelaySeconds !== undefined ? "nack with retryAfter" : undefined,
                        ...summarizeProps,
                    });
                    await delay(delaySeconds * 1000);
                }
                const result = await this.generator.summarize(summarizeProps, options).receivedSummaryAckOrNack;
                await this.generator.waitSummarizing();

                if (result.success) {
                    assert(result.data.summaryAckNackOp.type === MessageType.SummaryAck, "not nack");
                    return;
                }
                // Check for retryDelay that can come from summaryNack or upload summary flow.
                // Retry the same step only once per retryAfter response.
                overrideDelaySeconds = result.retryAfterSeconds;
                if (overrideDelaySeconds === undefined || retriesPerPhase > 1) {
                    attemptPhase++;
                    retriesPerPhase = 0;
                }
            }
            // If all attempts failed, close the summarizer container
            this.logger.sendErrorEvent({ eventName: "FailToSummarize", summarizeReason });
            this.internalsProvider.stop("failToSummarize");
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
        this.summarizeCount++;
        const result = this.generator.summarize({ summarizeReason: `onDemand/${reason}` }, options);
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
        this.summarizeCount++;
        this.generator.summarize(
            { summarizeReason: `enqueuedSummary/${reason}` },
            options,
            resultsBuilder)
        .receivedSummaryAckOrNack.finally(() => this.checkSummarizeAgain());
        return true;
    }

    private disposeEnqueuedSummary() {
        if (this.enqueuedSummary !== undefined) {
            this.enqueuedSummary.resultsBuilder.fail("RunningSummarizer stopped or disposed", undefined);
            this.enqueuedSummary = undefined;
        }
    }
}
