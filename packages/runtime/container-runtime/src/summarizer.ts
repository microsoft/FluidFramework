/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { assert } from "@fluidframework/common-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ChildLogger, LoggingError } from "@fluidframework/telemetry-utils";
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

export class SummarizingWarning extends LoggingError implements ISummarizingWarning {
    readonly errorType = summarizingError;
    readonly canRetry = true;

    constructor(errorMessage: string, readonly logged: boolean = false) {
        super(errorMessage);
    }

    static wrap(error: any, logged: boolean = false, logger: ITelemetryLogger) {
        const newErrorFn = (errMsg: string) => new SummarizingWarning(errMsg, logged);
        return wrapErrorAndLog<SummarizingWarning>(error, newErrorFn, logger);
    }
}

export const createSummarizingWarning =
    (details: string, logged: boolean) => new SummarizingWarning(details, logged);

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
    private runCoordinator?: RunWhileConnectedCoordinator;

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    public get cancelled() { return this.runCoordinator?.cancelled ?? true; }

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

    public async run(onBehalfOf: string, options?: Readonly<Partial<ISummarizerOptions>>): Promise<void> {
        try {
            await this.runCore(onBehalfOf, options);
        } catch (error) {
            this.emit("summarizingError", SummarizingWarning.wrap(error, false /* logged */, this.logger));
            throw error;
        } finally {
            // Cleanup after running
            if (this.runtime.connected && this.runningSummarizer) {
                await this.runningSummarizer.waitStop();
            }
            this.runCoordinator = undefined;
            this.runtime.closeFn();
            this.dispose();
        }
    }

    /**
     * Stops the summarizer from running.  This will complete
     * the run promise, and also close the container.
     * @param reason - reason code for stopping
     */
     public stop(reason: SummarizerStopReason) {
        this.runCoordinator?.stop(reason);
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

    private async runCore(onBehalfOf: string, options?: Readonly<Partial<ISummarizerOptions>>): Promise<void> {
        const runCoordinator = new RunWhileConnectedCoordinator(this.runtime, onBehalfOf, this.logger);
        await runCoordinator.waitStart();
        if (runCoordinator.cancelled) {
            return;
        }

        // Summarizing container ID (with clientType === "summarizer")
        const clientId = this.runtime.clientId;
        if (clientId === undefined) {
            throw Error("clientId should be defined if connected.");
        }

        this.runCoordinator = runCoordinator;

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
            (description: string) => {
                if (!this._disposed) {
                    this.emit("summarizingError", createSummarizingWarning(`Summarizer: ${description}`, true));
                }
            },
            this.summaryCollection,
            runCoordinator /* cancellable */,
            (reason) => runCoordinator.stop(reason),
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

        await runCoordinator.waitCancelled;
    }

    /**
     * Disposes of resources after running.  This cleanup will
     * clear any outstanding timers and reset some of the state
     * properties.
     * Called by ContainerRuntime when it is disposed, as well as at the end the run().
     */
    public dispose() {
        // If there is session running, make sure it is aborted
        assert(this.cancelled, "cancelled");

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
