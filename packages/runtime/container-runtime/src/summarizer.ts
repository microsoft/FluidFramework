/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { Deferred } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ILoader, LoaderHeader } from "@fluidframework/container-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { DriverErrorType, DriverHeader } from "@fluidframework/driver-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ChildLogger,
    IFluidErrorBase,
    isFluidError,
    LoggingError,
    wrapErrorAndLog,
} from "@fluidframework/telemetry-utils";
import {
    FluidObject,
    IFluidHandleContext,
    IFluidHandle,
    IRequest,
} from "@fluidframework/core-interfaces";
import { ISummaryConfiguration } from "./containerRuntime";
import { ICancellableSummarizerController } from "./runWhileConnectedCoordinator";
import { summarizerClientType } from "./summarizerClientElection";
import { IAckedSummary, SummaryCollection } from "./summaryCollection";
import { SummarizerHandle } from "./summarizerHandle";
import { RunningSummarizer } from "./runningSummarizer";
import {
    ISummarizer,
    ISummarizerInternalsProvider,
    ISummarizerRuntime,
    ISummarizingWarning,
    SummarizerStopReason,
} from "./summarizerTypes";
import { SummarizeHeuristicData } from "./summarizerHeuristics";
import { SummarizeResultBuilder } from "./summaryGenerator";
import { IConnectableRuntime } from ".";

const summarizingError = "summarizingError";

export class SummarizingWarning extends LoggingError implements ISummarizingWarning, IFluidErrorBase {
    readonly errorType = summarizingError;
    readonly canRetry = true;

    constructor(
        errorMessage: string,
        readonly logged: boolean = false,
    ) {
        super(errorMessage);
    }

    static wrap(error: any, logged: boolean = false, logger: ITelemetryLogger) {
        const newErrorFn = (errMsg: string) => new SummarizingWarning(errMsg, logged);
        return wrapErrorAndLog<SummarizingWarning>(error, newErrorFn, logger);
    }
}

export const createSummarizingWarning =
    (errorMessage: string, logged: boolean) => new SummarizingWarning(errorMessage, logged);

/**
 * Summarizer is responsible for coordinating when to generate and send summaries.
 * It is the main entry point for summary work.
 * It is created only by summarizing container (i.e. one with clientType === "summarizer")
 */
export class Summarizer extends EventEmitter implements ISummarizer {
    public get IFluidLoadable() { return this; }
    public get ISummarizer() { return this; }

    private readonly logger: ITelemetryLogger;
    private runningSummarizer?: RunningSummarizer;
    private _disposed: boolean = false;
    private starting: boolean = false;

    private readonly innerHandle: IFluidHandle<this>;

    public get handle(): IFluidHandle<this> { return this.innerHandle; }
    private readonly stopDeferred = new Deferred<SummarizerStopReason>();

    constructor(
        url: string,
        /** Reference to runtime that created this object.
         * i.e. runtime with clientType === "summarizer"
         */
        private readonly runtime: ISummarizerRuntime,
        private readonly configurationGetter: () => ISummaryConfiguration,
        /** Represents an object that can generate summary.
         * In practical terms, it's same runtime (this.runtime) with clientType === "summarizer".
        */
        private readonly internalsProvider: ISummarizerInternalsProvider,
        handleContext: IFluidHandleContext,
        public readonly summaryCollection: SummaryCollection,
        private readonly runCoordinatorCreateFn:
            (runtime: IConnectableRuntime) => Promise<ICancellableSummarizerController>,
    ) {
        super();
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");
        this.innerHandle = new SummarizerHandle(this, url, handleContext);
    }

    /**
     * Creates a Summarizer and its underlying client.
     * Note that different implementations of ILoader will handle the URL differently.
     * ILoader provided by a ContainerRuntime is a RelativeLoader, which will treat URL's
     * starting with "/" as relative to the Container. The general ILoader
     * interface will expect an absolute URL and will not handle "/".
     * @param loader - the loader that resolves the request
     * @param url - the URL used to resolve the container
     */
    public static async create(
        loader: ILoader,
        url: string): Promise<ISummarizer> {
        const request: IRequest = {
            headers: {
                [LoaderHeader.cache]: false,
                [LoaderHeader.clientDetails]: {
                    capabilities: { interactive: false },
                    type: summarizerClientType,
                },
                [DriverHeader.summarizingClient]: true,
                [LoaderHeader.reconnect]: false,
            },
            url,
        };

        const resolvedContainer = await loader.resolve(request);
        const fluidObject =
            await requestFluidObject<FluidObject<ISummarizer>>(resolvedContainer, { url: "_summarizer" });
        if (fluidObject.ISummarizer === undefined) {
            throw new UsageError("Fluid object does not implement ISummarizer");
        }
        return fluidObject.ISummarizer;
    }

    public async run(onBehalfOf: string): Promise<SummarizerStopReason> {
        try {
            return await this.runCore(onBehalfOf);
        } catch (error) {
            this.stop("summarizerException");
            throw SummarizingWarning.wrap(error, false /* logged */, this.logger);
        } finally {
            this.close();
        }
    }

    /**
     * Stops the summarizer from running.  This will complete
     * the run promise, and also close the container.
     * @param reason - reason code for stopping
     */
    public stop(reason: SummarizerStopReason) {
        this.stopDeferred.resolve(reason);
    }

    public close() {
        // This will result in "summarizerClientDisconnected" stop reason recorded in telemetry,
        // unless stop() was called earlier
        this.dispose();
        this.runtime.closeFn();
    }

    private async runCore(onBehalfOf: string): Promise<SummarizerStopReason> {
        const runCoordinator: ICancellableSummarizerController = await this.runCoordinatorCreateFn(this.runtime);

        // Wait for either external signal to cancel, or loss of connectivity.
        const stopP = Promise.race([runCoordinator.waitCancelled, this.stopDeferred.promise]);
        void stopP.then((reason) => {
            this.logger.sendTelemetryEvent({
                eventName: "StoppingSummarizer",
                onBehalfOf,
                reason,
            });
        });

        if (runCoordinator.cancelled) {
            return runCoordinator.waitCancelled;
        }

        const runningSummarizer = await this.start(onBehalfOf, runCoordinator);

        // Wait for either external signal to cancel, or loss of connectivity.
        const stopReason = await stopP;

        // There are two possible approaches here:
        // 1. Propagate cancellation from this.stopDeferred to runCoordinator. This will ensure that we move to the exit
        //    faster, including breaking out of the RunningSummarizer.trySummarize() faster.
        //    We could create new coordinator and pass it to waitStop() -> trySummarizeOnce("lastSummary") flow.
        //    The con of this approach is that we might cancel active summary, and lastSummary will fail because it
        //    did not wait for ack/nack from previous summary. Plus we disregard any 429 kind of info from service
        //    that way (i.e. trySummarize() loop might have been waiting for 5 min because storage told us so).
        //    In general, it's more wasted resources.
        // 2. We can not do it and make waitStop() do last summary only if there was no active summary. This ensures
        //    that client behaves properly (from server POV) and we do not waste resources. But, it may mean we wait
        //    substantially longer for trySummarize() retries to play out and thus this summary loop may run into
        //    conflict with new summarizer client starting on different client.
        // As of now, #2 is implemented. It's more forward looking, as issue #7279 suggests changing design for new
        // summarizer client to not be created until current summarizer fully moves to exit, and that would reduce
        // cons of #2 substantially.

        // Cleanup after running
        await runningSummarizer.waitStop(
            !runCoordinator.cancelled && Summarizer.stopReasonCanRunLastSummary(stopReason));

        // Propagate reason and ensure that if someone is waiting for cancellation token, they are moving to exit
        runCoordinator.stop(stopReason);

        return stopReason;
    }

    /**
     * Should we try to run a last summary for the given stop reason?
     * Currently only allows "parentNotConnected"
     * @param stopReason - SummarizerStopReason
     * @returns - true if the stop reason can run a last summary
     */
    public static stopReasonCanRunLastSummary(stopReason: SummarizerStopReason): boolean {
        return stopReason === "parentNotConnected";
    }

    /**
     * Put the summarizer in a started state, including creating and initializing the RunningSummarizer.
     * The start request can come either from the SummaryManager (in the auto-summarize case) or from the user
     * (in the on-demand case).
     * @param onBehalfOf - ID of the client that requested that the summarizer start
     * @param runCoordinator - cancellation token
     * @param newConfig - Summary configuration to override the existing config when invoking the RunningSummarizer.
     * @returns - Promise that is fulfilled when the RunningSummarizer is ready
     */
    private async start(
        onBehalfOf: string,
        runCoordinator: ICancellableSummarizerController): Promise<RunningSummarizer> {
        if (this.runningSummarizer) {
            if (this.runningSummarizer.disposed) {
                throw new UsageError("Starting a disposed summarizer");
            }
            return this.runningSummarizer;
        }
        if (this.starting) {
            throw new UsageError("Attempting to start a summarizer that is already starting");
        }
        this.starting = true;
        // Initialize values and first ack (time is not exact)
        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.runtime.deltaManager.initialSequenceNumber,
            config: JSON.stringify(this.configurationGetter()),
        });

        // Summarizing container ID (with clientType === "summarizer")
        const clientId = this.runtime.clientId;
        if (clientId === undefined) {
            throw new UsageError("clientId should be defined if connected.");
        }

        const runningSummarizer = await RunningSummarizer.start(
            this.logger,
            this.summaryCollection.createWatcher(clientId),
            this.configurationGetter(),
            async (...args) => this.internalsProvider.submitSummary(...args), // submitSummaryCallback
            new SummarizeHeuristicData(
                this.runtime.deltaManager.lastSequenceNumber,
                { /** summary attempt baseline for heuristics */
                    refSequenceNumber: this.runtime.deltaManager.initialSequenceNumber,
                    summaryTime: Date.now(),
                } as const,
            ),
            (errorMessage: string) => {
                if (!this._disposed) {
                    this.logger.sendErrorEvent({ eventName: "summarizingError" },
                        createSummarizingWarning(errorMessage, true));
                }
            },
            this.summaryCollection,
            runCoordinator /* cancellationToken */,
            (reason) => runCoordinator.stop(reason), /* stopSummarizerCallback */
            this.runtime,
        );
        this.runningSummarizer = runningSummarizer;
        this.starting = false;

        // Handle summary acks
        // Note: no exceptions are thrown from handleSummaryAcks handler as it handles all exceptions
        this.handleSummaryAcks().catch((error) => {
            this.logger.sendErrorEvent({ eventName: "HandleSummaryAckFatalError" }, error);
        });

        return runningSummarizer;
    }

    /**
     * Disposes of resources after running.  This cleanup will
     * clear any outstanding timers and reset some of the state
     * properties.
     * Called by ContainerRuntime when it is disposed, as well as at the end the run().
     */
    public dispose() {
        // Given that the call can come from own ContainerRuntime, ensure that we stop all the processes.
        this.stop("summarizerClientDisconnected");

        this._disposed = true;
        if (this.runningSummarizer) {
            this.runningSummarizer.dispose();
            this.runningSummarizer = undefined;
        }
    }

    public readonly summarizeOnDemand: ISummarizer["summarizeOnDemand"] = (...args) => {
        try {
            if (this._disposed || this.runningSummarizer?.disposed) {
                throw new UsageError("Summarizer is already disposed.");
            }
            if (this.runtime.summarizerClientId !== undefined &&
                this.runtime.summarizerClientId !== this.runtime.clientId) {
                // If there is an elected summarizer, and it's not this one, don't allow on-demand summary.
                // This is to prevent the on-demand summary and heuristic-based summary from stepping on
                // each other.
                throw new UsageError("On-demand summary attempted while an elected summarizer is present");
            }
            const builder = new SummarizeResultBuilder();
            if (this.runningSummarizer) {
                // Summarizer is already running. Go ahead and start.
                return this.runningSummarizer.summarizeOnDemand(builder, ...args);
            }

            // Summarizer isn't running, so we need to start it, which is an async operation.
            // Manage the promise related to creating the cancellation token here.
            // The promises related to starting, summarizing,
            // and submitting are communicated to the caller through the results builder.
            const coordinatorCreateP = this.runCoordinatorCreateFn(this.runtime);

            coordinatorCreateP.then((runCoordinator) => {
                // Successully created the cancellation token. Start the summarizer.
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const startP = this.start(this.runtime.clientId!, runCoordinator);
                startP.then(async (runningSummarizer) => {
                    // Successfully started the summarizer. Run it.
                    runningSummarizer.summarizeOnDemand(builder, ...args);
                    // Wait for a command to stop or loss of connectivity before tearing down the summarizer and client.
                    const stopReason = await Promise.race([this.stopDeferred.promise, runCoordinator.waitCancelled]);
                    await runningSummarizer.waitStop(false);
                    runCoordinator.stop(stopReason);
                    this.close();
                }).catch((reason) => {
                    builder.fail("Failed to start summarizer", reason);
                });
            }).catch((reason) => {
                builder.fail("Failed to create cancellation token", reason);
            });

            return builder.build();
        } catch (error) {
            throw SummarizingWarning.wrap(error, false /* logged */, this.logger);
        }
    };

    public readonly enqueueSummarize: ISummarizer["enqueueSummarize"] = (...args) => {
        if (this._disposed || this.runningSummarizer === undefined || this.runningSummarizer.disposed) {
            throw new UsageError("Summarizer is not running or already disposed.");
        }
        return this.runningSummarizer.enqueueSummarize(...args);
    };

    private async handleSummaryAcks() {
        let refSequenceNumber = this.runtime.deltaManager.initialSequenceNumber;
        let ack: IAckedSummary | undefined;
        while (this.runningSummarizer) {
            const summaryLogger = this.runningSummarizer.tryGetCorrelatedLogger(refSequenceNumber) ?? this.logger;
            try {
                // Initialize ack with undefined if exception happens inside of waitSummaryAck on second iteration,
                // we record undefined, not previous handles.
                ack = undefined;
                ack = await this.summaryCollection.waitSummaryAck(refSequenceNumber);
                refSequenceNumber = ack.summaryOp.referenceSequenceNumber;
                const summaryOpHandle = ack.summaryOp.contents.handle;
                const summaryAckHandle = ack.summaryAck.contents.handle;
                // Make sure we block any summarizer from being executed/enqueued while
                // executing the refreshLatestSummaryAck.
                // https://dev.azure.com/fluidframework/internal/_workitems/edit/779
                await this.runningSummarizer.lockedRefreshSummaryAckAction(async () =>
                    this.internalsProvider.refreshLatestSummaryAck({
                        proposalHandle: summaryOpHandle,
                        ackHandle: summaryAckHandle,
                        summaryRefSeq: refSequenceNumber,
                        summaryLogger },
                    ).catch(async (error) => {
                        // If the error is 404, so maybe the fetched version no longer exists on server. We just
                        // ignore this error in that case, as that means we will have another summaryAck for the
                        // latest version with which we will refresh the state. However in case of single commit
                        // summary, we might me missing a summary ack, so in that case we are still fine as the
                        // code in `submitSummary` function in container runtime, will refresh the latest state
                        // by calling `refreshLatestSummaryAckFromServer` and we will be fine.
                        if (isFluidError(error)
                            && error.errorType === DriverErrorType.fileNotFoundOrAccessDeniedError) {
                            summaryLogger.sendTelemetryEvent({
                                eventName: "HandleSummaryAckErrorIgnored",
                                referenceSequenceNumber: refSequenceNumber,
                                proposalHandle: summaryOpHandle,
                                ackHandle: summaryAckHandle,
                            }, error);
                        } else {
                            throw error;
                        }
                    }),
                );
            } catch (error) {
                summaryLogger.sendErrorEvent({
                    eventName: "HandleSummaryAckError",
                    referenceSequenceNumber: refSequenceNumber,
                    handle: ack?.summaryOp?.contents?.handle,
                    ackHandle: ack?.summaryAck?.contents?.handle,
                }, error);
            }
            refSequenceNumber++;
        }
    }
}
