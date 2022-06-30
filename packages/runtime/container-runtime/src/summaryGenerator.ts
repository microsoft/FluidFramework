/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    assert,
    Deferred,
    IPromiseTimer,
    IPromiseTimerResult,
    Timer,
} from "@fluidframework/common-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import { PerformanceEvent, LoggingError, ChildLogger } from "@fluidframework/telemetry-utils";
import { getRetryDelaySecondsFromError } from "@fluidframework/driver-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    IAckSummaryResult,
    INackSummaryResult,
    ISummarizeOptions,
    IBroadcastSummaryResult,
    ISummarizeResults,
    ISummarizeHeuristicData,
    ISubmitSummaryOptions,
    SubmitSummaryResult,
    SummarizeResultPart,
    ISummaryCancellationToken,
    ISummarizeTelemetryProperties,
    SummaryGeneratorTelemetry,
} from "./summarizerTypes";
import { IClientSummaryWatcher } from "./summaryCollection";

export type raceTimerResult<T> =
    { result: "done"; value: T; } |
    { result: IPromiseTimerResult["timerResult"]; } |
    { result: "cancelled"; };

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
     * Special case to attempt to summarize one last time before the
     * summarizer client closes itself. This is to prevent cases where
     * the summarizer client never gets a chance to summarize, because
     * there are too many outstanding ops and/or parent client cannot
     * stay connected long enough for summarizer client to catch up.
     */
    | "lastSummary"
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
    public readonly receivedSummaryAckOrNack =
        new Deferred<SummarizeResultPart<IAckSummaryResult, INackSummaryResult>>();

    public fail(message: string, error: any, nackSummaryResult?: INackSummaryResult, retryAfterSeconds?: number) {
        assert(!this.receivedSummaryAckOrNack.isCompleted,
            0x25e /* "no reason to call fail if all promises have been completed" */);

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
    private readonly summarizeTimer: Timer;
    constructor(
        private readonly pendingAckTimer: IPromiseTimer,
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly submitSummaryCallback: (options: ISubmitSummaryOptions) => Promise<SubmitSummaryResult>,
        private readonly raiseSummarizingError: (errorMessage: string) => void,
        private readonly successfulSummaryCallback: () => void,
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
        summarizeProps: ISummarizeTelemetryProperties,
        options: ISummarizeOptions,
        cancellationToken: ISummaryCancellationToken,
        resultsBuilder = new SummarizeResultBuilder(),
    ): ISummarizeResults {
        this.summarizeCore(summarizeProps, options, resultsBuilder, cancellationToken)
        .catch((error) => {
            const message = "UnexpectedSummarizeError";
            this.logger.sendErrorEvent({ eventName: message, ...summarizeProps }, error);
            resultsBuilder.fail(message, error);
        });

        return resultsBuilder.build();
    }

    private async summarizeCore(
        summarizeProps: ISummarizeTelemetryProperties,
        options: ISummarizeOptions,
        resultsBuilder: SummarizeResultBuilder,
        cancellationToken: ISummaryCancellationToken,
    ): Promise<void> {
        const { refreshLatestAck, fullTree } = options;
        const logger = ChildLogger.create(this.logger, undefined, { all: summarizeProps });

        // Note: timeSinceLastAttempt and timeSinceLastSummary for the
        // first summary are basically the time since the summarizer was loaded.
        const timeSinceLastAttempt = Date.now() - this.heuristicData.lastAttempt.summaryTime;
        const timeSinceLastSummary = Date.now() - this.heuristicData.lastSuccessfulSummary.summaryTime;
        let summarizeTelemetryProps: SummaryGeneratorTelemetry = {
            fullTree,
            timeSinceLastAttempt,
            timeSinceLastSummary,
        };

        const summarizeEvent = PerformanceEvent.start(logger, {
            eventName: "Summarize",
            refreshLatestAck,
            ...summarizeTelemetryProps,
        });

        // Helper functions to report failures and return.
        const getFailMessage =
            (errorCode: keyof typeof summarizeErrors) => `${errorCode}: ${summarizeErrors[errorCode]}`;
        const fail = (
            errorCode: keyof typeof summarizeErrors,
            error?: any,
            properties?: SummaryGeneratorTelemetry,
            nackSummaryResult?: INackSummaryResult,
        ) => {
            this.raiseSummarizingError(summarizeErrors[errorCode]);
            // UploadSummary may fail with 429 and retryAfter - respect that
            // Summary Nack also can have retryAfter, it's parsed below and comes as a property.
            const retryAfterSeconds = getRetryDelaySecondsFromError(error);

            // Report any failure as an error unless it was due to cancellation (like "disconnected" error)
            // If failure happened on upload, we may not yet realized that socket disconnected, so check
            // offlineError too.
            const category = cancellationToken.cancelled || error?.errorType === DriverErrorType.offlineError ?
                "generic" : "error";

            summarizeEvent.cancel({
                 ...properties,
                 reason: errorCode,
                 category,
                 retryAfterSeconds,
            }, error);
            resultsBuilder.fail(getFailMessage(errorCode), error, nackSummaryResult, retryAfterSeconds);
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
            const referenceSequenceNumber = summaryData.referenceSequenceNumber;
            const opsSinceLastSummary =
                referenceSequenceNumber - this.heuristicData.lastSuccessfulSummary.refSequenceNumber;
            summarizeTelemetryProps = {
                ...summarizeTelemetryProps,
                referenceSequenceNumber,
                minimumSequenceNumber: summaryData.minimumSequenceNumber,
                opsSinceLastAttempt: referenceSequenceNumber - this.heuristicData.lastAttempt.refSequenceNumber,
                opsSinceLastSummary,
            };
            if (summaryData.stage !== "base") {
                summarizeTelemetryProps = {
                    ...summarizeTelemetryProps,
                    ...summaryData.summaryStats,
                    generateDuration: summaryData.generateDuration,
                };

                if (summaryData.stage !== "generate") {
                    summarizeTelemetryProps = {
                        ...summarizeTelemetryProps,
                        handle: summaryData.handle,
                        uploadDuration: summaryData.uploadDuration,
                    };

                    if (summaryData.stage !== "upload") {
                        summarizeTelemetryProps = {
                            ...summarizeTelemetryProps,
                            clientSequenceNumber: summaryData.clientSequenceNumber,
                        };
                    }
                }
            }

            if (summaryData.stage !== "submit") {
                return fail("submitSummaryFailure", summaryData.error, summarizeTelemetryProps);
            }

            /**
             * With incremental summaries, if the full tree was not summarized, only data stores that changed should
             * be summarized. A data store is considered changed if either or both of the following is true:
             * - It has received an op.
             * - Its reference state changed, i.e., it went from referenced to unreferenced or vice-versa.
             *
             * In the extreme case, every op can be for a different data store and each op can result in the reference
             * state change of multiple data stores. So, the total number of data stores that are summarized should not
             * exceed the number of ops since last summary + number of data store whose reference state changed.
             */
            if (!fullTree && !summaryData.forcedFullTree) {
                const { summarizedDataStoreCount, gcStateUpdatedDataStoreCount = 0 } = summaryData.summaryStats;
                if (summarizedDataStoreCount > gcStateUpdatedDataStoreCount + opsSinceLastSummary) {
                    logger.sendErrorEvent({
                        eventName: "IncrementalSummaryViolation",
                        summarizedDataStoreCount,
                        gcStateUpdatedDataStoreCount,
                        opsSinceLastSummary,
                    });
                }
            }

            // Log event here on summary success only, as Summarize_cancel duplicates failure logging.
            summarizeEvent.reportEvent("generate", { ...summarizeTelemetryProps });
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
                eventName: "Summarize_Op",
                duration: broadcastDuration,
                referenceSequenceNumber: summarizeOp.referenceSequenceNumber,
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

            // adding new properties
            summarizeTelemetryProps = {
                ackWaitDuration: ackNackDuration,
                ackNackSequenceNumber: ackNackOp.sequenceNumber,
                summarySequenceNumber: ackNackOp.contents.summaryProposal.summarySequenceNumber,
                ...summarizeTelemetryProps,
            };
            if (ackNackOp.type === MessageType.SummaryAck) {
                this.heuristicData.markLastAttemptAsSuccessful();
                this.successfulSummaryCallback();
                summarizeEvent.end({
                    ...summarizeTelemetryProps,
                    handle: ackNackOp.contents.handle,
                });
                resultsBuilder.receivedSummaryAckOrNack.resolve({ success: true, data: {
                    summaryAckOp: ackNackOp,
                    ackNackDuration,
                } });
            } else {
                // Check for retryDelay in summaryNack response.
                assert(ackNackOp.type === MessageType.SummaryNack, 0x274 /* "type check" */);
                const summaryNack = ackNackOp.contents;
                const message = summaryNack?.message;
                const retryAfterSeconds = summaryNack?.retryAfter;

                // pre-0.58 error message prefix: summaryNack
                const error = new LoggingError(`Received summaryNack: ${message}`, { retryAfterSeconds });

                assert(getRetryDelaySecondsFromError(error) === retryAfterSeconds, 0x25f /* "retryAfterSeconds" */);
                // This will only set resultsBuilder.receivedSummaryAckOrNack, as other promises are already set.
                return fail(
                    "summaryNack",
                    error,
                    { ...summarizeTelemetryProps, nackRetryAfter: retryAfterSeconds },
                    { summaryNackOp: ackNackOp, ackNackDuration },
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
