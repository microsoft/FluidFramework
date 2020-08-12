/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable, IEvent, IEventProvider, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    Deferred,
    PromiseTimer,
    Timer,
    IPromiseTimerResult,
} from "@fluidframework/common-utils";
import { ChildLogger, CustomErrorWithProps, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IFluidRouter,
    IFluidRunnable,
    IRequest,
    IResponse,
    IFluidHandleContext,
    IFluidHandle,
    IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { IDeltaManager, IErrorBase } from "@fluidframework/container-definitions";
import { CreateContainerError } from "@fluidframework/container-utils";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISummaryConfiguration,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { GenerateSummaryData, IPreviousState } from "./containerRuntime";
import { IConnectableRuntime, RunWhileConnectedCoordinator } from "./runWhileConnectedCoordinator";
import { IClientSummaryWatcher, SummaryCollection } from "./summaryCollection";
import { SummarizerHandle } from "./summarizerHandle";

// Send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // Double and resend 5 times

const minOpsForLastSummary = 50;

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideSummarizer>> { }
}

export const ISummarizer: keyof IProvideSummarizer = "ISummarizer";

export interface IProvideSummarizer {
    readonly ISummarizer: ISummarizer;
}

const summarizingError = "summarizingError";

export interface ISummarizingWarning extends IErrorBase {
    readonly errorType: "summarizingError";
    /**
     * Whether this error has already been logged. Used to avoid logging errors twice.
     */
    readonly logged: boolean;
}

export class SummarizingWarning extends CustomErrorWithProps implements ISummarizingWarning {
    readonly errorType = summarizingError;
    readonly canRetry = true;

    constructor(errorMessage: string, readonly logged: boolean = false) {
        super(errorMessage);
    }
}

export const createSummarizingWarning =
    (details: string, logged: boolean) => new SummarizingWarning(details, logged);

export interface ISummarizerEvents extends IEvent {
    /**
     * An event indicating that the Summarizer is having problems summarizing
     */
    (event: "summarizingError", listener: (error: ISummarizingWarning) => void);
}
export interface ISummarizer
    extends IEventProvider<ISummarizerEvents>, IFluidRouter, IFluidRunnable, IFluidLoadable {
    /**
     * Returns a promise that will be resolved with the next Summarizer after context reload
     */
    setSummarizer(): Promise<Summarizer>;
    stop(reason?: string): void;
    run(onBehalfOf: string): Promise<void>;
    updateOnBehalfOf(onBehalfOf: string): void;
}

export interface ISummarizerRuntime extends IConnectableRuntime {
    readonly logger: ITelemetryLogger;
    readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    readonly previousState: IPreviousState;
    readonly summarizerClientId: string | undefined;
    nextSummarizerD?: Deferred<Summarizer>;
    closeFn(): void;
    on(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
    on(event: "disconnected", listener: () => void): this;
    removeListener(event: "batchEnd", listener: (error: any, op: ISequencedDocumentMessage) => void): this;
}

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
        private readonly trySummarize: (reason: string) => void,
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
        generateSummary: (full: boolean, safe: boolean) => Promise<GenerateSummaryData | undefined>,
        lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
        immediateSummary: boolean,
        raiseSummarizingError: (description: string) => void,
    ): Promise<RunningSummarizer> {
        const summarizer = new RunningSummarizer(
            clientId,
            onBehalfOfClientId,
            logger,
            summaryWatcher,
            configuration,
            generateSummary,
            lastOpSeqNumber,
            firstAck,
            immediateSummary,
            raiseSummarizingError);

        await summarizer.waitStart();

        // Run the heuristics after starting
        if (immediateSummary) {
            summarizer.trySummarize("immediate");
        } else {
            summarizer.heuristics.run();
        }
        return summarizer;
    }

    public get disposed() { return this._disposed; }

    private _disposed = false;
    private summarizing = false;
    private summarizeCount: number = 0;
    private tryWhileSummarizing = false;
    private readonly summarizeTimer: Timer;
    private readonly pendingAckTimer: PromiseTimer;
    private readonly heuristics: SummarizerHeuristics;

    private constructor(
        private readonly clientId: string,
        private readonly onBehalfOfClientId: string,
        private readonly logger: ITelemetryLogger,
        private readonly summaryWatcher: IClientSummaryWatcher,
        private readonly configuration: ISummaryConfiguration,
        private readonly generateSummary: (full: boolean, safe: boolean) => Promise<GenerateSummaryData | undefined>,
        lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
        private immediateSummary: boolean = false,
        private readonly raiseSummarizingError: (description: string) => void,
    ) {
        this.heuristics = new SummarizerHeuristics(
            configuration,
            (reason) => this.trySummarize(reason),
            lastOpSeqNumber,
            firstAck);

        this.summarizeTimer = new Timer(
            maxSummarizeTimeoutTime,
            () => this.summarizeTimerHandler(maxSummarizeTimeoutTime, 1));

        this.pendingAckTimer = new PromiseTimer(
            this.configuration.maxAckWaitTime,
            () => {
                this.raiseSummarizingError("SummaryAckWaitTimeout");
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime: this.configuration.maxAckWaitTime,
                    refSequenceNumber: this.heuristics.lastAttempted.refSequenceNumber,
                    summarySequenceNumber: this.heuristics.lastAttempted.summarySequenceNumber,
                    timePending: Date.now() - this.heuristics.lastAttempted.summaryTime,
                });
            });
    }

    public dispose(): void {
        this.summaryWatcher.dispose();
        this.heuristics.dispose();
        this.summarizeTimer.clear();
        this.pendingAckTimer.clear();
        this._disposed = true;
    }

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
            this.trySummarize(`;${op.clientId}: ${op.contents}`);
        } else {
            this.heuristics.run();
        }
    }

    public async waitStop(): Promise<void> {
        if (this.disposed) {
            return;
        }
        const outstandingOps = this.heuristics.lastOpSeqNumber - this.heuristics.lastAcked.refSequenceNumber;
        if (outstandingOps > minOpsForLastSummary) {
            // This resolves when the current pending summary is broadcast.
            // We don't stick around and wait to see if it is acked or not.
            await this.trySummarize("lastSummary").broadcastP;
        }
    }

    private async waitStart() {
        // Wait no longer than ack timeout for all pending
        const maybeLastAck = await Promise.race([
            this.summaryWatcher.waitFlushed(),
            this.pendingAckTimer.start(),
        ]);
        this.pendingAckTimer.clear();

        if (checkNotTimeout(maybeLastAck)) {
            this.heuristics.initialize({
                refSequenceNumber: maybeLastAck.summaryOp.referenceSequenceNumber,
                summaryTime: maybeLastAck.summaryOp.timestamp,
                summarySequenceNumber: maybeLastAck.summaryOp.sequenceNumber,
            });
        }
    }

    private trySummarize(reason: string): { broadcastP: Promise<void> } {
        if (this.summarizing === true) {
            // We can't summarize if we are already
            this.tryWhileSummarizing = true;
            return { broadcastP: Promise.resolve() };
        }

        // GenerateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = true;
        const broadcastDeferred = new Deferred<void>();

        (async () => {
            const result = await this.summarize(reason, false, broadcastDeferred);
            if (result !== true) {
                // On nack or error, try again in safe mode
                await this.summarize(reason, true, broadcastDeferred);
            }
        })().finally(() => {
            this.summarizing = false;
            broadcastDeferred.resolve();
            if (this.tryWhileSummarizing) {
                this.tryWhileSummarizing = false;
                this.heuristics.run();
            }
        }).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "UnexpectedSummarizeError" }, error);
        });

        return { broadcastP: broadcastDeferred.promise };
    }

    /**
     * Generates summary and listens for broadcast and ack/nack.
     * Returns true for ack, false for nack, and undefined for failure or timeout.
     * @param reason - reason for summarizing
     * @param safe - true to generate summary in safe mode
     */
    private async summarize(reason: string, safe: boolean, broadcastDef: Deferred<void>): Promise<boolean | undefined> {
        this.summarizeTimer.start();

        try {
            return await this.summarizeCore(reason, safe, broadcastDef);
        } finally {
            this.summarizeTimer.clear();
            this.pendingAckTimer.clear();
        }
    }

    private async summarizeCore(
        reason: string,
        safe: boolean,
        broadcastDef: Deferred<void>,
    ): Promise<boolean | undefined> {
        // Wait to generate and send summary
        const summaryData = await this.generateSummaryWithLogging(reason, safe);
        this.heuristics.recordAttempt(summaryData?.referenceSequenceNumber);
        if (!summaryData || !summaryData.submitted) {
            // Did not send the summary op
            this.raiseSummarizingError("Error while generating or submitting summary");
            return undefined;
        }

        const pendingTimeoutP = this.pendingAckTimer.start().catch(() => undefined);
        const summary = this.summaryWatcher.watchSummary(summaryData.clientSequenceNumber);

        // Wait for broadcast
        const summaryOp = await Promise.race([summary.waitBroadcast(), pendingTimeoutP]);
        broadcastDef.resolve(); // broadcast means client is free to close
        if (!checkNotTimeout(summaryOp)) {
            return undefined;
        }
        this.heuristics.lastAttempted.summarySequenceNumber = summaryOp.sequenceNumber;
        this.logger.sendTelemetryEvent({
            eventName: "SummaryOp",
            timeWaiting: Date.now() - this.heuristics.lastAttempted.summaryTime,
            refSequenceNumber: summaryOp.referenceSequenceNumber,
            summarySequenceNumber: summaryOp.sequenceNumber,
            handle: summaryOp.contents.handle,
        });

        // Wait for ack/nack
        const ackNack = await Promise.race([summary.waitAckNack(), pendingTimeoutP]);
        if (!checkNotTimeout(ackNack)) {
            return undefined;
        }
        this.logger.sendTelemetryEvent({
            eventName: ackNack.type === MessageType.SummaryAck ? "SummaryAck" : "SummaryNack",
            category: ackNack.type === MessageType.SummaryAck ? "generic" : "error",
            timeWaiting: Date.now() - this.heuristics.lastAttempted.summaryTime,
            summarySequenceNumber: ackNack.contents.summaryProposal.summarySequenceNumber,
            error: ackNack.type === MessageType.SummaryNack ? ackNack.contents.errorMessage : undefined,
            handle: ackNack.type === MessageType.SummaryAck ? ackNack.contents.handle : undefined,
        });

        this.pendingAckTimer.clear();

        // Update for success
        if (ackNack.type === MessageType.SummaryAck) {
            this.heuristics.ackLastSent();

            // since we need a full summary after context reload, we only clear this on ack
            this.immediateSummary = false;

            return true;
        } else {
            this.raiseSummarizingError("SummaryNack");
            return false;
        }
    }

    private async generateSummaryWithLogging(message: string, safe: boolean): Promise<GenerateSummaryData | undefined> {
        const summarizingEvent = PerformanceEvent.start(this.logger, {
            eventName: "Summarizing",
            message,
            summarizeCount: ++this.summarizeCount,
            timeSinceLastAttempt: Date.now() - this.heuristics.lastAttempted.summaryTime,
            timeSinceLastSummary: Date.now() - this.heuristics.lastAcked.summaryTime,
            safe: safe || undefined,
        });

        // Wait for generate/send summary
        let summaryData: GenerateSummaryData | undefined;
        try {
            summaryData = await this.generateSummary(this.immediateSummary, safe);
        } catch (error) {
            summarizingEvent.cancel({ category: "error" }, error);
            return;
        }

        this.summarizeTimer.clear();

        if (!summaryData) {
            summarizingEvent.cancel();
            return;
        }

        const telemetryProps: any = {
            ...summaryData,
            ...summaryData.summaryStats,
            refSequenceNumber: summaryData.referenceSequenceNumber,
            opsSinceLastAttempt: summaryData.referenceSequenceNumber - this.heuristics.lastAttempted.refSequenceNumber,
            opsSinceLastSummary: summaryData.referenceSequenceNumber - this.heuristics.lastAcked.refSequenceNumber,
        };
        telemetryProps.summaryStats = undefined;
        telemetryProps.referenceSequenceNumber = undefined;

        if (summaryData.submitted) {
            summarizingEvent.end(telemetryProps);
        } else {
            summarizingEvent.cancel(telemetryProps);
        }

        return summaryData;
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
}

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
    private immediateSummary: boolean = false;
    public readonly summaryCollection: SummaryCollection;
    private stopped = false;
    private readonly stopDeferred = new Deferred<void>();
    private _disposed: boolean = false;

    private readonly innerHandle: IFluidHandle<this>;

    public get handle(): IFluidHandle<this> { return this.innerHandle; }

    constructor(
        public readonly url: string,
        private readonly runtime: ISummarizerRuntime,
        private readonly configurationGetter: () => ISummaryConfiguration,
        // eslint-disable-next-line max-len
        private readonly generateSummaryCore: (full: boolean, safe: boolean) => Promise<GenerateSummaryData | undefined>,
        private readonly refreshLatestAck: (
            proposalHandle: string,
            ackHandle: string,
            referenceSequenceNumber: number
        ) => Promise<void>,
        handleContext: IFluidHandleContext,
        summaryCollection?: SummaryCollection,
    ) {
        super();
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");
        this.runCoordinator = new RunWhileConnectedCoordinator(runtime);
        if (summaryCollection) {
            // summarize immediately because we just went through context reload
            this.immediateSummary = true;
            this.summaryCollection = summaryCollection;
        } else {
            this.summaryCollection = new SummaryCollection(this.runtime.deltaManager.initialSequenceNumber);
        }
        this.runtime.deltaManager.inbound.on("op",
            (op) => this.summaryCollection.handleOp(op));

        this.runtime.previousState.nextSummarizerD?.resolve(this);
        this.innerHandle = new SummarizerHandle(this, this.url, handleContext);
    }

    public async run(onBehalfOf: string): Promise<void> {
        try {
            await this.runCore(onBehalfOf);
        } catch (error) {
            const err2: ISummarizingWarning = {
                logged: false,
                ...CreateContainerError(error),
                errorType: summarizingError,
            };
            this.emit("summarizingError", err2);
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
    public stop(reason: string) {
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
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
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
            initSummarySeqNumber: this.summaryCollection.initialSequenceNumber,
        });

        const initialAttempt: ISummaryAttempt = {
            refSequenceNumber: this.summaryCollection.initialSequenceNumber,
            summaryTime: Date.now(),
        };

        const runningSummarizer = await RunningSummarizer.start(
            startResult.clientId,
            onBehalfOf,
            this.logger,
            this.summaryCollection.createWatcher(startResult.clientId),
            this.configurationGetter(),
            async (full: boolean, safe: boolean) => this.generateSummary(full, safe),
            this.runtime.deltaManager.lastSequenceNumber,
            initialAttempt,
            this.immediateSummary,
            (description: string) => {
                if (!this._disposed) {
                    this.emit("summarizingError", createSummarizingWarning(`Summarizer: ${description}`, true));
                }
            },
        );
        this.runningSummarizer = runningSummarizer;

        this.immediateSummary = false;

        // Handle summary acks
        this.handleSummaryAcks().catch((error) => {
            this.logger.sendErrorEvent({ eventName: "HandleSummaryAckFatalError" }, error);

            // Raise error to parent container.
            this.emit("summarizingError", createSummarizingWarning("Summarizer: handleAckError", true));

            this.stop("handleAckError");
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

    public async setSummarizer(): Promise<Summarizer> {
        this.runtime.nextSummarizerD = new Deferred<Summarizer>();
        return this.runtime.nextSummarizerD.promise;
    }

    private async generateSummary(full: boolean, safe: boolean): Promise<GenerateSummaryData | undefined> {
        if (this.onBehalfOfClientId !== this.runtime.summarizerClientId
            && this.runtime.clientId !== this.runtime.summarizerClientId) {
            // We are no longer the summarizer; a different client is, so we should stop ourself
            this.stop("parentNoLongerSummarizer");
            return undefined;
        }

        return this.generateSummaryCore(full, safe);
    }

    private async handleSummaryAcks() {
        let refSequenceNumber = this.summaryCollection.initialSequenceNumber;
        while (this.runningSummarizer) {
            try {
                const ack = await this.summaryCollection.waitSummaryAck(refSequenceNumber);
                refSequenceNumber = ack.summaryOp.referenceSequenceNumber;

                await this.refreshLatestAck(
                    ack.summaryOp.contents.handle,
                    ack.summaryAckNack.contents.handle,
                    refSequenceNumber,
                );
            } catch (error) {
                this.logger.sendErrorEvent({ eventName: "HandleSummaryAckError", refSequenceNumber }, error);
            }
            refSequenceNumber++;
        }
    }
}
