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
    ISummaryNack,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import { ContainerRuntime, IGeneratedSummaryData } from "./containerRuntime";

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
    private pendingSummarySequenceNumber?: number;
    private idleTimer: NodeJS.Timeout | null = null;
    private readonly runDeferred = new Deferred<void>();
    private readonly logger: ITelemetryLogger;

    private deferBroadcast: Deferred<void>;
    private deferAck: Deferred<void>;

    private onBehalfOfClientId: string;

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        private readonly configuration: ISummaryConfiguration,
        private readonly generateSummary: () => Promise<IGeneratedSummaryData>,
        private readonly refreshBaseSummary: (snapshot: ISnapshotTree) => void,
    ) {
        this.logger = ChildLogger.create(this.runtime.logger, "Summarizer");

        this.runtime.on("disconnected", () => {
            this.runDeferred.resolve();
        });
    }

    public async run(onBehalfOf: string): Promise<void> {
        this.onBehalfOfClientId = onBehalfOf;

        if (!this.runtime.connected) {
            await new Promise((resolve) => this.runtime.once("connected", resolve));
        }

        if (this.runtime.summarizerClientId !== onBehalfOf) {
            return;
        }

        // initialize values (not exact)
        this.lastSummarySeqNumber = this.runtime.deltaManager.referenceSequenceNumber;
        this.lastSummaryTime = Date.now();

        this.logger.sendTelemetryEvent({
            eventName: "RunningSummarizer",
            onBehalfOf,
            initSummarySeqNumber: this.lastSummarySeqNumber,
        });

        // start the timer after connecting to the document
        this.resetIdleTimer();

        // listen for summary ops
        this.runtime.deltaManager.inbound.on("op", (op) => this.handleSummaryOp(op as ISequencedDocumentMessage));

        this.runtime.on("batchEnd", (error: any, op: ISequencedDocumentMessage) => this.handleOp(error, op));

        return this.runDeferred.promise;
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
            this.logger.sendErrorEvent({ eventName, clientId: this.runtime.clientId }, error);
            success = false;
        }
        if (success && !validator(result)) {
            // send error event when result is invalid
            this.logger.sendErrorEvent({ eventName, clientId: this.runtime.clientId });
            success = false;
        }
        return { result, success };
    }

    private async handleSummaryOp(op: ISequencedDocumentMessage) {
        // ignore all ops if not pending
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
                    this.logger.sendTelemetryEvent({
                        category: op.type === MessageType.SummaryAck ? "generic" : "error",
                        eventName: op.type === MessageType.SummaryAck ? "SummaryAck" : "SummaryNack",
                        timePending: Date.now() - this.lastSummaryTime,
                        summarySequenceNumber: ack.summaryProposal.summarySequenceNumber,
                    });

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
                    this.summaryPending = false;
                }
            }
        }
    }

    private handleOp(error: any, op: ISequencedDocumentMessage) {
        if (error) {
            return;
        }

        this.clearIdleTimer();

        // clear pending if timeout waiting for server ack
        if (this.summaryPending && !this.summarizing) {
            const pendingTime = Date.now() - this.lastSummaryTime;
            if (pendingTime > this.configuration.maxAckWaitTime) {
                this.logger.sendErrorEvent({
                    eventName: "SummaryAckWaitTimeout",
                    maxAckWaitTime: this.configuration.maxAckWaitTime,
                    pendingSummarySequenceNumber: this.pendingSummarySequenceNumber,
                });
                this.cancelPending();
            }
        }

        // Get the summary details for the given op
        const lastOpSummaryDetails = this.getOpSummaryDetails(op);

        if (lastOpSummaryDetails.shouldSummarize) {
            // Summarize immediately if requested
            this.summarize(lastOpSummaryDetails.message);
        } else if (lastOpSummaryDetails.canStartIdleTimer) {
            // Otherwise detect when we idle to trigger the snapshot
            this.resetIdleTimer();
        }
    }

    private summarize(message: string) {
        // it shouldn't be possible to enter here if already summarizing or pending
        assert(!this.summarizing && !this.summaryPending);

        if (this.onBehalfOfClientId !== this.runtime.summarizerClientId) {
            // we are no longer the summarizer, we should close ourself
            this.stop("parent is no longer summarizer");
            return;
        }

        // generateSummary could take some time
        // mark that we are currently summarizing to prevent concurrent summarizing
        this.summarizing = true;
        this.startPending();

        this.summarizeCore(message).finally(() => {
            this.summarizing = false;
        }).catch((error) => {
            this.cancelPending();
        });
    }

    private async summarizeCore(message: string) {
        const summarizingEvent = PerformanceEvent.start(this.logger,
            { eventName: "Summarizing", message });

        const summaryData = await this.generateSummary();

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
            this.cancelPending();
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
    }

    private getOpSummaryDetails(op: ISequencedDocumentMessage): IOpSummaryDetails {
        if (this.summarizing || this.summaryPending) {
            // We are currently summarizing. Don't summarize again.
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
        } else {
            // Summarize if it has been above the max time between summaries.
            const timeSinceLastSummary = Date.now() - this.lastSummaryTime;
            const opCountSinceLastSummary = op.sequenceNumber - this.lastSummarySeqNumber;
            return {
                message: "",
                shouldSummarize: (timeSinceLastSummary > this.configuration.maxTime) ||
                    (opCountSinceLastSummary > this.configuration.maxOps),
                canStartIdleTimer: true,
            };
        }
    }

    private startPending() {
        this.summaryPending = true;
        this.pendingSummarySequenceNumber = undefined;
        this.deferBroadcast = new Deferred();
        this.deferAck = new Deferred();
    }

    private cancelPending() {
        this.summaryPending = false;
        // release all deferred summary op/ack/nack handlers
        this.deferBroadcast.resolve();
        this.deferAck.resolve();
    }

    private clearIdleTimer() {
        if (!this.idleTimer) {
            return;
        }
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }

    private resetIdleTimer() {
        this.clearIdleTimer();

        this.idleTimer = setTimeout(
            () => this.summarize("idle"),
            this.configuration.idleTime);
    }
}
