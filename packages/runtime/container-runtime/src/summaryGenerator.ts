/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryProperties } from "@fluidframework/common-definitions";
import { assert, Deferred, IPromiseTimer, IPromiseTimerResult, Timer } from "@fluidframework/common-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import { PerformanceEvent, LoggingError, ChildLogger } from "@fluidframework/telemetry-utils";
import { getRetryDelaySecondsFromError } from "@fluidframework/driver-utils";
import {
    IAckNackSummaryResult,
    ISummarizeOptions,
    IBroadcastSummaryResult,
    ISummarizeResults,
    ISummarizeHeuristicData,
    ISubmitSummaryOptions,
    SubmitSummaryResult,
    SummarizeResultPart,
    ISummaryCancellationToken,
} from "./summarizerTypes";
import { IClientSummaryWatcher } from "./summaryCollection";

export type raceTimerResult<T> =
    { result: "done"; value: T } |
    { result: IPromiseTimerResult["timerResult"] } |
    { result: "cancelled" };

/** Helper function to wait for a promise or PromiseTimer to elapse. */
export async function raceTimer<T>(
    promise: Promise<T>,
    timer: Promise<IPromiseTimerResult>,
    cancellationToken?: ISummaryCancellationToken,
): Promise<raceTimerResult<T>> {
    const promises: Promise<raceTimerResult<T>>[] = [
        promise.then((value) => ({ result: "done", value } as const)),
        timer.then(({ timerResult: result }) => ({ result } as const)),
    ];
    if (cancellationToken !== undefined) {
        promises.push(cancellationToken.waitCancelled.then(() => ({ result: "cancelled" } as const)));
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

    disconnect: "Summary cancelled due to summarizer or main client disconnect",
} as const;

export class SummarizeResultBuilder {
    public readonly summarySubmitted = new Deferred<SummarizeResultPart<SubmitSummaryResult>>();
    public readonly summaryOpBroadcasted = new Deferred<SummarizeResultPart<IBroadcastSummaryResult>>();
    public readonly receivedSummaryAckOrNack = new Deferred<SummarizeResultPart<IAckNackSummaryResult>>();

    public fail(message: string, error: any, nackSummaryResult?: IAckNackSummaryResult, retryAfterSeconds?: number) {
        assert(!this.receivedSummaryAckOrNack.isCompleted,
            "no reason to call fail if all promises have been completed");

        const result: SummarizeResultPart<undefined> =
            { success: false, message, data: undefined, error, retryAfterSeconds } as const;
        this.summarySubmitted.resolve(result);
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
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
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
        summarizeProps: ITelemetryProperties,
        options: ISummarizeOptions,
        cancellationToken: ISummaryCancellationToken,
        resultsBuilder = new SummarizeResultBuilder(),
    ): ISummarizeResults {
        ++this.summarizeCount;

        if (this.summarizing !== undefined) {
            // We do not expect this case. Log the error and let it try again anyway.
            this.logger.sendErrorEvent({ eventName: "ConcurrentSummarizeAttempt", ...summarizeProps });
            resultsBuilder.fail("ConcurrentSummarizeAttempt", undefined);
            return resultsBuilder.build();
        }

        // GenerateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = new Deferred<void>();

        this.summarizeCore(summarizeProps, options, resultsBuilder, cancellationToken).finally(() => {
            this.summarizing?.resolve();
            this.summarizing = undefined;
        }).catch((error) => {
            const message = "UnexpectedSummarizeError";
            this.logger.sendErrorEvent({ eventName: message, ...summarizeProps }, error);
            resultsBuilder.fail(message, error);
        });

        return resultsBuilder.build();
    }

    private async summarizeCore(
        summarizeProps: ITelemetryProperties,
        options: ISummarizeOptions,
        resultsBuilder: SummarizeResultBuilder,
        cancellationToken: ISummaryCancellationToken,
    ): Promise<void> {
        const { refreshLatestAck, fullTree } = options;
        const logger = ChildLogger.create(this.logger, undefined, { all: summarizeProps });
        const summarizeEvent = PerformanceEvent.start(logger, {
            eventName: "Summarize",
            refreshLatestAck,
            fullTree,
            timeSinceLastAttempt: Date.now() - this.heuristicData.lastAttempt.summaryTime,
            timeSinceLastSummary: Date.now() - this.heuristicData.lastSuccessfulSummary.summaryTime,
        });
        // Helper functions to report failures and return.
        const getFailMessage = (message: keyof typeof summarizeErrors) => `${message}: ${summarizeErrors[message]}`;
        const fail = (
            errorReason: keyof typeof summarizeErrors,
            error?: any,
            properties?: ITelemetryProperties,
            nackSummaryResult?: IAckNackSummaryResult,
        ) => {
            this.raiseSummarizingError(summarizeErrors[errorReason]);
            // UploadSummary may fail with 429 and retryAfter - respect that
            // Summary Nack also can have retryAfter, it's parsed below and comes as a property.
            const retryAfterSeconds = getRetryDelaySecondsFromError(error);

            // Report any failure as an error unless it was due to cancellation (like "disconnected" error)
            summarizeEvent.cancel({
                 ...properties,
                 reason: errorReason,
                 category: cancellationToken.cancelled ? "generic" : "error",
            }, error);
            resultsBuilder.fail(getFailMessage(errorReason), error, nackSummaryResult, retryAfterSeconds);
        };

        // Wait to generate and send summary
        this.summarizeTimer.start();
        // Use record type to prevent unexpected value types
        let summaryData: SubmitSummaryResult | undefined;
        try {
            summaryData = await this.submitSummaryCallback({
                fullTree,
                refreshLatestAck,
                summaryLogger: logger,
                cancellationToken,
            });

            // Cumulatively add telemetry properties based on how far generateSummary went.
            const { referenceSequenceNumber: refSequenceNumber } = summaryData;
            let generateTelemetryProps: Record<string, string | number | boolean | undefined> = {};
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

            logger.sendTelemetryEvent({ eventName: "GenerateSummary", ...generateTelemetryProps });
            if (summaryData.stage !== "submit") {
                return fail("submitSummaryFailure", summaryData.error, generateTelemetryProps);
            }

            resultsBuilder.summarySubmitted.resolve({ success: true, data: summaryData });
        } catch (error) {
            return fail("submitSummaryFailure", error);
        } finally {
            this.heuristicData.recordAttempt(summaryData?.referenceSequenceNumber);
            this.summarizeTimer.clear();
        }

        try {
            const pendingTimeoutP = this.pendingAckTimer.start();
            const summary = this.summaryWatcher.watchSummary(summaryData.clientSequenceNumber);

            // Wait for broadcast
            const waitBroadcastResult = await raceTimer(summary.waitBroadcast(), pendingTimeoutP, cancellationToken);
            if (waitBroadcastResult.result === "cancelled") {
                return fail("disconnect");
            }
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
            logger.sendTelemetryEvent({
                eventName: "SummaryOp",
                timeWaiting: broadcastDuration,
                refSequenceNumber: summarizeOp.referenceSequenceNumber,
                summarySequenceNumber: summarizeOp.sequenceNumber,
                handle: summarizeOp.contents.handle,
            });

            // Wait for ack/nack
            const waitAckNackResult = await raceTimer(summary.waitAckNack(), pendingTimeoutP, cancellationToken);
            if (waitAckNackResult.result === "cancelled") {
                return fail("disconnect");
            }
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
                // Check for retryDelay in summaryNack response.
                // back-compat: cast needed until dep on protocol-definitions version bump
                const summaryNack = ackNackOp.type === MessageType.SummaryNack
                    ? ackNackOp.contents as { message?: string; retryAfter?: number; }
                    : undefined;
                const message = (ackNackOp.contents as { message?: string }).message ?? ackNackOp.contents.errorMessage;
                const retryAfterSeconds = summaryNack?.retryAfter;

                const error = new LoggingError(`summaryNack: ${message}`, { retryAfterSeconds });
                assert(getRetryDelaySecondsFromError(error) === retryAfterSeconds, "retryAfterSeconds");
                // This will only set resultsBuilder.receivedSummaryAckOrNack, as other promises are already set.
                return fail(
                    "summaryNack",
                    error,
                    { ...telemetryProps, nackRetryAfter: retryAfterSeconds },
                    { summaryAckNackOp: ackNackOp, ackNackDuration },
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
