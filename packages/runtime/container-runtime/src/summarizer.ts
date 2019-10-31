/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
    IComponentRouter,
    IComponentRunnable,
    IRequest,
    IResponse } from "@microsoft/fluid-component-core-interfaces";
import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { ChildLogger, Deferred, PerformanceEvent, Timer } from "@microsoft/fluid-core-utils";
import {
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISnapshotTree,
    ISummaryConfiguration,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import { ContainerRuntime, IGeneratedSummaryData } from "./containerRuntime";
import { SingleExecutionRunner } from "./singleExecutionRunner";
import { IClientSummaryWatcher, ISummaryAckMessage, SummaryDataStructure } from "./summaryDataStructure";

// send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // double and resend 5 times

export class Summarizer implements IComponentRouter, IComponentRunnable, IComponentLoadable {
    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }
    public get IComponentLoadable() { return this; }

    private readonly logger: ITelemetryLogger;
    private readonly singleRunner: SingleExecutionRunner;
    private readonly summaryDataStructure: SummaryDataStructure;
    private onBehalfOfClientId: string;
    private runningSummarizer?: RunningSummarizer;

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        private readonly configurationGetter: () => ISummaryConfiguration,
        private readonly generateSummary: () => Promise<IGeneratedSummaryData>,
        private readonly refreshBaseSummary: (snapshot: ISnapshotTree) => void,
    ) {
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");
        this.singleRunner = new SingleExecutionRunner(runtime);
        this.summaryDataStructure = new SummaryDataStructure(
            this.runtime.deltaManager.initialSequenceNumber,
            this.logger);
        this.runtime.deltaManager.inbound.on("op",
            (op) => this.summaryDataStructure.handleOp(op as ISequencedDocumentMessage));
    }

    public async run(onBehalfOf: string): Promise<void> {
        this.onBehalfOfClientId = onBehalfOf;

        const startResult = await this.singleRunner.waitStart();
        if (startResult.started === false) {
            this.logger.sendTelemetryEvent({
                eventName: "NotStarted",
                message: startResult.message,
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
        const maybeInitialAck = await this.summaryDataStructure.waitInitialized();

        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.summaryDataStructure.initialSequenceNumber,
            initHandle: maybeInitialAck ? maybeInitialAck.summaryAckNack.contents.handle : undefined,
        });

        let initialAttempt: ISummaryAttempt = {
            refSequenceNumber: this.summaryDataStructure.initialSequenceNumber,
            summaryTime: Date.now(),
        };
        if (maybeInitialAck) {
            initialAttempt = {
                refSequenceNumber: maybeInitialAck.summaryOp.referenceSequenceNumber,
                summaryTime: maybeInitialAck.summaryOp.timestamp,
                summarySequenceNumber: maybeInitialAck.summaryOp.sequenceNumber,
            };
        }
        const initialHeuristics = new SummarizerHeuristics(
            this.runtime.deltaManager.referenceSequenceNumber,
            initialAttempt);

        this.runningSummarizer = await RunningSummarizer.start(
            this.runtime.clientId,
            onBehalfOf,
            this.logger,
            this.summaryDataStructure.createWatcher(this.runtime.clientId),
            this.configurationGetter(),
            () => this.tryGenerateSummary(),
            (ack) => this.handleSuccessfulSummary(ack),
            initialHeuristics,
        );

        // listen for system ops
        this.runtime.deltaManager.inbound.on(
            "op",
            (op) => this.runningSummarizer.handleSystemOp(op as ISequencedDocumentMessage));

        this.runtime.on(
            "batchEnd",
            (error: any, op: ISequencedDocumentMessage) => this.runningSummarizer.handleOp(error, op));

        await this.singleRunner.waitComplete();

        // cleanup after running
        this.dispose();
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
        this.singleRunner.stop();
        this.runtime.closeFn();
    }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/component",
            status: 200,
            value: this,
        };
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
    }

    private async tryGenerateSummary(): Promise<IGeneratedSummaryData | undefined> {
        if (this.onBehalfOfClientId !== this.runtime.summarizerClientId) {
            // we are no longer the summarizer, we should stop ourself
            this.stop("parentNoLongerSummarizer");
            return undefined;
        }

        return this.generateSummary();
    }

    private async handleSuccessfulSummary(ack: ISummaryAckMessage): Promise<void> {
        // we have to call get version to get the treeId for r11s; this isnt needed
        // for odsp currently, since their treeId is undefined
        const versionsResult = await this.setOrLogError("SummarizerFailedToGetVersion",
            () => this.runtime.storage.getVersions(ack.contents.handle, 1),
            (versions) => !!(versions && versions.length));

        if (versionsResult.success) {
            const snapshotResult = await this.setOrLogError("SummarizerFailedToGetSnapshot",
                () => this.runtime.storage.getSnapshotTree(versionsResult.result[0]),
                (snapshot) => !!snapshot);

            if (snapshotResult.success) {
                // refresh base summary
                // it might be nice to do this in the container in the future, and maybe for all
                // clients, not just the summarizer
                this.refreshBaseSummary(snapshotResult.result);
            }
        }
    }

    private async setOrLogError<T>(
        eventName: string,
        setter: () => Promise<T>,
        validator: (result: T) => boolean,
    ): Promise<{ result: T, success: boolean }> {
        let result: T;
        let success = true;
        try {
            result = await setter();
        } catch (error) {
            // send error event for exceptions
            this.logger.sendErrorEvent({ eventName }, error);
            success = false;
        }
        if (success && !validator(result)) {
            // send error event when result is invalid
            this.logger.sendErrorEvent({ eventName });
            success = false;
        }
        return { result, success };
    }
}

export interface ISummaryAttempt {
    readonly refSequenceNumber: number;
    readonly summaryTime: number;
    summarySequenceNumber?: number;
}

export class SummarizerHeuristics {
    public lastSent: ISummaryAttempt;
    private _lastAcked: ISummaryAttempt;
    public get lastAcked(): ISummaryAttempt {
        return this._lastAcked;
    }

    public constructor(
        public lastOpSeqNumber: number,
        firstAck: ISummaryAttempt,
    ) {
        this.lastSent = firstAck;
        this._lastAcked = firstAck;
    }

    public ackLastSent() {
        this._lastAcked = this.lastSent;
    }

    public opCountSinceLastSummary(): number {
        return this.lastOpSeqNumber - this.lastAcked.refSequenceNumber;
    }

    public timeSinceLastSummary(): number {
        return Date.now() - this.lastAcked.summaryTime;
    }
}

export class RunningSummarizer {
    public static async start(
        clientId: string,
        onBehalfOfClientId: string,
        logger: ITelemetryLogger,
        summaryWatcher: IClientSummaryWatcher,
        configuration: ISummaryConfiguration,
        tryGenerateSummary: () => Promise<IGeneratedSummaryData | undefined>,
        handleSuccessfulSummary: (ack: ISummaryAckMessage) => Promise<void>,
        heuristics: SummarizerHeuristics,
    ): Promise<RunningSummarizer> {
        const summarizer = new RunningSummarizer(
            clientId,
            onBehalfOfClientId,
            logger,
            summaryWatcher,
            configuration,
            tryGenerateSummary,
            handleSuccessfulSummary,
            heuristics);

        await summarizer.waitStart();
        return summarizer;
    }

    private summarizing = false;
    private summarizeCount: number = 0;
    private pendingCanceller: Deferred<void>;
    private tryWhileSummarizing = false;
    private readonly idleTimer: Timer;
    private readonly summarizeTimer: Timer;
    private readonly pendingAckTimer: Timer;

    private constructor(
        private readonly clientId: string,
        private readonly onBehalfOfClientId: string,
        private readonly logger: ITelemetryLogger,
        private readonly summaryWatcher: IClientSummaryWatcher,
        private readonly configuration: ISummaryConfiguration,
        private readonly tryGenerateSummary: () => Promise<IGeneratedSummaryData | undefined>,
        private readonly handleSuccessfulSummary: (ack: ISummaryAckMessage) => Promise<void>,
        private readonly heuristics: SummarizerHeuristics,
    ) {
        this.idleTimer = new Timer(
            this.configuration.idleTime,
            () => this.trySummarize("idle"));

        this.summarizeTimer = new Timer(
            maxSummarizeTimeoutTime,
            () => this.summarizeTimerHandler(maxSummarizeTimeoutTime, 1));

        this.pendingAckTimer = new Timer(
            this.configuration.maxAckWaitTime,
            () => {
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime: this.configuration.maxAckWaitTime,
                    refSequenceNumber: this.heuristics.lastSent.refSequenceNumber,
                    summarySequenceNumber: this.heuristics.lastSent.summarySequenceNumber,
                    timePending: Date.now() - this.heuristics.lastSent.summaryTime,
                });
                this.pendingCanceller.resolve();
            });

        // start the timer after connecting to the document
        this.idleTimer.start();
    }

    public dispose(): void {
        this.idleTimer.clear();
        this.summarizeTimer.clear();
        this.pendingAckTimer.clear();
        if (this.pendingCanceller) {
            this.pendingCanceller.resolve();
            this.pendingCanceller = undefined;
        }
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
        if (error) {
            return;
        }
        this.heuristics.lastOpSeqNumber = op.sequenceNumber;

        // check for ops requesting summary
        let saveMessage: string | undefined;
        if (op.type === MessageType.Save) {
            saveMessage = `;${op.clientId}: ${op.contents}`;
        }

        this.trySummarize(saveMessage);
    }

    private async waitStart() {
        // wait no longer than ack timeout for all pending
        this.pendingCanceller = new Deferred<void>();
        this.pendingAckTimer.start();
        const maybeLastAck = await Promise.race([
            this.summaryWatcher.waitFlushed(),
            this.pendingCanceller.promise]);
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

    private trySummarize(reason?: string) {
        this.idleTimer.clear();

        if (this.summarizing) {
            // we can't summarize if we are already
            this.tryWhileSummarizing = true;
            return;
        }

        // check if we should summarize; defined summaryReason means we should
        let summaryReason: string | undefined;
        if (reason) {
            summaryReason = reason;
        } else if (this.heuristics.timeSinceLastSummary() > this.configuration.maxTime) {
            summaryReason = "maxTime";
        } else if (this.heuristics.opCountSinceLastSummary() > this.configuration.maxOps) {
            summaryReason = "maxOps";
        }

        if (!summaryReason) {
            // we do not need to summarize yet, but we can start an idle timer
            this.idleTimer.start();
            return;
        }

        // generateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = true;
        this.summarizeTimer.start();

        // tslint:disable-next-line: no-floating-promises
        this.summarize(summaryReason).finally(() => {
            this.summarizing = false;
            this.summarizeTimer.clear();
            this.pendingAckTimer.clear();
            if (this.tryWhileSummarizing) {
                this.tryWhileSummarizing = false;
                this.idleTimer.start();
            }
        });
    }

    private async summarize(reason: string) {
        // wait to generate and send summary
        const summaryData = await this.generateAndSendSummary(reason);
        if (!summaryData.submitted) {
            // did not send the summary op
            return;
        }
        // must be set if submitted
        assert(summaryData.clientSequenceNumber);

        this.heuristics.lastSent = {
            refSequenceNumber: summaryData.referenceSequenceNumber,
            summaryTime: Date.now(),
        };

        this.pendingCanceller = new Deferred<void>();
        this.pendingAckTimer.start();
        const summary = this.summaryWatcher.watchSummary(summaryData.clientSequenceNumber);

        // wait for broadcast
        const summaryOp = await Promise.race([summary.waitBroadcast(), this.pendingCanceller.promise]);
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
        const ackNack = await Promise.race([summary.waitAckNack(), this.pendingCanceller.promise]);
        if (!ackNack) {
            return;
        }
        this.logger.sendTelemetryEvent({
            eventName: ackNack.type === MessageType.SummaryAck ? "SummaryAck" : "SummaryNack",
            category: ackNack.type === MessageType.SummaryAck ? "generic" : "error",
            timeWaiting: Date.now() - this.heuristics.lastSent.summaryTime,
            summarySequenceNumber: ackNack.contents.summaryProposal.summarySequenceNumber,
            message: ackNack.type === MessageType.SummaryNack ? ackNack.contents.errorMessage : undefined,
            handle: ackNack.type === MessageType.SummaryAck ? ackNack.contents.handle : undefined,
        });

        // update for success
        if (ackNack.type === MessageType.SummaryAck) {
            this.heuristics.ackLastSent();
            await this.handleSuccessfulSummary(ackNack);
        }
    }

    private async generateAndSendSummary(message: string): Promise<IGeneratedSummaryData | undefined> {
        const summarizingEvent = PerformanceEvent.start(this.logger, {
            eventName: "Summarizing",
            message,
            summarizeCount: ++this.summarizeCount,
            timeSinceLastAttempt: Date.now() - this.heuristics.lastSent.summaryTime,
            timeSinceLastSummary: Date.now() - this.heuristics.lastAcked.summaryTime,
        });

        // wait for generate/send summary
        const summaryData = await this.tryGenerateSummary();
        this.summarizeTimer.clear();

        if (!summaryData) {
            summarizingEvent.cancel();
            return;
        }

        const telemetryProps = {
            refSequenceNumber: summaryData.referenceSequenceNumber,
            handle: summaryData.handle,
            clientSequenceNumber: summaryData.clientSequenceNumber,
            ...summaryData.summaryStats,
            opsSinceLastAttempt: summaryData.referenceSequenceNumber - this.heuristics.lastSent.refSequenceNumber,
            opsSinceLastSummary: summaryData.referenceSequenceNumber - this.heuristics.lastAcked.refSequenceNumber,
        };

        if (summaryData.submitted) {
            summarizingEvent.end(telemetryProps);
        } else {
            summarizingEvent.cancel({...telemetryProps, category: "error"});
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
