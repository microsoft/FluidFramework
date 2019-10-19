/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { ChildLogger, Deferred, PerformanceEvent } from "@microsoft/fluid-core-utils";
import {
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISnapshotTree,
    ISummaryAck,
    ISummaryConfiguration,
    ISummaryNack,
    MessageType,
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

    // Whether we can start idle timer
    canStartIdleTimer: boolean;

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

export class Summarizer implements IComponentLoadable, ISummarizer {

    public get ISummarizer() { return this; }
    public get IComponentLoadable() { return this; }

    private lastSummaryTime: number;
    private lastSummarySeqNumber: number;
    private summarizing = false;
    private summaryPending = false;
    private opSinceSummarize = false;
    private pendingSummarySequenceNumber?: number;
    private idleTimer: Timer;
    private pendingAckTimer: Timer;
    private readonly summarizeTimer: Timer;
    private readonly runDeferred = new Deferred<void>();
    private readonly logger: ITelemetryLogger;
    private configuration: ISummaryConfiguration;

    private deferBroadcast: Deferred<void>;
    private deferAck: Deferred<void>;

    private onBehalfOfClientId: string;
    private everConnected = false;

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        private readonly configurationGetter: () => ISummaryConfiguration,
        private readonly generateSummary: () => Promise<IGeneratedSummaryData>,
        private readonly refreshBaseSummary: (snapshot: ISnapshotTree) => void,
    ) {
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");

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
            } else {
                // we will not try to reconnect, so we are done running
                this.logger.sendTelemetryEvent({ eventName: "DisconnectedBeforeRun" });
                return;
            }
        }

        if (this.runtime.summarizerClientId !== onBehalfOf) {
            return;
        }

        // need to wait until we are connected
        this.configuration = this.configurationGetter();

        this.idleTimer = new Timer(
            () => this.summarize("idle"),
            this.configuration.idleTime);

        this.pendingAckTimer = new Timer(
            () => {
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime: this.configuration.maxAckWaitTime,
                    pendingSummarySequenceNumber: this.pendingSummarySequenceNumber,
                });
                this.stopPending();
            }, this.configuration.maxAckWaitTime);

        // initialize values (not exact)
        this.lastSummarySeqNumber = this.runtime.deltaManager.initialSequenceNumber;
        this.lastSummaryTime =  Date.now();

        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.lastSummarySeqNumber,
        });

        // start the timer after connecting to the document
        this.idleTimer.start();

        // listen for summary ops
        this.runtime.deltaManager.inbound.on("op", (op) => this.handleSystemOp(op as ISequencedDocumentMessage));

        this.runtime.on("batchEnd", (error: any, op: ISequencedDocumentMessage) => this.handleOp(error, op));

        await this.runDeferred.promise;

        // cleanup
        this.idleTimer.clear();
        this.summarizeTimer.clear();
        this.opSinceSummarize = false;
        this.stopPending();
    }

    public stop(reason?: string) {
        this.logger.sendTelemetryEvent({
            eventName: "StoppingSummarizer",
            onBehalfOf: this.onBehalfOfClientId,
            reason,
        });
        this.runDeferred.resolve();
        this.runtime.closeFn();
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

    private async handleSystemOp(op: ISequencedDocumentMessage) {
        // synchronously handle quorum ops
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
                this.handleOp(undefined, op);
                return;
            }
            default: // fall out of switch
        }

        // ignore all other ops if not pending
        if (!this.summaryPending) {
            return;
        }
        // listen for the broadcast of this summary op
        if (op.type === MessageType.Summarize) {
            // When pending, we need to wait until the lastSummarySeqNumber is set before
            // trying to find our broadcast summary op.  So we will essentially defer all
            // Summarize op handling here until deferBroadcast is resolved.
            await this.deferBroadcast.promise;
            if (!this.pendingSummarySequenceNumber) {
                // should only be 1 summary op per client with same ref seq number
                if (op.clientId === this.runtime.clientId && op.referenceSequenceNumber === this.lastSummarySeqNumber) {
                    this.logger.sendTelemetryEvent({
                        eventName: "PendingSummaryBroadcast",
                        timeWaitingForBroadcast: Date.now() - this.lastSummaryTime,
                        pendingSummarySequenceNumber: op.sequenceNumber,
                    });
                    this.pendingSummarySequenceNumber = op.sequenceNumber;
                    // Now we indicate that we are okay to start listening for the summary ack/nack
                    // of this summary op, because we have set the pendingSummarySequenceNumber.
                    this.deferAck.resolve();
                }
            }
        }
        // listen for the ack/nack of this summary op
        if (op.type === MessageType.SummaryAck || op.type === MessageType.SummaryNack) {
            // Since this handler is async, we need to wait until the pendingSummarySequenceNumber is
            // set from the broadcast summary op before handling summary acks/nacks.  We use
            // this deferred object to ensure that our broadcast summary op is handled before our
            // summary ack/nack is handled.
            await this.deferAck.promise;
            if (this.pendingSummarySequenceNumber) {
                const ack = op.contents as ISummaryAck | ISummaryNack;
                if (ack.summaryProposal.summarySequenceNumber === this.pendingSummarySequenceNumber) {
                    if (op.type === MessageType.SummaryAck) {
                        this.logger.sendTelemetryEvent({
                            eventName: "SummaryAck",
                            timePending: Date.now() - this.lastSummaryTime,
                            summarySequenceNumber: ack.summaryProposal.summarySequenceNumber,
                        });
                    } else {
                        this.logger.sendErrorEvent({
                            eventName: "SummaryNack",
                            timePending: Date.now() - this.lastSummaryTime,
                            summarySequenceNumber: ack.summaryProposal.summarySequenceNumber,
                            message: (ack as ISummaryNack).errorMessage,
                        });
                    }

                    if (op.type === MessageType.SummaryAck) {
                        // refresh base snapshot
                        // it might be nice to do this in the container in the future, and maybe for all
                        // clients, not just the summarizer
                        const handle = (ack as ISummaryAck).handle;

                        // we have to call get version to get the treeId for r11s; this isnt needed
                        // for odsp currently, since their treeId is undefined
                        const versionsResult = await this.setOrLogError("SummarizerFailedToGetVersion",
                            () => this.runtime.storage.getVersions(handle, 1),
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
                    this.stopPending();
                }
            }
        }
    }

    private handleOp(error: any, op: ISequencedDocumentMessage) {
        if (error) {
            return;
        }

        this.idleTimer.clear();

        // Get the summary details for the given op
        const lastOpSummaryDetails = this.getOpSummaryDetails(op);

        if (lastOpSummaryDetails.shouldSummarize) {
            // Summarize immediately if requested
            this.summarize(lastOpSummaryDetails.message);
        } else if (lastOpSummaryDetails.canStartIdleTimer) {
            // Otherwise detect when we idle to trigger the snapshot
            this.idleTimer.start();
        }
    }

    private summarize(message: string) {
        // it shouldn't be possible to enter here if already summarizing or pending
        assert(!this.summarizing && !this.summaryPending);

        if (this.onBehalfOfClientId !== this.runtime.summarizerClientId) {
            // we are no longer the summarizer, we should stop ourself
            this.stop("parentNoLongerSummarizer");
            return;
        }

        // generateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = true;
        this.startPending();

        const summarizingEvent = PerformanceEvent.start(this.logger,
            { eventName: "Summarizing", message });

        this.summarizeTimer.start();

        this.generateSummary().finally(() => {
            // always leave summarizing state
            this.summarizing = false;
            this.summarizeTimer.clear();
        }).then((summaryData) => {
            const summaryEndTime = Date.now();

            const telemetryProps = {
                sequenceNumber: summaryData.sequenceNumber,
                ...summaryData.summaryStats,
                opsSinceLastSummary: summaryData.sequenceNumber - this.lastSummarySeqNumber,
                timeSinceLastSummary: summaryEndTime - this.lastSummaryTime,
            };
            if (!summaryData.submitted) {
                // did not send the summary op
                summarizingEvent.cancel({...telemetryProps, category: "error"});
                this.stopPending();
                return;
            }

            summarizingEvent.end(telemetryProps);

            this.lastSummaryTime = summaryEndTime;
            this.lastSummarySeqNumber = summaryData.sequenceNumber;

            // Because summarizing is async, the incoming op stream will be resumed before
            // we update our lastSummarySeqNumber.  We use this to defer the broadcast listeners
            // until we are sure that no summary ops are handled before lastSummarySeqNumber is
            // set here.
            this.deferBroadcast.resolve();
            this.pendingAckTimer.start();
        }, (error) => {
            summarizingEvent.cancel({}, error);
            this.stopPending();
        });
    }

    private getOpSummaryDetails(op: ISequencedDocumentMessage): IOpSummaryDetails {
        if (this.summarizing || this.summaryPending) {
            // We are currently summarizing. Don't summarize again.
            // Track that an op has come in though, to restart the idle timer.
            if (!this.opSinceSummarize) {
                this.opSinceSummarize = true;
            }
            return {
                message: "",
                shouldSummarize: false,
                canStartIdleTimer: false,
            };
        } else if (op.type === MessageType.Save) {
            // Forced summary.
            return {
                message: `;${op.clientId}: ${op.contents}`,
                shouldSummarize: true,
                canStartIdleTimer: true,
            };
        }

        // Summarize if it has been above the max time between summaries.
        const timeSinceLastSummary = Date.now() - this.lastSummaryTime;
        const opCountSinceLastSummary = op.sequenceNumber - this.lastSummarySeqNumber;

        if (timeSinceLastSummary > this.configuration.maxTime) {
            return {
                message: "maxTime",
                shouldSummarize: true,
                canStartIdleTimer: true,
            };
        } else if (opCountSinceLastSummary > this.configuration.maxOps) {
            return {
                message: "maxOps",
                shouldSummarize: true,
                canStartIdleTimer: true,
            };
        } else {
            return {
                message: "",
                shouldSummarize: false,
                canStartIdleTimer: true,
            };
        }
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

    private startPending() {
        this.summaryPending = true;
        this.pendingSummarySequenceNumber = undefined;
        this.deferBroadcast = new Deferred();
        this.deferAck = new Deferred();
    }

    private stopPending() {
        this.summaryPending = false;
        this.pendingAckTimer.clear();
        // release all deferred summary op/ack/nack handlers
        if (this.deferBroadcast) {
            this.deferBroadcast.resolve();
        }
        if (this.deferAck) {
            this.deferAck.resolve();
        }
        // start idle timer if op came in while pending
        if (this.opSinceSummarize) {
            this.idleTimer.start();
            this.opSinceSummarize = false;
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
