/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentLoadable,
} from "@prague/component-core-interfaces";
import {
    ISequencedDocumentMessage,
    ISummaryConfiguration,
    ISummaryConfigurationInterval,
    MessageType,
} from "@prague/protocol-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { ContainerRuntime } from "./containerRuntime";

/**
 * Wrapper interface holding summary details for a given op
 */
interface IOpSummaryDetails {
    // Whether we should summarize at the given op
    shouldSummarize: boolean;

    // If defined, the idle time, otherwise no idle timer
    idleTime?: number;

    // The message to include with the summarize
    message: string;
}

const aggressiveIdleTimeout = 5000; // summarize after 5 sec without receiving an op
const passiveIdleTimeout = 300000; // summarize after 5 min without receiving an op
const activeToIdleRatio = 12; // idle time x12 = active time, summarize on receiving an op past active time

const OldDefaultInterval: ISummaryConfigurationInterval = {
    maxOps: 1000,
    maxTime: aggressiveIdleTimeout * activeToIdleRatio,
    idleTime: aggressiveIdleTimeout,
};

export const DefaultSummaryConfiguration: ISummaryConfiguration = {
    // immediately summarize > 1000 ops
    intervals: [
        {
            maxOps: 50, // slowly summarize <= 50 ops
            maxTime: passiveIdleTimeout * activeToIdleRatio,
            idleTime: passiveIdleTimeout,
        },
        OldDefaultInterval, // aggressively summarize <= 1000 ops
    ],

    // Wait 10 minutes for summary ack
    maxAckWaitTime: 600000,
};

declare module "@prague/component-core-interfaces" {
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
}

export class Summarizer implements IComponentLoadable, ISummarizer {

    public get ISummarizer() { return this; }
    public get IComponentLoadable() { return this; }

    private lastSummaryTime: number = Date.now();
    private lastSummarySeqNumber: number = 0;
    private summarizing = false;
    private summaryPending = false;
    private idleTimer: NodeJS.Timeout | null = null;
    private lastOp: ISequencedDocumentMessage | null = null;
    private lastOpSummaryDetails: IOpSummaryDetails | null = null;
    private readonly runDeferred = new Deferred<void>();
    private readonly configuration: ISummaryConfiguration;

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        configuration: ISummaryConfiguration | undefined,
        private readonly generateSummary: () => Promise<void>,
    ) {
        this.configuration = this.initializeConfig(configuration);
        this.runtime.on("disconnected", () => {
            this.runDeferred.resolve();
        });
    }

    public async run(onBehalfOf: string): Promise<void> {
        this.runtime.logger.sendTelemetryEvent({ eventName: "RunningSummarizer", onBehalfOf });

        // initialize to current time and seq number
        this.lastSummaryTime = Date.now();
        this.lastSummarySeqNumber = this.runtime.deltaManager.referenceSequenceNumber;

        if (!this.runtime.connected) {
            await new Promise((resolve) => this.runtime.once("connected", resolve));
        }

        if (this.runtime.summarizerClientId !== onBehalfOf) {
            return;
        }

        // listen for summary ops
        this.runtime.deltaManager.inbound.on("op", (op) => this.handleSummaryOp(op as ISequencedDocumentMessage));

        // after connecting, decide whether to do initial summarize or idle timer
        const opCountSinceConnected = this.runtime.deltaManager.referenceSequenceNumber - this.lastSummarySeqNumber;
        const interval = this.findInterval(opCountSinceConnected);
        if (interval) {
            this.resetIdleTimer(interval.idleTime);
        } else {
            // tslint:disable-next-line: no-floating-promises
            this.summarize("");
        }

        // listen for regular ops
        this.runtime.on("batchEnd", (error: any, op: ISequencedDocumentMessage) => this.handleOp(error, op));

        return this.runDeferred.promise;
    }

    private initializeConfig(configuration?: ISummaryConfiguration): ISummaryConfiguration {
        let initializedConfig = DefaultSummaryConfiguration;
        if (configuration) {
            // merge passed config with defaults
            initializedConfig = { ...initializedConfig, ...configuration };

            // for back-compat; remove when server changes config to use intervals
            // will convert top-level interface properties to a single interval
            if (!configuration.intervals && configuration.maxOps) {
                initializedConfig.intervals = [{
                    ...OldDefaultInterval,
                    ...{
                        maxOps: configuration.maxOps,
                        maxTime: configuration.maxTime,
                        idleTime: configuration.idleTime,
                    },
                }];
            }
        }

        // sort ascending
        initializedConfig.intervals = initializedConfig.intervals.sort((a, b) => a.maxOps - b.maxOps);

        return initializedConfig;
    }

    private findInterval(opCount: number): ISummaryConfigurationInterval | undefined {
        // these are sorted ascending in constructor
        for (const interval of this.configuration.intervals) {
            if (interval.maxOps >= opCount) {
                return interval;
            }
        }
    }

    private handleSummaryOp(op: ISequencedDocumentMessage) {
        if (op.type === MessageType.SummaryAck || op.type === MessageType.SummaryNack) {
            if (this.summaryPending) {
                this.summaryPending = false;
            }
        }
    }

    private async summarize(message: string) {
        try {
            // it shouldn't be possible to enter here if already summarizing or pending
            assert(!this.summarizing && !this.summaryPending);

            // generateSummary could take some time
            // mark that we are currently summarizing to prevent concurrent summarizing
            this.summarizing = true;

            this.runtime.logger.sendTelemetryEvent({ eventName: "Summarizing", message });

            const summarySequenceNumber = this.lastOp ? this.lastOp.sequenceNumber : 1;

            this.summaryPending = true;
            await this.generateSummary();

            // On success note the time of the snapshot and op sequence number.
            // Skip on error to cause us to attempt the snapshot again.
            this.lastSummaryTime = Date.now();
            this.lastSummarySeqNumber = summarySequenceNumber;
        } catch (error) {
            this.runtime.logger.sendErrorEvent({ eventName: "ErrorDuringSummarize" }, error);
            this.summaryPending = false;
        } finally {
            this.summarizing = false;
        }
    }

    private handleOp(error: any, op: ISequencedDocumentMessage) {
        if (error) {
            return;
        }

        this.clearIdleTimer();

        // clear pending if timeout waiting for server ack
        if (this.summaryPending) {
            const pendingTime = Date.now() - this.lastSummaryTime;
            if (pendingTime > this.configuration.maxAckWaitTime) {
                this.runtime.logger.sendErrorEvent({ eventName: "SummaryAckWaitTimeout" });
                this.summaryPending = false;
            }
        }

        // Get the summary details for the given op
        this.lastOp = op;
        this.lastOpSummaryDetails = this.getOpSummaryDetails(op);

        if (this.lastOpSummaryDetails.shouldSummarize) {
            // Summarize immediately if requested
            // tslint:disable-next-line: no-floating-promises
            this.summarize(this.lastOpSummaryDetails.message);
        } else if (this.lastOpSummaryDetails.idleTime) {
            // Otherwise detect when we idle to trigger the snapshot
            this.resetIdleTimer(this.lastOpSummaryDetails.idleTime);
        }
    }

    private getOpSummaryDetails(op: ISequencedDocumentMessage): IOpSummaryDetails {
        if (this.summarizing || this.summaryPending) {
            // We are currently summarizing. Don't summarize again.
            return {
                message: "",
                shouldSummarize: false,
            };
        } else if (op.type === MessageType.Save) {
            // Forced summary.
            return {
                message: `;${op.clientId}: ${op.contents}`,
                shouldSummarize: true,
            };
        } else {
            // Summarize if it has been above the max time between summaries.
            const timeSinceLastSummary = Date.now() - this.lastSummaryTime;
            const opCountSinceLastSummary = op.sequenceNumber - this.lastSummarySeqNumber;

            const interval = this.findInterval(opCountSinceLastSummary);

            if (interval) {
                return {
                    message: "",
                    shouldSummarize: timeSinceLastSummary > interval.maxTime,
                    idleTime: interval.idleTime,
                };
            } else {
                return {
                    message: "",
                    shouldSummarize: true,
                };
            }
        }
    }

    private clearIdleTimer() {
        if (!this.idleTimer) {
            return;
        }
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }

    private resetIdleTimer(idleTime: number) {
        this.clearIdleTimer();

        this.idleTimer = setTimeout(
            () => {
                // tslint:disable-next-line: no-floating-promises
                this.summarize("idle");
            },
            idleTime);
    }
}
