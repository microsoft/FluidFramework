/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Timer } from "@fluidframework/common-utils";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ISummarizeHeuristicData, ISummarizeHeuristicRunner, ISummarizeAttempt } from "./summarizerTypes";
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
    }

    public markLastAttemptAsSuccessful() {
        this._lastSuccessfulSummary = { ...this.lastAttempt };
    }
}

/**
 * This class contains the heuristics for when to summarize.
 */
export class SummarizeHeuristicRunner implements ISummarizeHeuristicRunner {
    private readonly idleTimer: Timer;

    public constructor(
        private readonly heuristicData: ISummarizeHeuristicData,
        private readonly configuration: ISummaryConfiguration,
        private readonly trySummarize: (reason: SummarizeReason) => void,
        private readonly minOpsForAttemptOnClose = 50,
    ) {
        this.idleTimer = new Timer(
            this.configuration.idleTime,
            () => this.trySummarize("idle"));
    }

    public get opsSinceLastAck(): number {
        return this.heuristicData.lastOpSequenceNumber - this.heuristicData.lastSuccessfulSummary.refSequenceNumber;
    }

    public run(numSystemOps?: number, numNonSystemOps?: number) {
        const timeSinceLastSummary = Date.now() - this.heuristicData.lastSuccessfulSummary.summaryTime;
        const opsSinceLastAck = this.opsSinceLastAck;
        let needToRestart = true;

        if (timeSinceLastSummary > this.configuration.maxTime) {
            this.idleTimer.clear();
            this.trySummarize("maxTime");
            needToRestart = false;
        } else if (numSystemOps !== undefined && numNonSystemOps !== undefined) {
            if (this.getWeightedNumOfOps(numSystemOps, numNonSystemOps) > this.configuration.maxOps) {
                // !! TODO: How can we guarantee the expectations are the same for when we try to summarize?
                // Ex: Before, we would process up to 1000 ops. Now, we have this default as 100. Say we have
                //     someone that calls this method without the new optional parameters. The expectation of the
                //     method has now changed since trySummarize could happen 10x more frequently.
                // A potential solution could be to add a new property to the "DefaultSummaryConfiguration" that
                // will hold this new "weightedOps" number (100 in this case) and we leave maxOps at 1000.
                // Another solution could be to instead keep maxOps at 1000 and just divide this number by 10 when
                // processing the weighted version. But this isn't bullet proof in my opinion.
                this.idleTimer.clear();
                this.trySummarize("maxOps");
                needToRestart = false;
            }
        } else if (opsSinceLastAck > this.configuration.maxOps) { // Fallback to old check !!! TODO: * 10
            this.idleTimer.clear();
            this.trySummarize("maxOps");
            needToRestart = false;
        }

        if (needToRestart) {
            this.idleTimer.restart();
        }
    }

    private getWeightedNumOfOps(numSystemOps: number, numNonSystemOps: number): number {
        return numNonSystemOps + (numSystemOps * 0.1);
    }

    public shouldRunLastSummary(): boolean {
        const opsSinceLastAck = this.opsSinceLastAck;
        return (opsSinceLastAck > this.minOpsForAttemptOnClose);
    }

    public dispose() {
        this.idleTimer.clear();
    }
}
