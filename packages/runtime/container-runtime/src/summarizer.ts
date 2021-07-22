/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { Deferred } from "@fluidframework/common-utils";
import { ChildLogger, LoggingError } from "@fluidframework/telemetry-utils";
import {
    IRequest,
    IResponse,
    IFluidHandleContext,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { wrapError } from "@fluidframework/container-utils";
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
    SubmitSummaryResult,
    ISubmitSummaryOptions,
    ISummarizer,
    ISummarizerInternalsProvider,
    ISummarizerRuntime,
    ISummarizingWarning,
    OnDemandSummarizeResult,
    SummarizerStopReason,
} from "./summarizerTypes";

const summarizingError = "summarizingError";

export class SummarizingWarning extends LoggingError implements ISummarizingWarning {
    readonly errorType = summarizingError;
    readonly canRetry = true;

    constructor(errorMessage: string, readonly logged: boolean = false) {
        super(errorMessage);
    }

    static wrap(error: any, logged: boolean = false) {
        const newErrorFn = (errMsg: string) => new SummarizingWarning(errMsg, logged);
        return wrapError<SummarizingWarning>(error, newErrorFn);
    }
}

export const createSummarizingWarning =
    (details: string, logged: boolean) => new SummarizingWarning(details, logged);

/**
 * Summarizer is responsible for coordinating when to send generate and send summaries.
 * It is the main entry point for summary work.
 */
export class Summarizer extends EventEmitter implements ISummarizer {
    public get IFluidLoadable() { return this; }
    public get IFluidRouter() { return this; }
    public get IFluidRunnable() { return this; }
    public get ISummarizer() { return this; }

    private readonly logger: ITelemetryLogger;
    private readonly runCoordinator: RunWhileConnectedCoordinator;
    private onBehalfOfClientId: string | undefined;
    private runningSummarizer?: RunningSummarizer;
    private systemOpListener?: (op: ISequencedDocumentMessage) => void;
    private opListener?: (error: any, op: ISequencedDocumentMessage) => void;
    private stopped = false;
    private readonly stopDeferred = new Deferred<void>();
    private _disposed: boolean = false;

    private readonly innerHandle: IFluidHandle<this>;

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    constructor(
        url: string,
        private readonly runtime: ISummarizerRuntime,
        private readonly configurationGetter: () => ISummaryConfiguration,
        private readonly internalsProvider: ISummarizerInternalsProvider,
        handleContext: IFluidHandleContext,
        public readonly summaryCollection: SummaryCollection,
    ) {
        super();
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");
        this.runCoordinator = new RunWhileConnectedCoordinator(runtime);
        this.innerHandle = new SummarizerHandle(this, url, handleContext);
    }

    public async run(onBehalfOf: string): Promise<void> {
        try {
            await this.runCore(onBehalfOf);
        } catch (error) {
            this.emit("summarizingError", SummarizingWarning.wrap(error, false /* logged */));
            throw error;
        } finally {
            // Cleanup after running
            if (this.runtime.connected) {
                if (this.runningSummarizer) {
                    await this.runningSummarizer.waitStop();
                }
                this.runtime.closeFn();
            }
            this.dispose();
        }
    }

    /**
     * Stops the summarizer from running.  This will complete
     * the run promise, and also close the container.
     * @param reason - reason code for stopping
     */
    public stop(reason?: SummarizerStopReason) {
        if (this.stopped) {
            // already stopping
            return;
        }
        this.stopped = true;

        this.logger.sendTelemetryEvent({
            eventName: "StoppingSummarizer",
            onBehalfOf: this.onBehalfOfClientId,
            reason,
        });
        this.stopDeferred.resolve();
    }

    public updateOnBehalfOf(onBehalfOf: string): void {
        this.onBehalfOfClientId = onBehalfOf;
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

    private async runCore(onBehalfOf: string): Promise<void> {
        this.onBehalfOfClientId = onBehalfOf;

        const startResult = await this.runCoordinator.waitStart();
        if (startResult.started === false) {
            this.logger.sendTelemetryEvent({
                eventName: "NotStarted",
                reason: startResult.message,
                onBehalfOf,
            });
            return;
        }

        if (this.runtime.deltaManager.active === false) {
            this.logger.sendTelemetryEvent({
                eventName: "NotStarted",
                reason: "CannotWrite",
                onBehalfOf,
            });
            return;
        }

        if (this.runtime.summarizerClientId !== this.onBehalfOfClientId
            && this.runtime.summarizerClientId !== this.runtime.clientId) {
            // Verify that this client's computed summarizer matches the client this was spawned
            // on behalf of.  If not, fallback on the following logic before stopping:
            // If we are not oldest client in quorum, another client will take over as summarizer.
            // We want to make sure we at least try to summarize in case server is rejecting ops,
            // so if we are the oldest client, we will still go through and try to summarize at least once.
            // We also don't want to end up with two summarizer clients running at the same time,
            // so we bypass running altogether if this client isn't the oldest.
            this.logger.sendTelemetryEvent({
                eventName: "NotStarted",
                reason: "DifferentComputedSummarizer",
                computedSummarizer: this.runtime.summarizerClientId,
                onBehalfOf,
                clientId: this.runtime.clientId,
            });
            return;
        }

        // Initialize values and first ack (time is not exact)
        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.runtime.deltaManager.initialSequenceNumber,
        });

        const runningSummarizer = await RunningSummarizer.start(
            startResult.clientId,
            onBehalfOf,
            this.logger,
            this.summaryCollection.createWatcher(startResult.clientId),
            this.configurationGetter(),
            this /* Pick<ISummarizerInternalsProvider, "submitSummary"> */,
            this.runtime.deltaManager.lastSequenceNumber,
            { /** Initial summary attempt */
                refSequenceNumber: this.runtime.deltaManager.initialSequenceNumber,
                summaryTime: Date.now(),
            } as const,
            (description: string) => {
                if (!this._disposed) {
                    this.emit("summarizingError", createSummarizingWarning(`Summarizer: ${description}`, true));
                }
            },
            this.summaryCollection,
        );
        this.runningSummarizer = runningSummarizer;

        // Handle summary acks
        this.handleSummaryAcks().catch((error) => {
            this.logger.sendErrorEvent({ eventName: "HandleSummaryAckFatalError" }, error);

            // Raise error to parent container.
            this.emit("summarizingError", createSummarizingWarning("Summarizer: HandleSummaryAckFatalError", true));

            this.stop();
        });

        // Listen for ops
        this.systemOpListener = (op: ISequencedDocumentMessage) => runningSummarizer.handleSystemOp(op);
        this.runtime.deltaManager.inbound.on("op", this.systemOpListener);

        this.opListener = (error: any, op: ISequencedDocumentMessage) => runningSummarizer.handleOp(error, op);
        this.runtime.on("batchEnd", this.opListener);

        await Promise.race([
            this.runCoordinator.waitStopped(),
            this.stopDeferred.promise,
        ]);
    }

    /**
     * Disposes of resources after running.  This cleanup will
     * clear any outstanding timers and reset some of the state
     * properties.
     */
    public dispose() {
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

    public async setSummarizer(): Promise<ISummarizer> {
        this.runtime.nextSummarizerD = new Deferred<ISummarizer>();
        return this.runtime.nextSummarizerD.promise;
    }

    /** Implementation of SummarizerInternalsProvider.submitSummary */
    public async submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult> {
        const result = this.internalsProvider.submitSummary(options);

        if (this.onBehalfOfClientId !== this.runtime.summarizerClientId
            && this.runtime.clientId !== this.runtime.summarizerClientId) {
            // We are no longer the summarizer; a different client is, so we should stop ourself
            this.stop("parentNoLongerSummarizer");
        }
        return result;
    }

    public summarizeOnDemand(
        reason: string,
        options: Omit<IGenerateSummaryOptions, "summaryLogger">,
    ): OnDemandSummarizeResult {
        if (this._disposed || this.runningSummarizer === undefined || this.runningSummarizer.disposed) {
            throw Error("Summarizer is not running or already disposed.");
        }
        return this.runningSummarizer.summarizeOnDemand(reason, options);
    }

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
