/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { Deferred, IPromiseTimerResult, PromiseTimer, Timer } from "@fluidframework/common-utils";
import {
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISummaryConfiguration,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
// Only types are circular file dependencies
import { GenerateSummaryData, ISubmitSummaryData } from "./containerRuntime";
import { IGenerateSummaryOptions, ISummarizer, ISummarizerInternalsProvider } from "./summarizer";
import {
    IClientSummaryWatcher,
    ISummaryAckMessage,
    ISummaryNackMessage,
    ISummaryOpMessage,
    SummaryCollection,
} from "./summaryCollection";

// Send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // Double and resend 5 times
const maxSummarizeAckWaitTime = 10 * 60 * 1000; // 10 minutes

const minOpsForLastSummary = 50;

type SummarizeReason =
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
     * Special case to generate a summary in response to a Save op.
     * @deprecated - do not use save ops
     */
    | `save;${string}: ${string}`
    /**
     * Special case to attempt to summarize one last time before the
     * summarizer client closes itself. This is to prevent cases where
     * the summarizer client never gets a chance to summarize, because
     * there are too many outstanding ops and/or parent client cannot
     * stay connected long enough for summarizer client to catch up.
     */
    | "lastSummary"
    /** Previous summary attempt failed, and we are retrying. */
    | `retry${number}`
    /** On-demand summary requested with specified reason. */
    | `onDemand;${string}`;

const summarizeErrors = {
    /**
     * Error encountered while generating the summary tree, uploading
     * it to storage, or submitting the op. It could be a result of
     * the client becoming disconnected while generating or an actual error.
     */
    generateSummaryFailure: "Error while generating or submitting summary",
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
} as const;

/**
 * Data about a summary attempt
 */
export interface ISummaryAttempt {
    /**
     * Reference sequence number when summary was generated or attempted
     */
    readonly refSequenceNumber: number;

    /**
     * Time of summary attempt after it was sent or attempted
     */
    readonly summaryTime: number;

    /**
     * Sequence number of summary op
     */
    summarySequenceNumber?: number;
}

export type SummarizeResultPart<T> = {
    success: true;
    data: T;
} | {
    success: false;
    data: T | undefined;
    message: string;
    error: any;
};

export interface ISummarizeResult {
    /** Resolves when we generate, upload, and submit the summary */
    readonly generateSummary: Promise<SummarizeResultPart<GenerateSummaryData>>;
    /** Resolves when we see our summarize op broadcast; is sequence number of op */
    readonly broadcastSummaryOp: Promise<SummarizeResultPart<IBroadcastSummaryResult>>;
    /** True for ack; false for nack */
    readonly summaryAckNack: Promise<SummarizeResultPart<IAckSummaryResult | INackSummaryResult>>;
}
class SummarizeResultBuilder {
    public readonly generateSummary = new Deferred<SummarizeResultPart<GenerateSummaryData>>();
    public readonly broadcastSummaryOp = new Deferred<SummarizeResultPart<IBroadcastSummaryResult>>();
    public readonly summaryAckNack = new Deferred<SummarizeResultPart<IAckSummaryResult | INackSummaryResult>>();

    public fail(message: string, error: any) {
        const result = { success: false, message, data: undefined, error } as const;
        this.generateSummary.resolve(result);
        this.broadcastSummaryOp.resolve(result);
        this.summaryAckNack.resolve(result);
    }

    public build(): ISummarizeResult {
        return {
            generateSummary: this.generateSummary.promise,
            broadcastSummaryOp: this.broadcastSummaryOp.promise,
            summaryAckNack: this.summaryAckNack.promise,
        } as const;
    }
}

export interface IBroadcastSummaryResult {
    readonly summarizeOp: ISummaryOpMessage;
    readonly broadcastDuration: number;
}
export interface INackSummaryResult {
    readonly summaryNackOp: ISummaryNackMessage;
    readonly nackDuration: number;
}
export interface IAckSummaryResult {
    readonly summaryAckOp: ISummaryAckMessage;
    readonly ackDuration: number;
}
export type SummarizeResult =
    ({ error: any; } & (
        | GenerateSummaryData
        | ({ stage: "broadcasted"; } & IBroadcastSummaryResult & ISubmitSummaryData)
        | ({ stage: "nack"; } & INackSummaryResult & IBroadcastSummaryResult & ISubmitSummaryData)
    ))
    | ({ stage: "ack"; } & IAckSummaryResult & IBroadcastSummaryResult & ISubmitSummaryData);

export type OnDemandSummarizeResult = (ISummarizeResult & {
    /** Indicates that an already running summarize attempt does not exist. */
    readonly alreadyRunning?: undefined;
}) | {
    /** Resolves when an already running summarize attempt completes. */
    readonly alreadyRunning: Promise<void>;
};

const checkNotTimeout = <T>(something: T | IPromiseTimerResult | undefined): something is T => {
    if (something === undefined) {
        return false;
    }
    return (something as IPromiseTimerResult).timerResult === undefined;
};

/**
 * This class contains the heuristics for when to summarize.
 */
class SummarizerHeuristics {
    private _lastAttempted: ISummaryAttempt;
    private _lastAcked: ISummaryAttempt;

    /**
     * Last sent summary attempt
     */
    public get lastAttempted(): ISummaryAttempt {
        return this._lastAttempted;
    }

    /**
     * Last acked summary attempt
     */
    public get lastAcked(): ISummaryAttempt {
        return this._lastAcked;
    }

    private readonly idleTimer: Timer;

    public constructor(
        private readonly configuration: ISummaryConfiguration,
        private readonly trySummarize: (reason: SummarizeReason) => void,
        /**
         * Last received op sequence number
         */
        public lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
    ) {
        this._lastAttempted = firstAck;
        this._lastAcked = firstAck;
        this.idleTimer = new Timer(
            this.configuration.idleTime,
            () => this.trySummarize("idle"));
    }

    /**
     * Sets the last attempted summary and last acked summary.
     * @param lastSummary - last acked summary
     */
    public initialize(lastSummary: ISummaryAttempt) {
        this._lastAttempted = lastSummary;
        this._lastAcked = lastSummary;
    }

    /**
     * Records a summary attempt. If the attempt was successfully sent,
     * provide the reference sequence number, otherwise it will be set
     * to the last seen op sequence number.
     * @param refSequenceNumber - reference sequence number of sent summary
     */
    public recordAttempt(refSequenceNumber?: number) {
        this._lastAttempted = {
            refSequenceNumber: refSequenceNumber ?? this.lastOpSeqNumber,
            summaryTime: Date.now(),
        };
    }

    /**
     * Mark the last sent summary attempt as acked.
     */
    public ackLastSent() {
        this._lastAcked = this.lastAttempted;
    }

    /**
     * Runs the heuristic to determine if it should try to summarize.
     */
    public run() {
        this.idleTimer.clear();
        const timeSinceLastSummary = Date.now() - this.lastAcked.summaryTime;
        const opCountSinceLastSummary = this.lastOpSeqNumber - this.lastAcked.refSequenceNumber;

        if (timeSinceLastSummary > this.configuration.maxTime) {
            this.trySummarize("maxTime");
        } else if (opCountSinceLastSummary > this.configuration.maxOps) {
            this.trySummarize("maxOps");
        } else {
            this.idleTimer.restart();
        }
    }

    /**
     * Disposes of resources.
     */
    public dispose() {
        this.idleTimer.clear();
    }
}

/**
 * This class generates and tracks a summary attempt.
 */
class SummaryGenerator {
    private summarizing: Deferred<void> | undefined;
    public isSummarizing() { return this.summarizing !== undefined; }
    public async waitSummarizing() { await this.summarizing?.promise; }

    private summarizeCount = 0;
    public getSummarizeCount() { return this.summarizeCount; }

    private readonly summarizeTimer: Timer;

    constructor(
        private readonly pendingAckTimer: PromiseTimer,
        private readonly heuristics: SummarizerHeuristics,
        private readonly internalsProvider: Pick<ISummarizerInternalsProvider, "generateSummary">,
        private readonly raiseSummarizingError: (description: string) => void,
        private readonly summaryWatcher: Pick<IClientSummaryWatcher, "watchSummary">,
        private readonly logger: ITelemetryLogger,
    ) {
        this.summarizeTimer = new Timer(
            maxSummarizeTimeoutTime,
            () => this.summarizeTimerHandler(maxSummarizeTimeoutTime, 1),
        );
    }

    public summarize(
        reason: SummarizeReason,
        options: Omit<IGenerateSummaryOptions, "summaryLogger">,
    ): ISummarizeResult {
        const resultsBuilder = new SummarizeResultBuilder();

        if (this.summarizing !== undefined) {
            // We do not expect this case. Log the error and let it try again anyway.
            this.logger.sendErrorEvent({ eventName: "ConcurrentSummarizeAttempt", reason });
            resultsBuilder.fail("ConcurrentSummarizeAttempt", undefined);
            return resultsBuilder.build();
        }

        // GenerateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = new Deferred<void>();
        ++this.summarizeCount;

        this.summarizeCore(reason, options, resultsBuilder).finally(() => {
            this.summarizing?.resolve();
            this.summarizing = undefined;
        }).catch((error) => {
            const message = "UnexpectedSummarizeError";
            this.logger.sendErrorEvent({ eventName: message }, error);
            resultsBuilder.fail(message, error);
        });

        return resultsBuilder.build();
    }

    /**
     * Generates summary and listens for broadcast and ack/nack.
     * Returns true for ack, false for nack, and undefined for failure or timeout.
     * @param reason - reason for summarizing
     * @param options - refreshLatestAck to fetch summary ack info from server,
     * fullTree to generate tree without any summary handles even if unchanged
     */
    private async summarizeCore(
        reason: SummarizeReason,
        options: Omit<IGenerateSummaryOptions, "summaryLogger">,
        resultsBuilder: SummarizeResultBuilder,
    ): Promise<void> {
        const { refreshLatestAck, fullTree } = options;

        const summarizeEvent = PerformanceEvent.start(this.logger, {
            eventName: "Summarize",
            reason,
            refreshLatestAck,
            fullTree,
            timeSinceLastAttempt: Date.now() - this.heuristics.lastAttempted.summaryTime,
            timeSinceLastSummary: Date.now() - this.heuristics.lastAcked.summaryTime,
        });
        // Helper function to report failures and return.
        let summaryData: GenerateSummaryData | undefined;
        const getFailMessage = (message: keyof typeof summarizeErrors) => `${message}: ${summarizeErrors[message]}`;
        const fail = (
            message: keyof typeof summarizeErrors,
            error?: any,
            properties?: ITelemetryProperties,
        ) => {
            this.raiseSummarizingError(summarizeErrors[message]);
            summarizeEvent.cancel({ ...properties, message }, error);
            resultsBuilder.fail(getFailMessage(message), error);
        };

        // Wait to generate and send summary
        this.summarizeTimer.start();
        // Use record type to prevent unexpected value types
        let generateTelemetryProps: Record<string, string | number | boolean | undefined> = {};
        try {
            summaryData = await this.internalsProvider.generateSummary({
                fullTree,
                refreshLatestAck,
                summaryLogger: this.logger,
            });

            // ENTRY POINT FOR GENERATE
            resultsBuilder.generateSummary.resolve({ success: true, data: summaryData });

            // Cumulatively add telemetry properties based on how far generateSummary went.
            const { referenceSequenceNumber: refSequenceNumber } = summaryData;
            generateTelemetryProps = {
                refSequenceNumber,
                opsSinceLastAttempt: refSequenceNumber - this.heuristics.lastAttempted.refSequenceNumber,
                opsSinceLastSummary: refSequenceNumber - this.heuristics.lastAcked.refSequenceNumber,
            };
            if (summaryData.stage !== "aborted") {
                generateTelemetryProps = {
                    ...generateTelemetryProps,
                    ...summaryData.summaryStats,
                    generateDuration: summaryData.generateDuration,
                };

                if (summaryData.stage !== "generated") {
                    generateTelemetryProps = {
                        ...generateTelemetryProps,
                        handle: summaryData.handle,
                        uploadDuration: summaryData.uploadDuration,
                    };

                    if (summaryData.stage !== "uploaded") {
                        generateTelemetryProps = {
                            ...generateTelemetryProps,
                            clientSequenceNumber: summaryData.clientSequenceNumber,
                            submitOpDuration: summaryData.submitOpDuration,
                        };
                    }
                }
            }

            this.logger.sendTelemetryEvent({ eventName: "GenerateSummary", ...generateTelemetryProps });
            // EXIT POINT FOR GENERATE
            if (summaryData.stage !== "submitted") {
                return fail("generateSummaryFailure", summaryData.error, generateTelemetryProps);
            }
        } catch (error) {
            return fail("generateSummaryFailure", error, generateTelemetryProps);
        } finally {
            this.heuristics.recordAttempt(summaryData?.referenceSequenceNumber);
            this.summarizeTimer.clear();
        }

        try {
            const pendingTimeoutP = this.pendingAckTimer.start().catch(() => undefined);
            const summary = this.summaryWatcher.watchSummary(summaryData.clientSequenceNumber);

            // Wait for broadcast
            const summarizeOp = await Promise.race([summary.waitBroadcast(), pendingTimeoutP]);
            if (!checkNotTimeout(summarizeOp)) {
                return fail("summaryOpWaitTimeout");
            }

            // ENTRY POINT FOR BROADCAST
            const broadcastDuration = Date.now() - this.heuristics.lastAttempted.summaryTime;
            resultsBuilder.broadcastSummaryOp.resolve({
                success: true,
                data: { summarizeOp, broadcastDuration },
            });
            this.heuristics.lastAttempted.summarySequenceNumber = summarizeOp.sequenceNumber;
            this.logger.sendTelemetryEvent({
                eventName: "SummaryOp",
                timeWaiting: broadcastDuration,
                refSequenceNumber: summarizeOp.referenceSequenceNumber,
                summarySequenceNumber: summarizeOp.sequenceNumber,
                handle: summarizeOp.contents.handle,
            });
            // EXIT POINT FOR BROADCAST

            // Wait for ack/nack
            const ackNack = await Promise.race([summary.waitAckNack(), pendingTimeoutP]);
            if (!checkNotTimeout(ackNack)) {
                return fail("summaryAckWaitTimeout");
            }
            this.pendingAckTimer.clear();

            // Update for success/failure
            const ackNackDuration = Date.now() - this.heuristics.lastAttempted.summaryTime;
            const telemetryProps: Record<string, number> = {
                timeWaiting: ackNackDuration,
                sequenceNumber: ackNack.sequenceNumber,
                summarySequenceNumber: ackNack.contents.summaryProposal.summarySequenceNumber,
            };
            if (ackNack.type === MessageType.SummaryAck) {
                this.heuristics.ackLastSent();
                summarizeEvent.end({ ...telemetryProps, handle: ackNack.contents.handle, message: "summaryAck" });
                resultsBuilder.summaryAckNack.resolve({ success: true, data: {
                    summaryAckOp: ackNack,
                    ackDuration: ackNackDuration,
                } });
            } else {
                resultsBuilder.summaryAckNack.resolve({
                    success: false,
                    data: { summaryNackOp: ackNack, nackDuration: ackNackDuration },
                    message: getFailMessage("summaryNack"),
                    error: undefined,
                });
                return fail(
                    "summaryNack",
                    ackNack.contents.errorMessage,
                    telemetryProps,
                );
            }
        } finally {
            this.pendingAckTimer.clear();
        }
    }

    private summarizeTimerHandler(time: number, count: number) {
        this.logger.sendPerformanceEvent({
            eventName: "SummarizeTimeout",
            timeoutTime: time,
            timeoutCount: count,
        });
        if (count < maxSummarizeTimeoutCount) {
            // Double and start a new timer
            const nextTime = time * 2;
            this.summarizeTimer.start(nextTime, () => this.summarizeTimerHandler(nextTime, count + 1));
        }
    }

    public dispose() {
        this.summarizeTimer.clear();
    }
}

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
            await this.generator.waitSummarizing();
            return;
        }
        this.stopping = true;
        const outstandingOps = this.heuristics.lastOpSeqNumber - this.heuristics.lastAcked.refSequenceNumber;
        if (outstandingOps > minOpsForLastSummary) {
            this.trySummarize("lastSummary");
            // This resolves when the current pending summary is acked or fails.
            // We wait for the result in case a safe summary is needed, and to get
            // better telemetry.
            await this.generator.waitSummarizing();
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
                const result = await this.generator.summarize(attemptReason, options).summaryAckNack;
                if (result.success && result.data) {
                    return;
                }
            }
            // If all attempts failed, close the summarizer container
            this.logger.sendErrorEvent({ eventName: "FailToSummarize" });
            this.internalsProvider.stop("failToSummarize");
        })().finally(() => {
            summarizingLock.resolve();
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
        result.summaryAckNack.finally(() => this.checkRerunHeuristics());
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
