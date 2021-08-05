/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { Deferred, IPromiseTimer, IPromiseTimerResult, Timer } from "@fluidframework/common-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IAckNackSummaryResult,
    ISummarizeOptions,
    IBroadcastSummaryResult,
    ISummarizeResults,
    ISummarizeHeuristicData,
    ISummarizerInternalsProvider,
    SubmitSummaryResult,
    SummarizeResultPart,
} from "./summarizerTypes";
import { IClientSummaryWatcher } from "./summaryCollection";

/** Helper function to wait for a promise or PromiseTimer to elapse. */
export const raceTimer = async <T>(
    promise: Promise<T>,
    timer: Promise<IPromiseTimerResult>,
): Promise<{ result: "done"; value: T } | { result: IPromiseTimerResult["timerResult"] }> => Promise.race([
    promise.then((value) => ({ result: "done", value } as const)),
    timer.then(({ timerResult: result }) => ({ result } as const)),
]);

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
    | `onDemand;${string}`
    /** Enqueue summarize attempt with specified reason. */
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
} as const;

export class SummarizeResultBuilder {
    public readonly summarySubmitted = new Deferred<SummarizeResultPart<SubmitSummaryResult>>();
    public readonly summaryOpBroadcasted = new Deferred<SummarizeResultPart<IBroadcastSummaryResult>>();
    public readonly receivedSummaryAckOrNack = new Deferred<SummarizeResultPart<IAckNackSummaryResult>>();
    public fail(message: string, error: any): void {
        const result = { success: false, message, data: undefined, error } as const;
        this.summarySubmitted.resolve(result);
        this.summaryOpBroadcasted.resolve(result);
        this.receivedSummaryAckOrNack.resolve(result);
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
 * This class generates and tracks a summary attempt.
 */
export class SummaryGenerator {
    private summarizing: Deferred<void> | undefined;
    public isSummarizing(): boolean { return this.summarizing !== undefined; }
    public async waitSummarizing(): Promise<void> { await this.summarizing?.promise; }
    private summarizeCount = 0;
    public getSummarizeCount(): number { return this.summarizeCount; }
    private readonly summarizeTimer: Timer;
    constructor(
        private readonly pendingAckTimer: IPromiseTimer,
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly internalsProvider: Pick<ISummarizerInternalsProvider, "submitSummary">,
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
    public summarize(
        reason: SummarizeReason,
        options: ISummarizeOptions,
        resultsBuilder = new SummarizeResultBuilder(),
    ): ISummarizeResults {
        ++this.summarizeCount;

        if (this.summarizing !== undefined) {
            // We do not expect this case. Log the error and let it try again anyway.
            this.logger.sendErrorEvent({ eventName: "ConcurrentSummarizeAttempt", reason });
            resultsBuilder.fail("ConcurrentSummarizeAttempt", undefined);
            return resultsBuilder.build();
        }

        // GenerateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = new Deferred<void>();

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

    private async summarizeCore(
        reason: SummarizeReason,
        options: ISummarizeOptions,
        resultsBuilder: SummarizeResultBuilder,
    ): Promise<void> {
        const { refreshLatestAck, fullTree } = options;
        const summarizeEvent = PerformanceEvent.start(this.logger, {
            eventName: "Summarize",
            reason,
            refreshLatestAck,
            fullTree,
            timeSinceLastAttempt: Date.now() - this.heuristicData.lastAttempt.summaryTime,
            timeSinceLastSummary: Date.now() - this.heuristicData.lastSuccessfulSummary.summaryTime,
        });
        // Helper functions to report failures and return.
        const getFailMessage =
            (message: keyof typeof summarizeErrors): string => `${message}: ${summarizeErrors[message]}`;
        const fail = (
            message: keyof typeof summarizeErrors,
            error?: any,
            properties?: ITelemetryProperties,
        ): void => {
            this.raiseSummarizingError(summarizeErrors[message]);
            summarizeEvent.cancel({ ...properties, message }, error);
            resultsBuilder.fail(getFailMessage(message), error);
        };

        // Wait to generate and send summary
        this.summarizeTimer.start();
        // Use record type to prevent unexpected value types
        let summaryData: SubmitSummaryResult | undefined;
        let generateTelemetryProps: Record<string, string | number | boolean | undefined> = {};
        try {
            summaryData = await this.internalsProvider.submitSummary({
                fullTree,
                refreshLatestAck,
                summaryLogger: this.logger,
            });

            resultsBuilder.summarySubmitted.resolve({ success: true, data: summaryData });

            // Cumulatively add telemetry properties based on how far generateSummary went.
            const { referenceSequenceNumber: refSequenceNumber } = summaryData;
            generateTelemetryProps = {
                refSequenceNumber,
                opsSinceLastAttempt: refSequenceNumber - this.heuristicData.lastAttempt.refSequenceNumber,
                opsSinceLastSummary: refSequenceNumber - this.heuristicData.lastSuccessfulSummary.refSequenceNumber,
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
                return fail("submitSummaryFailure", summaryData.error, generateTelemetryProps);
            }
        } catch (error) {
            return fail("submitSummaryFailure", error, generateTelemetryProps);
        } finally {
            this.heuristicData.recordAttempt(summaryData?.referenceSequenceNumber);
            this.summarizeTimer.clear();
        }

        try {
            const pendingTimeoutP = this.pendingAckTimer.start();
            const summary = this.summaryWatcher.watchSummary(summaryData.clientSequenceNumber);

            // Wait for broadcast
            const waitBroadcastResult = await raceTimer(summary.waitBroadcast(), pendingTimeoutP);
            if (waitBroadcastResult.result !== "done") {
                return fail("summaryOpWaitTimeout");
            }
            const summarizeOp = waitBroadcastResult.value;

            const broadcastDuration = Date.now() - this.heuristicData.lastAttempt.summaryTime;
            resultsBuilder.summaryOpBroadcasted.resolve({
                success: true,
                data: { summarizeOp, broadcastDuration },
            });
            this.heuristicData.lastAttempt.summarySequenceNumber = summarizeOp.sequenceNumber;
            this.logger.sendTelemetryEvent({
                eventName: "SummaryOp",
                timeWaiting: broadcastDuration,
                refSequenceNumber: summarizeOp.referenceSequenceNumber,
                summarySequenceNumber: summarizeOp.sequenceNumber,
                handle: summarizeOp.contents.handle,
            });

            // Wait for ack/nack
            const waitAckNackResult = await raceTimer(summary.waitAckNack(), pendingTimeoutP);
            if (waitAckNackResult.result !== "done") {
                return fail("summaryAckWaitTimeout");
            }
            const ackNackOp = waitAckNackResult.value;
            this.pendingAckTimer.clear();

            // Update for success/failure
            const ackNackDuration = Date.now() - this.heuristicData.lastAttempt.summaryTime;
            const telemetryProps: Record<string, number> = {
                timeWaiting: ackNackDuration,
                sequenceNumber: ackNackOp.sequenceNumber,
                summarySequenceNumber: ackNackOp.contents.summaryProposal.summarySequenceNumber,
            };
            if (ackNackOp.type === MessageType.SummaryAck) {
                this.heuristicData.markLastAttemptAsSuccessful();
                summarizeEvent.end({ ...telemetryProps, handle: ackNackOp.contents.handle, message: "summaryAck" });
                resultsBuilder.receivedSummaryAckOrNack.resolve({ success: true, data: {
                    summaryAckNackOp: ackNackOp,
                    ackNackDuration,
                }});
            } else {
                resultsBuilder.receivedSummaryAckOrNack.resolve({
                    success: false,
                    data: { summaryAckNackOp: ackNackOp, ackNackDuration },
                    message: getFailMessage("summaryNack"),
                    error: undefined,
                });
                return fail(
                    "summaryNack",
                    (ackNackOp.contents as { message?: string }).message ?? ackNackOp.contents.errorMessage,
                    telemetryProps,
                );
            }
        } finally {
            this.pendingAckTimer.clear();
        }
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
            this.summarizeTimer.start(nextTime, () => this.summarizeTimerHandler(nextTime, count + 1));
        }
    }

    public dispose(): void {
        this.summarizeTimer.clear();
    }
}
