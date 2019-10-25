/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { ChildLogger, Deferred, PerformanceEvent } from "@microsoft/fluid-core-utils";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
    ISummaryAck,
    ISummaryConfiguration,
    ISummaryContent,
    ISummaryNack,
    MessageType,
    ISequencedDocumentSystemMessage,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import { ContainerRuntime, IGeneratedSummaryData } from "./containerRuntime";

// send some telemetry if generate summary takes too long
const maxSummarizeTimeoutTime = 20000; // 20 sec
const maxSummarizeTimeoutCount = 5; // double and resend 5 times

/**
 * Wrapper interface holding summary details for a given op
 */
interface IOpSummaryDetails {
    // Whether we should summarize at the given op
    shouldSummarize: boolean;

    // The message to include with the summarize
    message: string;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideSummarizer>> { }
}

export interface IProvideSummarizer {
    readonly ISummarizer: ISummarizer;
}

export interface ISummarizer extends IProvideSummarizer {
    /**
     * Runs the summarizer on behalf of another clientId. In this case it will only run so long as the given
     * clientId is the elected summarizer and will stop once it is not.
     */
    run(onBehalfOf: string): Promise<void>;

    /**
     * Stops the summarizer by closing its container and resolving its run promise.
     * @param reason - reason for stopping
     */
    stop(reason?: string): void;
}

interface ISummary {
    clientId: string;
    refSequenceNumber: number;
    sequenceNumber: number;
    summaryContent: ISummaryContent;
    timestamp: number;
}

interface ISummaryAckMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryAck;
    summaryOp: ISummary;
    contents: ISummaryAck;
}

interface ISummaryNackMessage extends ISequencedDocumentMessage {
    type: MessageType.SummaryNack;
    summaryOp?: ISummary;
    contents: ISummaryNack;
}

interface ISummaryWaiter {
    wait(): Promise<ISummaryAckMessage | ISummaryNackMessage>;
    cancel(): void;
}

class SummaryWaiter implements ISummaryWaiter {
    public sequenceNumber?: number;
    private readonly deferred = new Deferred<ISummaryAckMessage | ISummaryNackMessage>();
    public constructor(
        public readonly refSequenceNUmber: number,
        private readonly canceller: (waiter: SummaryWaiter) => void) {}

    public wait(): Promise<ISummaryAckMessage | ISummaryNackMessage> {
        return this.deferred.promise;
    }
    public resolve(ackedSummary: ISummaryAckMessage | ISummaryNackMessage) {
        this.deferred.resolve(ackedSummary);
    }
    public cancel() {
        this.canceller(this);
    }
}

enum SummaryDdsState {
    Initial = 0,
    Ready = 1,
    Disposed = -1,
}

class SummaryDds {
    private state = SummaryDdsState.Initial;
    private readonly pendingSummaries = new Map<number, ISummary>();
    private readonly nackedSummaries = new Map<number, ISummaryNackMessage>();

    private readonly localWaiters = new Map<number, SummaryWaiter>();
    private readonly broadcastWaiters = new Map<number, SummaryWaiter>();

    private clientId?: string;
    private readonly firstSummary = new Deferred<ISummaryAckMessage>();
    private latestSummary?: ISummaryAckMessage;

    public get initialized() { return this.clientId && !this.disposed; }
    public get ready() { return this.state === SummaryDdsState.Ready; }
    public get disposed() { return this.state === SummaryDdsState.Disposed; }
    public get latestRefSequenceNumber() {
        return this.latestSummary
            ? this.latestSummary.summaryOp.refSequenceNumber
            : this.initialSequenceNumber;
    }

    public constructor(public readonly initialSequenceNumber: number) {}

    public initialize(clientId: string): Promise<ISummaryAckMessage> {
        this.throwIfDisposed();
        if (this.initialized) {
            throw Error("already initialized");
        }
        this.clientId = clientId;
        return this.firstSummary.promise;
    }

    public waitLocalAck(refSequenceNumber: number): ISummaryWaiter | undefined {
        this.throwIfDisposed();
        if (!this.ready) {
            throw Error("not ready");
        }

        if (refSequenceNumber < this.initialSequenceNumber) {
            // earlier than summary initially loaded from
            throw Error("refSequenceNumber < initialSequenceNumber");
        }

        if (this.latestSummary && refSequenceNumber <= this.latestRefSequenceNumber) {
            // already acked at that reference sequence number
            return;
        }

        const summaryWaiter = new SummaryWaiter(refSequenceNumber, (waiter) => this.cancelWaiter(waiter));
        this.localWaiters.set(refSequenceNumber, summaryWaiter);
        return summaryWaiter;
    }

    public handleOp(op: ISequencedDocumentMessage) {
        this.throwIfDisposed();
        switch (op.type) {
            case MessageType.Summarize: {
                this.handleSummaryOp(op);
                return;
            }
            case MessageType.SummaryAck: {
                this.handleSummaryAck(op);
                return;
            }
            case MessageType.SummaryNack: {
                this.handleSummaryNack(op);
                return;
            }
            default: {
                return;
            }
        }
    }

    public dispose() {
        this.throwIfDisposed();
        this.state = SummaryDdsState.Disposed;
    }

    private throwIfDisposed() {
        if (this.disposed) {
            throw Error("already disposed");
        }
    }

    private handleSummaryOp(op: ISequencedDocumentMessage) {
        this.pendingSummaries.set(op.sequenceNumber, {
            clientId: op.clientId,
            refSequenceNumber: op.referenceSequenceNumber,
            sequenceNumber: op.sequenceNumber,
            summaryContent: op.contents as ISummaryContent,
            timestamp: op.timestamp,
        });

        // create/update any waiters
        if (this.clientId === op.clientId) {
            let waiter = this.localWaiters.get(op.referenceSequenceNumber);
            if (waiter) {
                this.localWaiters.delete(op.referenceSequenceNumber);
            } else {
                waiter = new SummaryWaiter(op.referenceSequenceNumber, (w) => this.cancelWaiter(w));
            }
            waiter.sequenceNumber = op.sequenceNumber;
            this.broadcastWaiters.set(op.sequenceNumber, waiter);
        }
    }

    private handleSummaryAck(op: ISequencedDocumentMessage) {
        const ack = op.contents as ISummaryAck;
        const pendingSummary = this.pendingSummaries.get(ack.summaryProposal.summarySequenceNumber);
        if (!pendingSummary) {
            // this is an error case, we should never see an ack without an op
            return;
        }

        const ackedSummary: ISummaryAckMessage = {
            ...op,
            type: MessageType.SummaryAck,
            summaryOp: pendingSummary,
        };

        this.latestSummary = ackedSummary;
        this.pendingSummaries.clear(); // all others should nack
        this.nackedSummaries.clear();

        // resolve initial summary
        if (!this.ready) {
            assert.strictEqual(pendingSummary.refSequenceNumber, this.initialSequenceNumber);
            this.firstSummary.resolve(ackedSummary);
            this.state = SummaryDdsState.Ready;
        }

        // resolve any waiters
        const waiter = this.broadcastWaiters.get(pendingSummary.sequenceNumber);
        if (waiter) {
            this.broadcastWaiters.delete(pendingSummary.sequenceNumber);
            waiter.resolve(ackedSummary);
        }
    }

    private handleSummaryNack(op: ISequencedDocumentMessage) {
        const nack = op.contents as ISummaryNack;
        const pendingSummary = this.pendingSummaries.get(nack.summaryProposal.summarySequenceNumber);
        const nackedSummary: ISummaryNackMessage = {
            ...op,
            type: MessageType.SummaryNack,
            summaryOp: pendingSummary,
        };

        if (pendingSummary) {
            this.pendingSummaries.delete(pendingSummary.sequenceNumber);

            // resolve any waiters
            const waiter = this.broadcastWaiters.get(pendingSummary.sequenceNumber);
            if (waiter) {
                this.localWaiters.delete(pendingSummary.sequenceNumber);
                waiter.resolve(nackedSummary);
            }
        }

        this.nackedSummaries.set(nackedSummary.contents.summaryProposal.summarySequenceNumber, nackedSummary);
    }

    private cancelWaiter(waiter: SummaryWaiter) {
        const waiterMap = waiter.sequenceNumber ? this.broadcastWaiters : this.localWaiters;
        const mapKey = waiter.sequenceNumber || waiter.refSequenceNUmber;
        const summaryWaiter = waiterMap.get(mapKey);
        if (summaryWaiter) {
            waiterMap.delete(mapKey);
            summaryWaiter.resolve(undefined);
        }
    }
}

class Summarizer implements IComponentLoadable, ISummarizer {
    public get ISummarizer() { return this; }
    public get IComponentLoadable() { return this; }

    private summarizeCount: number = 0;
    private lastSummaryTime: number;
    private lastSummaryRefSeqNumber: number;
    private lastOpSeqNumber: number;
    private requestedSaveMessage?: string;
    private summarizing = false;
    private idleTimer: Timer;
    private pendingAckTimer: Timer;
    private readonly summarizeTimer: Timer;
    private readonly runDeferred = new Deferred<void>();
    private readonly logger: ITelemetryLogger;
    private configuration: ISummaryConfiguration;
    private localWaiter?: ISummaryWaiter;

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
        this.summaryDds = new SummaryDds(this.runtime.deltaManager.initialSequenceNumber);
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
                    refSequenceNumber: this.lastSummaryRefSeqNumber,
                });
                this.localWaiter.cancel();
            }, this.configuration.maxAckWaitTime);

        // initialize values and first ack (time is not exact)
        const initialAck = await this.summaryDds.initialize(this.runtime.clientId);

        this.lastSummaryRefSeqNumber = initialAck.summaryOp.refSequenceNumber;
        this.lastSummaryTime = initialAck.summaryOp.timestamp;

        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.lastSummaryRefSeqNumber,
            initHandle: initialAck.contents.handle,
        });

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
        const timeSinceLastSummary = Date.now() - this.lastSummaryTime;
        const opCountSinceLastSummary = this.lastOpSeqNumber - this.lastSummaryRefSeqNumber;

        if (this.requestedSaveMessage) {
            summaryMessage = this.requestedSaveMessage;
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
            if (this.localWaiter) {
                this.localWaiter.cancel();
                this.localWaiter = undefined;
            }
        });
    }

    private async summarize(message: string) {
        const summarizingEvent = PerformanceEvent.start(this.logger, {
            eventName: "Summarizing",
            message,
            summarizeCount: ++this.summarizeCount,
            timeSinceLastSummary: Date.now() - this.lastSummaryTime,
        });

        const summaryData = await this.generateSummary();
        this.summarizeTimer.clear();

        const telemetryProps = {
            sequenceNumber: summaryData.sequenceNumber,
            ...summaryData.summaryStats,
            opsSinceLastSummary: summaryData.sequenceNumber - this.lastSummaryRefSeqNumber,
        };
        if (!summaryData.submitted) {
            // did not send the summary op
            summarizingEvent.cancel({...telemetryProps, category: "error"});
            return;
        }

        summarizingEvent.end(telemetryProps);

        this.lastSummaryTime = Date.now();
        this.lastSummaryRefSeqNumber = summaryData.sequenceNumber;

        this.pendingAckTimer.start();
        this.localWaiter = this.summaryDds.waitLocalAck(this.lastSummaryRefSeqNumber);

        // wait for ack/nack
        const ack = await this.localWaiter.wait();
        this.localWaiter = undefined;

        this.logger.sendTelemetryEvent({
            eventName: ack.type === MessageType.SummaryAck ? "SummaryAck" : "SummaryNack",
            category: ack.type === MessageType.SummaryAck ? "generic" : "error",
            timePending: Date.now() - this.lastSummaryTime,
            summarySequenceNumber: ack.contents.summaryProposal.summarySequenceNumber,
            message: ack.type === MessageType.SummaryNack ? ack.contents.errorMessage : undefined,
        });

        // refresh base snapshot
        // it might be nice to do this in the container in the future, and maybe for all
        // clients, not just the summarizer
        if (ack.type === MessageType.SummaryAck) {
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
