/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponentLoadable,
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ChildLogger, PerformanceEvent, PromiseTimer, Timer } from "@microsoft/fluid-core-utils";
import {
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISummaryConfiguration,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { ContainerRuntime, GenerateSummaryData } from "./containerRuntime";
import { RunWhileConnectedCoordinator } from "./runWhileConnectedCoordinator";
import { IClientSummaryWatcher, SummaryCollection } from "./summaryCollection";

// send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // double and resend 5 times

/**
 * Summarizer is responsible for coordinating when to send generate and send summaries.
 * It is the main entry point for summary work.
 */
export class Summarizer implements IComponentRouter, IComponentRunnable, IComponentLoadable {
    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }
    public get IComponentLoadable() { return this; }

    private readonly logger: ITelemetryLogger;
    private readonly runCoordinator: RunWhileConnectedCoordinator;
    private readonly summaryCollection: SummaryCollection;
    private onBehalfOfClientId: string;
    private runningSummarizer?: RunningSummarizer;
    private systemOpListener?: (op: ISequencedDocumentMessage) => void;
    private opListener?: (error: any, op: ISequencedDocumentMessage) => void;

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        private readonly configurationGetter: () => ISummaryConfiguration,
        private readonly generateSummaryCore: () => Promise<GenerateSummaryData>,
        private readonly refreshLatestAck: (handle: string, referenceSequenceNumber: number) => Promise<void>,
    ) {
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");
        this.runCoordinator = new RunWhileConnectedCoordinator(runtime);
        this.summaryCollection = new SummaryCollection(this.runtime.deltaManager.initialSequenceNumber);
        this.runtime.deltaManager.inbound.on("op",
            (op) => this.summaryCollection.handleOp(op as ISequencedDocumentMessage));
    }

    public async run(onBehalfOf: string): Promise<void> {
        try {
            await this.runCore(onBehalfOf);
        } finally {
            // cleanup after running
            this.dispose();
            if (this.runtime.connected) {
                this.stop("runEnded");
            }
        }
    }

    /**
     * Stops the summarizer from running.  This will complete
     * the run promise, and also close the container.
     * @param reason - reason code for stopping
     */
    public stop(reason?: string) {
        this.logger.sendTelemetryEvent({
            eventName: "StoppingSummarizer",
            onBehalfOf: this.onBehalfOfClientId,
            reason,
        });
        this.runCoordinator.stop();
        this.runtime.closeFn();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
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
                error: startResult.message,
                onBehalfOf,
            });
            return;
        }

        if (this.runtime.summarizerClientId !== this.onBehalfOfClientId) {
            // this calculated summarizer differs from parent
            // parent SummaryManager should prevent this from happening
            this.logger.sendErrorEvent({
                eventName: "ParentIsNotSummarizer",
                expectedSummarizer: this.runtime.summarizerClientId,
                onBehalfOf,
            });
            return;
        }

        // initialize values and first ack (time is not exact)
        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.summaryCollection.initialSequenceNumber,
        });

        const initialAttempt: ISummaryAttempt = {
            refSequenceNumber: this.summaryCollection.initialSequenceNumber,
            summaryTime: Date.now(),
        };

        this.runningSummarizer = await RunningSummarizer.start(
            this.runtime.clientId,
            onBehalfOf,
            this.logger,
            this.summaryCollection.createWatcher(this.runtime.clientId),
            this.configurationGetter(),
            () => this.generateSummary(),
            this.runtime.deltaManager.referenceSequenceNumber,
            initialAttempt,
        );

        // handle summary acks
        this.handleSummaryAcks().catch((error) => {
            this.logger.sendErrorEvent({ eventName: "HandleSummaryAckFatalError" }, error);
            this.stop("handleAckError");
        });

        // listen for ops
        this.systemOpListener = (op: ISequencedDocumentMessage) => this.runningSummarizer.handleSystemOp(op);
        this.runtime.deltaManager.inbound.on("op", this.systemOpListener);

        this.opListener = (error: any, op: ISequencedDocumentMessage) => this.runningSummarizer.handleOp(error, op);
        this.runtime.on("batchEnd", this.opListener);

        await this.runCoordinator.waitStopped();
    }

    /**
     * Disposes of resources after running.  This cleanup will
     * clear any outstanding timers and reset some of the state
     * properties.
     */
    private dispose() {
        if (this.runningSummarizer) {
            this.runningSummarizer.dispose();
            this.runningSummarizer = undefined;
        }
        if (this.systemOpListener) {
            this.runtime.deltaManager.inbound.removeListener("op", this.systemOpListener);
        }
        if (this.opListener) {
            this.runtime.removeListener("batchEnd", this.opListener);
        }
    }

    private async generateSummary(): Promise<GenerateSummaryData | undefined> {
        if (this.onBehalfOfClientId !== this.runtime.summarizerClientId) {
            // we are no longer the summarizer, we should stop ourself
            this.stop("parentNoLongerSummarizer");
            return undefined;
        }

        return this.generateSummaryCore();
    }

    private async handleSummaryAcks() {
        let refSequenceNumber = this.summaryCollection.initialSequenceNumber;
        while (this.runningSummarizer) {
            try {
                const ack = await this.summaryCollection.waitSummaryAck(refSequenceNumber);
                refSequenceNumber = ack.summaryOp.referenceSequenceNumber;
                const handle = ack.summaryAckNack.contents.handle;

                await this.refreshLatestAck(handle, refSequenceNumber);
                refSequenceNumber++;
            } catch (error) {
                this.logger.sendErrorEvent({ eventName: "HandleSummaryAckError", refSequenceNumber }, error);
            }
        }
    }
}

/**
 * Data about a summary attempt
 */
export interface ISummaryAttempt {
    /**
     * Reference sequence number when summary was generated
     */
    readonly refSequenceNumber: number;

    /**
     * Time of summary attempt after it was sent
     */
    readonly summaryTime: number;

    /**
     * Sequence number of summary op
     */
    summarySequenceNumber?: number;
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
        generateSummary: () => Promise<GenerateSummaryData | undefined>,
        lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
    ): Promise<RunningSummarizer> {
        const summarizer = new RunningSummarizer(
            clientId,
            onBehalfOfClientId,
            logger,
            summaryWatcher,
            configuration,
            generateSummary,
            lastOpSeqNumber,
            firstAck);

        await summarizer.waitStart();

        // run the heuristics after starting
        summarizer.heuristics.run();
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
        private readonly generateSummary: () => Promise<GenerateSummaryData | undefined>,
        lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
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
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime: this.configuration.maxAckWaitTime,
                    refSequenceNumber: this.heuristics.lastSent.refSequenceNumber,
                    summarySequenceNumber: this.heuristics.lastSent.summarySequenceNumber,
                    timePending: Date.now() - this.heuristics.lastSent.summaryTime,
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
                    // ignore summarizer leave messages, to make sure not to start generating
                    // a summary as the summarizer is leaving
                    return;
                }
                // leave ops for any other client fall through to handle normally
            }
            // intentional fallthrough
            case MessageType.ClientJoin:
            case MessageType.Propose:
            case MessageType.Reject: {
                // synchronously handle quorum ops like regular ops
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

        // check for ops requesting summary
        if (op.type === MessageType.Save) {
            this.trySummarize(`;${op.clientId}: ${op.contents}`);
        } else {
            this.heuristics.run();
        }
    }

    private async waitStart() {
        // wait no longer than ack timeout for all pending
        const maybeLastAck = await Promise.race([
            this.summaryWatcher.waitFlushed(),
            this.pendingAckTimer.start(),
        ]);
        this.pendingAckTimer.clear();

        if (maybeLastAck) {
            this.heuristics.lastSent = {
                refSequenceNumber: maybeLastAck.summaryOp.referenceSequenceNumber,
                summaryTime: maybeLastAck.summaryOp.timestamp,
                summarySequenceNumber: maybeLastAck.summaryOp.sequenceNumber,
            };
            this.heuristics.ackLastSent();
        }
    }

    private trySummarize(reason: string) {
        if (this.summarizing) {
            // we can't summarize if we are already
            this.tryWhileSummarizing = true;
            return;
        }

        // generateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = true;
        this.summarizeTimer.start();

        // tslint:disable-next-line: no-floating-promises
        this.summarize(reason).finally(() => {
            this.summarizing = false;
            this.summarizeTimer.clear();
            this.pendingAckTimer.clear();
            if (this.tryWhileSummarizing) {
                this.tryWhileSummarizing = false;
                this.heuristics.run();
            }
        });
    }

    private async summarize(reason: string) {
        // wait to generate and send summary
        const summaryData = await this.generateSummaryWithLogging(reason);
        if (!summaryData || !summaryData.submitted) {
            // did not send the summary op
            return;
        }

        this.heuristics.lastSent = {
            refSequenceNumber: summaryData.referenceSequenceNumber,
            summaryTime: Date.now(),
        };

        const pendingTimeoutP = this.pendingAckTimer.start();
        const summary = this.summaryWatcher.watchSummary(summaryData.clientSequenceNumber);

        // wait for broadcast
        const summaryOp = await Promise.race([summary.waitBroadcast(), pendingTimeoutP]);
        if (!summaryOp) {
            return;
        }
        this.heuristics.lastSent.summarySequenceNumber = summaryOp.sequenceNumber;
        this.logger.sendTelemetryEvent({
            eventName: "SummaryOp",
            timeWaiting: Date.now() - this.heuristics.lastSent.summaryTime,
            refSequenceNumber: summaryOp.referenceSequenceNumber,
            summarySequenceNumber: summaryOp.sequenceNumber,
            handle: summaryOp.contents.handle,
        });

        // wait for ack/nack
        const ackNack = await Promise.race([summary.waitAckNack(), pendingTimeoutP]);
        if (!ackNack) {
            return;
        }
        this.logger.sendTelemetryEvent({
            eventName: ackNack.type === MessageType.SummaryAck ? "SummaryAck" : "SummaryNack",
            category: ackNack.type === MessageType.SummaryAck ? "generic" : "error",
            timeWaiting: Date.now() - this.heuristics.lastSent.summaryTime,
            summarySequenceNumber: ackNack.contents.summaryProposal.summarySequenceNumber,
            error: ackNack.type === MessageType.SummaryNack ? ackNack.contents.errorMessage : undefined,
            handle: ackNack.type === MessageType.SummaryAck ? ackNack.contents.handle : undefined,
        });

        // update for success
        if (ackNack.type === MessageType.SummaryAck) {
            this.heuristics.ackLastSent();
        }
    }

    private async generateSummaryWithLogging(message: string): Promise<GenerateSummaryData | undefined> {
        const summarizingEvent = PerformanceEvent.start(this.logger, {
            eventName: "Summarizing",
            message,
            summarizeCount: ++this.summarizeCount,
            timeSinceLastAttempt: Date.now() - this.heuristics.lastSent.summaryTime,
            timeSinceLastSummary: Date.now() - this.heuristics.lastAcked.summaryTime,
        });

        // wait for generate/send summary
        let summaryData: GenerateSummaryData | undefined;
        try {
            summaryData = await this.generateSummary();
        } catch (error) {
            summarizingEvent.cancel({ category: "error" }, error);
            return;
        }

        this.summarizeTimer.clear();

        if (!summaryData) {
            summarizingEvent.cancel();
            return;
        }

        const telemetryProps = {
            ...summaryData,
            ...summaryData.summaryStats,
            refSequenceNumber: summaryData.referenceSequenceNumber,
            opsSinceLastAttempt: summaryData.referenceSequenceNumber - this.heuristics.lastSent.refSequenceNumber,
            opsSinceLastSummary: summaryData.referenceSequenceNumber - this.heuristics.lastAcked.refSequenceNumber,
        };
        telemetryProps.summaryStats = undefined;
        telemetryProps.referenceSequenceNumber = undefined;

        if (summaryData.submitted) {
            summarizingEvent.end(telemetryProps);
        } else {
            summarizingEvent.cancel({ ...telemetryProps, category: "error" });
        }

        return summaryData;
    }

    private summarizeTimerHandler(time: number, count: number) {
        this.logger.sendErrorEvent({
            eventName: "SummarizeTimeout",
            timeoutTime: time,
            timeoutCount: count,
        });
        if (count < maxSummarizeTimeoutCount) {
            // double and start a new timer
            const nextTime = time * 2;
            this.summarizeTimer.start(nextTime, () => this.summarizeTimerHandler(nextTime, count + 1));
        }
    }
}

/**
 * This class contains the heuristics for when to summarize.
 */
class SummarizerHeuristics {
    /**
     * Last sent summary attempt
     */
    public lastSent: ISummaryAttempt;
    private _lastAcked: ISummaryAttempt;

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
        this.lastSent = firstAck;
        this._lastAcked = firstAck;
        this.idleTimer = new Timer(
            this.configuration.idleTime,
            () => this.trySummarize("idle"));
    }

    /**
     * Mark the last sent summary attempt as acked.
     */
    public ackLastSent() {
        this._lastAcked = this.lastSent;
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
            this.idleTimer.start();
        }
    }

    /**
     * Disposes of resources.
     */
    public dispose() {
        this.idleTimer.clear();
    }
}
