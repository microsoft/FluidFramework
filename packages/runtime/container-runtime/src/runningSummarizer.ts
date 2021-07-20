/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
import { Deferred, PromiseTimer } from "@fluidframework/common-utils";
import {
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISummaryConfiguration,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import {
    IGenerateSummaryOptions,
    ISummarizer,
    ISummarizerInternalsProvider,
    OnDemandSummarizeResult,
} from "./summarizerTypes";
import { IClientSummaryWatcher, SummaryCollection } from "./summaryCollection";
import {
    checkNotTimeout,
    ISummaryAttempt,
    SummarizeReason,
    SummarizerHeuristics,
    SummaryGenerator,
} from "./summaryGenerator";

const maxSummarizeAckWaitTime = 10 * 60 * 1000; // 10 minutes
const minOpsForLastSummary = 50;

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
            & Pick<ISummarizerInternalsProvider, "generateSummary">,
        lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
        raiseSummarizingError: (description: string) => void,
        summaryCollection: SummaryCollection,
    ): Promise<RunningSummarizer> {
        const summarizer = new RunningSummarizer(
            clientId,
            onBehalfOfClientId,
            logger,
            summaryWatcher,
            configuration,
            internalsProvider,
            lastOpSeqNumber,
            firstAck,
            raiseSummarizingError,
            summaryCollection);

        await summarizer.waitStart();

        // Run the heuristics after starting
        summarizer.heuristics.run();
        return summarizer;
    }

    public get disposed() { return this._disposed; }

    private stopping = false;
    private _disposed = false;
    private summarizingLock: Promise<void> | undefined;
    private tryWhileSummarizing = false;
    private readonly pendingAckTimer: PromiseTimer;
    private readonly heuristics: SummarizerHeuristics;
    private readonly generator: SummaryGenerator;
    private readonly logger: ITelemetryLogger;

    private constructor(
        private readonly clientId: string,
        private readonly onBehalfOfClientId: string,
        baseLogger: ITelemetryLogger,
        private readonly summaryWatcher: IClientSummaryWatcher,
        private readonly configuration: ISummaryConfiguration,
        private readonly internalsProvider: Pick<ISummarizer, "stop">
            & Pick<ISummarizerInternalsProvider, "generateSummary">,
        lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
        private readonly raiseSummarizingError: (description: string) => void,
        private readonly summaryCollection: SummaryCollection,
    ) {
        this.logger = ChildLogger.create(
            baseLogger, "Running", { all: { summaryGenTag: () => this.generator.getSummarizeCount() } });

        this.heuristics = new SummarizerHeuristics(
            configuration,
            (reason) => this.trySummarize(reason),
            lastOpSeqNumber,
            firstAck);

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
                    refSequenceNumber: this.heuristics.lastAttempted.refSequenceNumber,
                    summarySequenceNumber: this.heuristics.lastAttempted.summarySequenceNumber,
                    timePending: Date.now() - this.heuristics.lastAttempted.summaryTime,
                });
            });
        // Set up pending ack timeout by op timestamp differences for previous summaries.
        summaryCollection.setPendingAckTimerTimeoutCallback(maxAckWaitTime, () => {
            if (this.pendingAckTimer.hasTimer) {
                this.logger.sendTelemetryEvent({
                    eventName: "MissingSummaryAckFoundByOps",
                    refSequenceNumber: this.heuristics.lastAttempted.refSequenceNumber,
                    summarySequenceNumber: this.heuristics.lastAttempted.summarySequenceNumber,
                });
                this.pendingAckTimer.clear();
            }
        });

        this.generator = new SummaryGenerator(
            this.pendingAckTimer,
            this.heuristics,
            this.internalsProvider,
            this.raiseSummarizingError,
            this.summaryWatcher,
            this.logger,
        );
    }

    public dispose(): void {
        this.summaryWatcher.dispose();
        this.heuristics.dispose();
        this.generator.dispose();
        this.pendingAckTimer.clear();
        this._disposed = true;
    }

    /**
     * RunningSummarizer's logger includes the sequenced index of the current summary on each event.
     * If some other Summarizer code wants that event on their logs they can get it here,
     * but only if they're logging about that same summary.
     * @param summaryOpRefSeq - RefSeq number of the summary op, to ensure the log correlation will be correct
     */
    public tryGetCorrelatedLogger = (summaryOpRefSeq) =>
        this.heuristics.lastAttempted.refSequenceNumber === summaryOpRefSeq
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

    public handleOp(error: any, op: ISequencedDocumentMessage) {
        if (error !== undefined) {
            return;
        }
        this.heuristics.lastOpSeqNumber = op.sequenceNumber;

        // Check for ops requesting summary
        if (op.type === MessageType.Save) {
            // TODO: cast is only required until TypeScript version 4.3
            this.trySummarize(`save;${op.clientId}: ${op.contents}` as `save;${string}: ${string}`);
        } else {
            this.heuristics.run();
        }
    }

    public async waitStop(): Promise<void> {
        if (this.disposed) {
            return;
        }
        if (this.stopping) {
            await Promise.all([
                this.summarizingLock,
                this.generator.waitSummarizing(),
            ]);
            return;
        }
        this.stopping = true;
        const outstandingOps = this.heuristics.lastOpSeqNumber - this.heuristics.lastAcked.refSequenceNumber;
        if (outstandingOps > minOpsForLastSummary) {
            this.trySummarize("lastSummary");
            // This resolves when the current pending summary is acked or fails.
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
        const maybeLastAck = await Promise.race([
            this.summaryWatcher.waitFlushed(),
            this.pendingAckTimer.start(),
        ]);
        this.pendingAckTimer.clear();

        // Remove pending ack wait timeout by op timestamp comparison, because
        // it has race conditions with summaries submitted by this same client.
        this.summaryCollection.unsetPendingAckTimerTimeoutCallback();

        if (checkNotTimeout(maybeLastAck)) {
            this.heuristics.initialize({
                refSequenceNumber: maybeLastAck.summaryOp.referenceSequenceNumber,
                summaryTime: maybeLastAck.summaryOp.timestamp,
                summarySequenceNumber: maybeLastAck.summaryOp.sequenceNumber,
            });
        }
    }

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
                { refreshLatestAck: true, fullTree: false, delayMinutes: 2 },
                { refreshLatestAck: true, fullTree: true, delayMinutes: 10 },
            ];
            for (let i = 0; i < attempts.length; i++) {
                const { delayMinutes = 0, ...options } = attempts[i];
                if (delayMinutes > 0) {
                    await new Promise((resolve) => setTimeout(resolve, delayMinutes * 1000 * 60));
                }
                const attemptReason = i > 0 ? `retry${i}` as `retry${number}` : reason;
                const result = await this.generator.summarize(attemptReason, options).receivedSummaryAckOrNack;
                await this.generator.waitSummarizing();
                if (result.success && result.data.summaryAckNackOp.type === MessageType.SummaryAck) {
                    // Note: checking for MessageType.SummaryAck is redundant since success is false for nack.
                    return;
                }
            }
            // If all attempts failed, close the summarizer container
            this.logger.sendErrorEvent({ eventName: "FailToSummarize" });
            this.internalsProvider.stop("failToSummarize");
        })().finally(() => {
            summarizingLock.resolve();
            this.summarizingLock = undefined;
            this.checkRerunHeuristics();
        }).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "UnexpectedSummarizeError" }, error);
        });
    }

    public summarizeOnDemand(
        reason: string,
        options: Omit<IGenerateSummaryOptions, "summaryLogger">,
    ): OnDemandSummarizeResult {
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
        const result = this.generator.summarize(`onDemand;${reason}` as `onDemand;${string}`, options);
        result.receivedSummaryAckOrNack.finally(() => this.checkRerunHeuristics());
        return result;
    }

    private checkRerunHeuristics() {
        if (this.tryWhileSummarizing) {
            this.tryWhileSummarizing = false;
            if (!this.stopping && !this._disposed) {
                this.heuristics.run();
            }
        }
    }
}
