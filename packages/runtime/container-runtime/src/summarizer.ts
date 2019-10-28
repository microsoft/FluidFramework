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
import { ChildLogger, Deferred, PerformanceEvent } from "@microsoft/fluid-core-utils";
import {
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISnapshotTree,
    ISummaryAck,
    ISummaryConfiguration,
    ISummaryContent,
    ISummaryNack,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import { ContainerRuntime, IGeneratedSummaryData } from "./containerRuntime";

// send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // double and resend 5 times

interface ISummaryMessage extends ISequencedDocumentMessage {
    type: MessageType.Summarize;
    contents: ISummaryContent;
}

interface ISummaryAckMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryAck;
    contents: ISummaryAck;
}

interface ISummaryNackMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryNack;
    contents: ISummaryNack;
}

interface ISummary {
    readonly clientId: string;
    readonly refSequenceNumber: number;
    isBroadcast(): boolean;
    isAckedNacked(): boolean;
    waitBroadcast(): Promise<ISummaryMessage>;
    waitAckNack(): Promise<ISummaryAckMessage | ISummaryNackMessage>;
}

enum SummaryState {
    Local = 0,
    Broadcast = 1,
    Acked = 2,
    Nacked = -1,
}

class Summary implements ISummary {
    public static createLocal(clientId: string, refSequenceNumber: number) {
        return new Summary(clientId, refSequenceNumber);
    }
    public static createFromOp(op: ISummaryMessage) {
        const summary = new Summary(op.clientId, op.referenceSequenceNumber);
        summary.broadcast(op);
        return summary;
    }

    private state = SummaryState.Local;

    private _summaryOp?: ISummaryMessage;
    private _summaryAckNack?: ISummaryAckMessage | ISummaryNackMessage;

    private readonly defSummaryOp = new Deferred<void>();
    private readonly defSummaryAck = new Deferred<void>();

    public get summaryOp() { return this._summaryOp; }
    public get summaryAckNack() { return this._summaryAckNack; }

    private constructor(
        public readonly clientId: string,
        public readonly refSequenceNumber: number) {}

    public isBroadcast(): boolean {
        return this.state !== SummaryState.Local;
    }
    public isAckedNacked(): boolean {
        return this.state === SummaryState.Acked || this.state === SummaryState.Nacked;
    }

    public broadcast(op: ISummaryMessage) {
        assert(this.state === SummaryState.Local);
        this._summaryOp = op;
        this.defSummaryOp.resolve();
        this.state = SummaryState.Broadcast;
        return true;
    }

    public ackNack(op: ISummaryAckMessage | ISummaryNackMessage) {
        assert(this.state === SummaryState.Broadcast);
        this._summaryAckNack = op;
        this.defSummaryAck.resolve();
        this.state = op.type === MessageType.SummaryAck ? SummaryState.Acked : SummaryState.Nacked;
        return true;
    }

    public async waitBroadcast(): Promise<ISummaryMessage> {
        if (!this.isBroadcast()) {
            await this.defSummaryOp.promise;
        }
        return this._summaryOp;
    }

    public async waitAckNack(): Promise<ISummaryAckMessage | ISummaryNackMessage> {
        if (!this.isAckedNacked()) {
            await this.defSummaryAck.promise;
        }
        return this._summaryAckNack;
    }
}

class SummaryDds {
    // key: refSeqNum
    private readonly localSummaries = new Map<number, Summary>();
    // key: summarySeqNum
    private readonly pendingSummaries = new Map<number, Summary>();
    // key: summarySeqNum
    private readonly ackedSummaries = new Map<number, Summary>();
    // key: summarySeqNum
    private readonly nacks = new Map<number, ISummaryNackMessage>();
    private readonly initialAck = new Deferred<ISummaryAckMessage | undefined>();

    private initialized = false;
    public get isInitialized() { return this.initialized; }

    public constructor(
        public readonly initialSequenceNumber: number,
        private readonly logger: ITelemetryLogger,
    ) {
        if (this.initialSequenceNumber === 0) {
            this.initialized = true;
            this.initialAck.resolve();
        }
    }

    public waitInitialized(): Promise<ISummaryAckMessage | undefined> {
        return this.initialAck.promise;
    }

    public async waitFlushed(): Promise<void> {
        while (this.pendingSummaries.size > 0) {
            const promises = Array.from(this.pendingSummaries, ([, summary]) => summary.waitAckNack());
            await Promise.all(promises);
        }
    }

    public addLocalSummary(clientId: string, refSequenceNumber: number): ISummary {
        const summary = Summary.createLocal(clientId, refSequenceNumber);
        this.localSummaries.set(summary.refSequenceNumber, summary);
        return summary;
    }

    public handleOp(op: ISequencedDocumentMessage) {
        switch (op.type) {
            case MessageType.Summarize: {
                this.handleSummaryOp(op as ISummaryMessage);
                return;
            }
            case MessageType.SummaryAck: {
                this.handleSummaryAck(op as ISummaryAckMessage);
                return;
            }
            case MessageType.SummaryNack: {
                this.handleSummaryNack(op as ISummaryNackMessage);
                return;
            }
            default: {
                return;
            }
        }
    }

    private handleSummaryOp(op: ISummaryMessage) {
        let summary = this.localSummaries.get(op.referenceSequenceNumber);
        if (summary && summary.clientId === op.clientId) {
            summary.broadcast(op);
            this.localSummaries.delete(op.referenceSequenceNumber);
        } else {
            summary = Summary.createFromOp(op);
        }
        this.pendingSummaries.set(op.sequenceNumber, summary);

        // initialize
        if (!this.initialized && summary.refSequenceNumber === this.initialSequenceNumber) {
            summary.waitAckNack().then((ackNack) => this.checkInitialized(ackNack)).catch((error) => {
                this.logger.sendErrorEvent({ eventName: "ErrorCheckingInitialized" }, error);
            });
        }
    }

    private handleSummaryAck(op: ISummaryAckMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        const summary = this.pendingSummaries.get(seq);
        assert(summary); // we should never see an ack without an op
        summary.ackNack(op);
        this.pendingSummaries.delete(seq);
        this.ackedSummaries.set(seq, summary);
    }

    private handleSummaryNack(op: ISummaryNackMessage) {
        const seq = op.contents.summaryProposal.summarySequenceNumber;
        const summary = this.pendingSummaries.get(seq);
        if (summary) {
            summary.ackNack(op);
            this.pendingSummaries.delete(seq);
        }
        this.nacks.set(seq, op);
    }

    private checkInitialized(ackNack: ISummaryAckMessage | ISummaryNackMessage) {
        if (this.initialized) {
            return;
        }
        if (ackNack.type === MessageType.SummaryAck) {
            this.initialized = true;
            this.initialAck.resolve(ackNack);
        }
    }
}

interface ISummaryAttempt {
    readonly refSequenceNumber: number;
    readonly summaryTime: number;
}

export class Summarizer implements IComponentRouter, IComponentLoadable, IComponentRunnable {
    public get IComponentRouter() { return this; }
    public get IComponentRunnable() { return this; }
    public get IComponentLoadable() { return this; }

    private summarizing = false;
    private summarizeCount: number = 0;
    private lastOpSeqNumber: number;
    private pendingCancelDeferred: Deferred<void>;
    private lastAttemptedSummary: ISummaryAttempt;
    private lastSuccessfulSummary: ISummaryAttempt;

    private idleTimer: Timer;
    private pendingAckTimer: Timer;
    private readonly summarizeTimer: Timer;
    private readonly runDeferred = new Deferred<void>();
    private readonly logger: ITelemetryLogger;
    private configuration: ISummaryConfiguration;

    private onBehalfOfClientId: string;
    private everConnected = false;

    private readonly summaryDds: SummaryDds;

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        private readonly configurationGetter: () => ISummaryConfiguration,
        private readonly generateSummary: () => Promise<IGeneratedSummaryData>,
        private readonly refreshBaseSummary: (snapshot: ISnapshotTree) => void,
    ) {
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");
        this.summaryDds = new SummaryDds(
            this.runtime.deltaManager.initialSequenceNumber,
            this.logger);
        this.runtime.deltaManager.inbound.on("op", (op) => this.summaryDds.handleOp(op as ISequencedDocumentMessage));

        // try to determine if the runtime has ever been connected
        if (this.runtime.connected) {
            this.everConnected = true;
        } else {
            this.runtime.once("connected", () => this.everConnected = true);
        }
        this.runtime.on("disconnected", () => {
            // sometimes the initial connection state is raised as disconnected
            if (!this.everConnected) {
                return;
            }
            this.logger.sendTelemetryEvent({ eventName: "SummarizerDisconnected" });
            this.runDeferred.resolve();
        });

        this.summarizeTimer = new Timer(
            () => this.summarizeTimerHandler(maxSummarizeTimeoutTime, 1),
            maxSummarizeTimeoutTime);
    }

    public async run(onBehalfOf: string): Promise<void> {
        this.onBehalfOfClientId = onBehalfOf;

        if (!this.runtime.connected) {
            if (!this.everConnected) {
                const waitConnected = new Promise((resolve) => this.runtime.once("connected", resolve));
                await Promise.race([waitConnected, this.runDeferred.promise]);
                if (!this.runtime.connected) {
                    // if still not connected, no need to start running
                    this.logger.sendTelemetryEvent({ eventName: "NeverConnectedBeforeRun", onBehalfOf });
                    return;
                }
            } else {
                // we will not try to reconnect, so we are done running
                this.logger.sendTelemetryEvent({ eventName: "DisconnectedBeforeRun", onBehalfOf });
                return;
            }
        }

        if (this.runtime.summarizerClientId !== onBehalfOf) {
            // this calculated summarizer differs from parent
            // parent SummaryManager should prevent this from happening
            this.logger.sendErrorEvent({
                eventName: "ParentIsNotSummarizer",
                onBehalfOf,
                expectedSummarizer: this.runtime.summarizerClientId,
            });
            return;
        }

        // need to wait until we are connected to get config and create timers
        this.configuration = this.configurationGetter();

        this.idleTimer = new Timer(
            () => this.trySummarize("idle"),
            this.configuration.idleTime);

        this.pendingAckTimer = new Timer(
            () => {
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime: this.configuration.maxAckWaitTime,
                    refSequenceNumber: this.lastAttemptedSummary.refSequenceNumber,
                });
                this.pendingCancelDeferred.resolve();
            }, this.configuration.maxAckWaitTime);

        // initialize values and first ack (time is not exact)
        const maybeInitialAck = await this.summaryDds.waitInitialized();

        this.lastSuccessfulSummary = {
            refSequenceNumber: this.summaryDds.initialSequenceNumber,
            summaryTime: maybeInitialAck ? maybeInitialAck.timestamp : Date.now(),
        };

        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.summaryDds.initialSequenceNumber,
            initHandle: maybeInitialAck ? maybeInitialAck.contents.handle : undefined,
        });

        this.pendingAckTimer.start();
        await Promise.race([this.summaryDds.waitFlushed(), this.pendingCancelDeferred.promise]);

        // start the timer after connecting to the document
        this.idleTimer.start();

        // listen for system ops
        this.runtime.deltaManager.inbound.on("op", (op) => this.handleSystemOp(op as ISequencedDocumentMessage));

        this.runtime.on("batchEnd", (error: any, op: ISequencedDocumentMessage) => this.handleOp(error, op));

        await this.runDeferred.promise;

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
        this.runDeferred.resolve();
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
        this.idleTimer.clear();
        this.summarizeTimer.clear();
        this.pendingAckTimer.clear();
    }

    private handleSystemOp(op: ISequencedDocumentMessage) {
        switch (op.type) {
            case MessageType.ClientLeave: {
                const leavingClientId = JSON.parse((op as ISequencedDocumentSystemMessage).data) as string;
                if (leavingClientId === this.runtime.clientId || leavingClientId === this.onBehalfOfClientId) {
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

    private handleOp(error: any, op: ISequencedDocumentMessage) {
        if (error) {
            return;
        }

        // check for ops requesting summary
        let saveMessage: string | undefined;
        this.lastOpSeqNumber = op.sequenceNumber;
        if (op.type === MessageType.Save) {
            saveMessage = `;${op.clientId}: ${op.contents}`;
        }

        this.trySummarize(saveMessage);
    }

    private trySummarize(message?: string) {
        this.idleTimer.clear();

        if (this.summarizing) {
            // we can't summarize if we are already
            return;
        }

        if (this.onBehalfOfClientId !== this.runtime.summarizerClientId) {
            // we are no longer the summarizer, we should stop ourself
            this.stop("parentNoLongerSummarizer");
            return;
        }

        // check if we should summarize
        let summaryMessage = message;
        const opCountSinceLastSummary = this.lastOpSeqNumber - this.lastSuccessfulSummary.refSequenceNumber;
        const timeSinceLastSummary = Date.now() - this.lastSuccessfulSummary.summaryTime;

        if (message) {
            summaryMessage = message;
        } else if (timeSinceLastSummary > this.configuration.maxTime) {
            summaryMessage = "maxTime";
        } else if (opCountSinceLastSummary > this.configuration.maxOps) {
            summaryMessage = "maxOps";
        }

        if (!summaryMessage) {
            // we do not need to summarize yet, but we can start an idle timer
            this.idleTimer.start();
            return;
        }

        // generateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = true;
        this.summarizeTimer.start();

        // tslint:disable-next-line: no-floating-promises
        this.summarize(summaryMessage).finally(() => {
            this.pendingAckTimer.clear();
            this.summarizeTimer.clear();
            this.summarizing = false;
        });
    }

    private async summarize(message: string) {
        const summarizingEvent = PerformanceEvent.start(this.logger, {
            eventName: "Summarizing",
            message,
            summarizeCount: ++this.summarizeCount,
            timeSinceLastAttempt: Date.now() - this.lastAttemptedSummary.summaryTime,
            timeSinceLastSummary: Date.now() - this.lastSuccessfulSummary.summaryTime,
        });

        const summaryData = await this.generateSummary();
        this.summarizeTimer.clear();

        const telemetryProps = {
            refSequenceNumber: summaryData.sequenceNumber,
            ...summaryData.summaryStats,
            opsSinceLastAttempt: summaryData.sequenceNumber - this.lastAttemptedSummary.refSequenceNumber,
            opsSinceLastSummary: summaryData.sequenceNumber - this.lastSuccessfulSummary.refSequenceNumber,
        };
        if (!summaryData.submitted) {
            // did not send the summary op
            summarizingEvent.cancel({...telemetryProps, category: "error"});
            return;
        }

        summarizingEvent.end(telemetryProps);

        this.lastAttemptedSummary = {
            refSequenceNumber: summaryData.sequenceNumber,
            summaryTime: Date.now(),
        };

        this.pendingCancelDeferred = new Deferred<void>();
        this.pendingAckTimer.start();
        const summary = this.summaryDds.addLocalSummary(this.runtime.clientId, summaryData.sequenceNumber);

        // wait for broadcast
        const summaryOp = await Promise.race([summary.waitBroadcast(), this.pendingCancelDeferred.promise]);
        if (!summaryOp) {
            return;
        }
        this.logger.sendTelemetryEvent({
            eventName: "SummaryOp",
            timeWaiting: Date.now() - this.lastAttemptedSummary.summaryTime,
            refSequenceNumber: summaryOp.referenceSequenceNumber,
            summarySequenceNumber: summaryOp.sequenceNumber,
            handle: summaryOp.contents.handle,
        });

        // wait for ack/nack
        const ackNack = await Promise.race([summary.waitAckNack(), this.pendingCancelDeferred.promise]);
        if (!ackNack) {
            return;
        }
        this.logger.sendTelemetryEvent({
            eventName: ackNack.type === MessageType.SummaryAck ? "SummaryAck" : "SummaryNack",
            category: ackNack.type === MessageType.SummaryAck ? "generic" : "error",
            timeWaiting: Date.now() - this.lastAttemptedSummary.summaryTime,
            summarySequenceNumber: ackNack.contents.summaryProposal.summarySequenceNumber,
            message: ackNack.type === MessageType.SummaryNack ? ackNack.contents.errorMessage : undefined,
            handle: ackNack.type === MessageType.SummaryAck ? ackNack.contents.handle : undefined,
        });

        // update for success
        if (ackNack.type === MessageType.SummaryAck) {
            this.lastSuccessfulSummary = this.lastAttemptedSummary;

            // we have to call get version to get the treeId for r11s; this isnt needed
            // for odsp currently, since their treeId is undefined
            const versionsResult = await this.setOrLogError("SummarizerFailedToGetVersion",
                () => this.runtime.storage.getVersions(ackNack.contents.handle, 1),
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

    private summarizeTimerHandler(time: number, count: number) {
        this.logger.sendErrorEvent({
            eventName: "SummarizeTimeout",
            timeoutTime: time,
            timeoutCount: count,
        });
        if (count < maxSummarizeTimeoutCount) {
            // double and start a new timer
            const nextTime = time * 2;
            this.summarizeTimer.start(() => this.summarizeTimerHandler(nextTime, count + 1), nextTime);
        }
    }
}

class Timer {
    public get hasTimer() {
        return !!this.timer;
    }

    private timer?: NodeJS.Timeout;

    constructor(
        private readonly defaultHandler: () => void,
        private readonly defaultTimeout: number) {}

    public start(handler: () => void = this.defaultHandler, timeout: number = this.defaultTimeout) {
        this.clear();
        this.timer = setTimeout(() => this.wrapHandler(handler), timeout);
    }

    public clear() {
        if (!this.timer) {
            return;
        }
        clearTimeout(this.timer);
        this.timer = undefined;
    }

    private wrapHandler(handler: () => void) {
        // run clear first, in case the handler decides to start again
        this.clear();
        handler();
    }
}
