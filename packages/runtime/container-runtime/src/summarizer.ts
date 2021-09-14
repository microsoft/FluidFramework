/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { Deferred } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger, IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils";
import {
    IRequest,
    IResponse,
    IFluidHandleContext,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { wrapErrorAndLog } from "@fluidframework/container-utils";
import {
    ISequencedDocumentMessage,
    ISummaryConfiguration,
} from "@fluidframework/protocol-definitions";
import { create404Response } from "@fluidframework/runtime-utils";
import { RunWhileConnectedCoordinator } from "./runWhileConnectedCoordinator";
import { SummaryCollection } from "./summaryCollection";
import { SummarizerHandle } from "./summarizerHandle";
import { RunningSummarizer } from "./runningSummarizer";
import {
    ISummarizer,
    ISummarizerInternalsProvider,
    ISummarizerOptions,
    ISummarizerRuntime,
    ISummarizingWarning,
    SummarizerStopReason,
} from "./summarizerTypes";
import { SummarizeHeuristicData } from "./summarizerHeuristics";

const summarizingError = "summarizingError";

export class SummarizingWarning extends LoggingError implements ISummarizingWarning, IFluidErrorBase {
    readonly errorType = summarizingError;
    readonly canRetry = true;

    constructor(
        errorMessage: string,
        readonly fluidErrorCode: string,
        readonly logged: boolean = false,
    ) {
        super(errorMessage);
    }

    static wrap(error: any, errorCode: string, logged: boolean = false, logger: ITelemetryLogger) {
        const newErrorFn = (errMsg: string) => new SummarizingWarning(errMsg, errorCode, logged);
        return wrapErrorAndLog<SummarizingWarning>(error, newErrorFn, logger);
    }
}

export const createSummarizingWarning =
    (errorCode: string, logged: boolean) => new SummarizingWarning(errorCode, errorCode, logged);

/**
 * Summarizer is responsible for coordinating when to generate and send summaries.
 * It is the main entry point for summary work.
 * It is created only by summarizing container (i.e. one with clientType === "summarizer")
 */
export class Summarizer extends EventEmitter implements ISummarizer {
    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }
    public get ISummarizer() { return this; }

    private readonly logger: ITelemetryLogger;
    private runningSummarizer?: RunningSummarizer;
    private systemOpListener?: (op: ISequencedDocumentMessage) => void;
    private opListener?: (error: any, op: ISequencedDocumentMessage) => void;
    private _disposed: boolean = false;

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
    ) {
        super();
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");
        this.innerHandle = new SummarizerHandle(this, url, handleContext);
    }

    public async run(
        onBehalfOf: string,
        options?: Readonly<Partial<ISummarizerOptions>>): Promise<SummarizerStopReason>
    {
        try {
            return await this.runCore(onBehalfOf, options);
        } catch (error) {
            this.stop("summarizerException");
            throw SummarizingWarning.wrap(error, "summarizerRun", false /* logged */, this.logger);
        } finally {
            this.dispose();
            this.runtime.closeFn();
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

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url === "/" || request.url === "") {
            return {
                mimeType: "fluid/object",
                status: 200,
                value: this,
            };
        }
        return create404Response(request);
    }

    private async runCore(
        onBehalfOf: string,
        options?: Readonly<Partial<ISummarizerOptions>>): Promise<SummarizerStopReason>
    {
        // Initialize values and first ack (time is not exact)
        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.runtime.deltaManager.initialSequenceNumber,
        });

        const runCoordinator = await RunWhileConnectedCoordinator.create(this.runtime);

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

        // Summarizing container ID (with clientType === "summarizer")
        const clientId = this.runtime.clientId;
        if (clientId === undefined) {
            throw Error("clientId should be defined if connected.");
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
            (errorCode: string) => {
                if (!this._disposed) {
                    this.emit("summarizingError", createSummarizingWarning(errorCode, true));
                }
            },
            this.summaryCollection,
            runCoordinator /* cancellationToken */,
            (reason) => runCoordinator.stop(reason), /* stopSummarizerCallback */
            options,
        );
        this.runningSummarizer = runningSummarizer;

        // Handle summary acks
        // Note: no exceptions are thrown from handleSummaryAcks handler as it handles all exceptions
        this.handleSummaryAcks().catch((error) => {
            this.logger.sendErrorEvent({ eventName: "HandleSummaryAckFatalError" }, error);
        });

        // Listen for ops
        this.systemOpListener = (op: ISequencedDocumentMessage) => runningSummarizer.handleSystemOp(op);
        this.runtime.deltaManager.inbound.on("op", this.systemOpListener);

        this.opListener = (error: any, op: ISequencedDocumentMessage) => runningSummarizer.handleOp(error, op);
        this.runtime.on("batchEnd", this.opListener);

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
        await runningSummarizer.waitStop(!runCoordinator.cancelled /* allowLastSummary */);

        // Propagate reason and ensure that if someone is waiting for cancellation token, they are moving to exit
        runCoordinator.stop(stopReason);

        return stopReason;
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
        if (this.systemOpListener) {
            this.runtime.deltaManager.inbound.off("op", this.systemOpListener);
        }
        if (this.opListener) {
            this.runtime.removeListener("batchEnd", this.opListener);
        }
    }

    public readonly summarizeOnDemand: ISummarizer["summarizeOnDemand"] = (...args) => {
        if (this._disposed || this.runningSummarizer === undefined || this.runningSummarizer.disposed) {
            throw Error("Summarizer is not running or already disposed.");
        }
        return this.runningSummarizer.summarizeOnDemand(...args);
    };

    public readonly enqueueSummarize: ISummarizer["enqueueSummarize"] = (...args) => {
        if (this._disposed || this.runningSummarizer === undefined || this.runningSummarizer.disposed) {
            throw Error("Summarizer is not running or already disposed.");
        }
        return this.runningSummarizer.enqueueSummarize(...args);
    };

    private async handleSummaryAcks() {
        let refSequenceNumber = this.runtime.deltaManager.initialSequenceNumber;
        while (this.runningSummarizer) {
            const summaryLogger = this.runningSummarizer.tryGetCorrelatedLogger(refSequenceNumber) ?? this.logger;
            try {
                const ack = await this.summaryCollection.waitSummaryAck(refSequenceNumber);
                refSequenceNumber = ack.summaryOp.referenceSequenceNumber;

                await this.internalsProvider.refreshLatestSummaryAck(
                    ack.summaryOp.contents.handle,
                    ack.summaryAck.contents.handle,
                    summaryLogger,
                );
            } catch (error) {
                summaryLogger.sendErrorEvent({ eventName: "HandleSummaryAckError", refSequenceNumber }, error);
            }
            refSequenceNumber++;
        }
    }
}
