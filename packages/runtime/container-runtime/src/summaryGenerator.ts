/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { Deferred, IPromiseTimer, IPromiseTimerResult, Timer } from "@fluidframework/common-utils";
import { ISummaryConfiguration, ISummaryNack, MessageType } from "@fluidframework/protocol-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    GenerateSummaryResult,
    IGenerateSummaryOptions,
    ISummarizerInternalsProvider,
} from "./summarizerTypes";
import { IClientSummaryWatcher } from "./summaryCollection";

export const checkNotTimeout = <T>(something: T | IPromiseTimerResult | undefined): something is T => {
    if (something === undefined) {
        return false;
    }
    return (something as IPromiseTimerResult).timerResult === undefined;
};

// Send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // Double and resend 5 times

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
 * This class contains the heuristics for when to summarize.
 */
 export class SummarizerHeuristics {
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
        const timeSinceLastSummary = Date.now() - this.lastAcked.summaryTime;
        const opCountSinceLastSummary = this.lastOpSeqNumber - this.lastAcked.refSequenceNumber;
        if (timeSinceLastSummary > this.configuration.maxTime) {
            this.idleTimer.clear();
            this.trySummarize("maxTime");
        } else if (opCountSinceLastSummary > this.configuration.maxOps) {
            this.idleTimer.clear();
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
export class SummaryGenerator {
    private summarizing: Deferred<void> | undefined;
    public isSummarizing() { return this.summarizing !== undefined; }
    public async waitSummarizing() { await this.summarizing?.promise; }
    private summarizeCount = 0;
    public getSummarizeCount() { return this.summarizeCount; }
    private readonly summarizeTimer: Timer;
    constructor(
        private readonly pendingAckTimer: IPromiseTimer,
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

    /**
     * Generates summary and listens for broadcast and ack/nack.
     * Returns true for ack, false for nack, and undefined for failure or timeout.
     * @param reason - reason for summarizing
     * @param options - refreshLatestAck to fetch summary ack info from server,
     * fullTree to generate tree without any summary handles even if unchanged
     */
    public async summarize(
        reason: SummarizeReason,
        options: Omit<IGenerateSummaryOptions, "summaryLogger">,
    ): Promise<{ success: true; } | { success: false; retryDelaySeconds?: number ;}> {
        ++this.summarizeCount;
        if (this.summarizing !== undefined) {
            // We do not expect this case. Log the error and let it try again anyway.
            this.logger.sendErrorEvent({ eventName: "ConcurrentSummarizeAttempt", reason });
            return { success: false };
        }

        // GenerateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = new Deferred<void>();

        try {
            return this.summarizeCore(reason, options);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "UnexpectedSummarizeError" }, error);
            return { success: false };
        } finally {
            this.summarizing?.resolve();
            this.summarizing = undefined;
        }
    }

    private async summarizeCore(
        reason: SummarizeReason,
        options: Omit<IGenerateSummaryOptions, "summaryLogger">,
    ): Promise<{ success: true; } | { success: false; retryDelaySeconds?: number ;}> {
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
        const fail = (
            message: keyof typeof summarizeErrors,
            error?: any,
            properties?: ITelemetryProperties,
            retryDelaySeconds?: number,
        ) => {
            this.raiseSummarizingError(summarizeErrors[message]);
            summarizeEvent.cancel({ ...properties, message }, error);
            return { success: false, retryDelaySeconds };
        };

        // Wait to generate and send summary
        this.summarizeTimer.start();
        // Use record type to prevent unexpected value types
        let summaryData: GenerateSummaryResult | undefined;
        let generateTelemetryProps: Record<string, string | number | boolean | undefined> = {};
        try {
            summaryData = await this.internalsProvider.generateSummary({
                fullTree,
                refreshLatestAck,
                summaryLogger: this.logger,
            });

            // Cumulatively add telemetry properties based on how far generateSummary went.
            const { referenceSequenceNumber: refSequenceNumber } = summaryData;
            generateTelemetryProps = {
                refSequenceNumber,
                opsSinceLastAttempt: refSequenceNumber - this.heuristics.lastAttempted.refSequenceNumber,
                opsSinceLastSummary: refSequenceNumber - this.heuristics.lastAcked.refSequenceNumber,
            };
            if (summaryData.stage !== "base") {
                generateTelemetryProps = {
                    ...generateTelemetryProps,
                    ...summaryData.summaryStats,
                    generateDuration: summaryData.generateDuration,
                };

                if (summaryData.stage !== "generate") {
                    generateTelemetryProps = {
                        ...generateTelemetryProps,
                        handle: summaryData.handle,
                        uploadDuration: summaryData.uploadDuration,
                    };

                    if (summaryData.stage !== "upload") {
                        generateTelemetryProps = {
                            ...generateTelemetryProps,
                            clientSequenceNumber: summaryData.clientSequenceNumber,
                            submitOpDuration: summaryData.submitOpDuration,
                        };
                    }
                }
            }

            this.logger.sendTelemetryEvent({ eventName: "GenerateSummary", ...generateTelemetryProps });
            if (summaryData.stage !== "submit") {
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

            const broadcastDuration = Date.now() - this.heuristics.lastAttempted.summaryTime;
            this.heuristics.lastAttempted.summarySequenceNumber = summarizeOp.sequenceNumber;
            this.logger.sendTelemetryEvent({
                eventName: "SummaryOp",
                timeWaiting: broadcastDuration,
                refSequenceNumber: summarizeOp.referenceSequenceNumber,
                summarySequenceNumber: summarizeOp.sequenceNumber,
                handle: summarizeOp.contents.handle,
            });

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
                return { success: true };
            } else {
                // TODO: cast needed until dep on protocol-definitions version bump
                const summaryNack = ackNack.contents as ISummaryNack & Partial<{
                    message: string;
                    retryAfter: number;
                }>;
                return fail(
                    "summaryNack",
                    summaryNack.message ?? ackNack.contents.errorMessage,
                    telemetryProps,
                    summaryNack.retryAfter,
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
