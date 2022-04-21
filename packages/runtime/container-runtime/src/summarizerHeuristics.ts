/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Timer } from "@fluidframework/common-utils";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import {
    ISummarizeHeuristicData,
    ISummarizeHeuristicRunner,
    ISummarizeAttempt,
    ISummarizeHeuristicStrategy,
    ISummarizeHeuristicWeightConfiguration,
} from "./summarizerTypes";
import { SummarizeReason } from "./summaryGenerator";

/** Simple implementation of class for tracking summarize heuristic data. */
export class SummarizeHeuristicData implements ISummarizeHeuristicData {
    protected _lastAttempt: ISummarizeAttempt;
    public get lastAttempt(): ISummarizeAttempt {
        return this._lastAttempt;
    }

    protected _lastSuccessfulSummary: Readonly<ISummarizeAttempt>;
    public get lastSuccessfulSummary(): Readonly<ISummarizeAttempt> {
        return this._lastSuccessfulSummary;
    }

    public numSystemOps: number = 0;
    /** 
     * Number of system ops at beginning of attempting to summarize.
     * Is used to adjust numSystemOps appropriately after successful summarization.
     */
    private numSystemOpsBefore: number = 0;

    public numNonSystemOps: number = 0;
    /** 
     * Number of non-system ops at beginning of attempting to summarize.
     * Is used to adjust numNonSystemOps appropriately after successful summarization.
     */
    private numNonSystemOpsBefore: number = 0;

    constructor(
        public lastOpSequenceNumber: number,
        /** Baseline attempt data used for comparisons with subsequent attempts/calculations. */
        attemptBaseline: ISummarizeAttempt,
    ) {
        this._lastAttempt = attemptBaseline;
        this._lastSuccessfulSummary = { ...attemptBaseline };
    }

    public initialize(lastSummary: Readonly<ISummarizeAttempt>) {
        this._lastAttempt = lastSummary;
        this._lastSuccessfulSummary = { ...lastSummary };
    }

    public recordAttempt(refSequenceNumber?: number) {
        this._lastAttempt = {
            refSequenceNumber: refSequenceNumber ?? this.lastOpSequenceNumber,
            summaryTime: Date.now(),
        };

        this.numSystemOpsBefore = this.numSystemOps;
        this.numNonSystemOpsBefore = this.numNonSystemOps;
    }

    public markLastAttemptAsSuccessful() {
        this._lastSuccessfulSummary = { ...this.lastAttempt };

        this.numSystemOps -= this.numSystemOpsBefore;
        this.numSystemOpsBefore = 0;

        this.numNonSystemOps -= this.numNonSystemOpsBefore;
        this.numNonSystemOpsBefore = 0;
    }
}

/**
 * This class contains the heuristics for when to summarize.
 */
export class SummarizeHeuristicRunner implements ISummarizeHeuristicRunner {
    private readonly idleTimer: Timer | undefined;
    private readonly runSummarize: (reason: SummarizeReason) => void;

    public constructor(
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly configuration: ISummaryConfiguration,
        trySummarize: (reason: SummarizeReason) => void,
        private readonly minOpsForAttemptOnClose = 50,
        private readonly summarizeStrategies: ISummarizeHeuristicStrategy[] = getDefaultSummarizeHeuristicStrategies(),
        useIdleTimerStrategy: boolean = true,
    ) {
        if (useIdleTimerStrategy) {
            this.idleTimer = new Timer(
                this.configuration.idleTime,
                () => this.runSummarize("idle"));
        }

        this.runSummarize = (reason: SummarizeReason) => {
            this.idleTimer?.clear();

            // We shouldn't attempt a summary if there are no new processed ops
            const opsSinceLastAck = this.opsSinceLastAck;
            if (opsSinceLastAck > 0) {
                trySummarize(reason);
            }
        };
    }

    public get opsSinceLastAck(): number {
        return this.heuristicData.lastOpSequenceNumber - this.heuristicData.lastSuccessfulSummary.refSequenceNumber;
    }

    public start() {
        this.idleTimer?.start();
    }

    public run() {
        for (const strategy of this.summarizeStrategies) {
            if (strategy.shouldRunSummarize(this.configuration, this.heuristicData)) {
                return this.runSummarize(strategy.summarizeReason);
            }
        }

        this.idleTimer?.restart();
    }

    public shouldRunLastSummary(): boolean {
        const opsSinceLastAck = this.opsSinceLastAck;
        return (opsSinceLastAck > this.minOpsForAttemptOnClose);
    }

    public dispose() {
        this.idleTimer?.clear();
    }
}

export class MaxTimeSummarizeHeuristicStrategy implements ISummarizeHeuristicStrategy {
    public readonly summarizeReason: Readonly<SummarizeReason> = "maxTime";

    public shouldRunSummarize(configuration: ISummaryConfiguration, heuristicData: ISummarizeHeuristicData): boolean {
        const timeSinceLastSummary = Date.now() - heuristicData.lastSuccessfulSummary.summaryTime;
        return timeSinceLastSummary > configuration.maxTime;
    }
}

export class WeightedOpsSummarizeHeuristicStrategy implements ISummarizeHeuristicStrategy {
    public readonly summarizeReason: Readonly<SummarizeReason> = "maxOps";

    constructor(
        private readonly weightConfiguration: ISummarizeHeuristicWeightConfiguration,
    ) { }

    public shouldRunSummarize(configuration: ISummaryConfiguration, heuristicData: ISummarizeHeuristicData): boolean {
        const weightedNumOfOps = (this.weightConfiguration.systemOpWeight    * heuristicData.numSystemOps)
                               + (this.weightConfiguration.nonSystemOpWeight * heuristicData.numNonSystemOps);
        return weightedNumOfOps > configuration.maxOps;
    }
}

const DefaultHeuristicWeightConfiguration: ISummarizeHeuristicWeightConfiguration = {
    systemOpWeight   : 0.1,
    nonSystemOpWeight: 1.0,
};

export function getDefaultSummarizeHeuristicStrategies(
        weightConfiguration: ISummarizeHeuristicWeightConfiguration = DefaultHeuristicWeightConfiguration) {
    return [
        new MaxTimeSummarizeHeuristicStrategy(),
        new WeightedOpsSummarizeHeuristicStrategy(weightConfiguration),
    ];
}
