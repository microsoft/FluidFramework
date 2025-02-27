/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Timer } from "@fluidframework/core-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { ISummaryConfigurationHeuristics } from "../containerRuntime.js";

import {
	ISummarizeAttempt,
	ISummarizeHeuristicData,
	ISummarizeHeuristicRunner,
	ISummaryHeuristicStrategy,
} from "./summarizerTypes.js";
import { SummarizeReason } from "./summaryGenerator.js";

/**
 * Simple implementation of class for tracking summarize heuristic data.
 */
export class SummarizeHeuristicData implements ISummarizeHeuristicData {
	protected _lastAttempt: ISummarizeAttempt;
	public get lastAttempt(): ISummarizeAttempt {
		return this._lastAttempt;
	}

	protected _lastSuccessfulSummary: Readonly<ISummarizeAttempt>;
	public get lastSuccessfulSummary(): Readonly<ISummarizeAttempt> {
		return this._lastSuccessfulSummary;
	}

	public get opsSinceLastSummary(): number {
		return this.numNonRuntimeOpsBefore + this.numRuntimeOpsBefore;
	}

	public hasMissingOpData: boolean = false;

	public totalOpsSize: number = 0;
	/**
	 * Cumulative size in bytes of all the ops at the beginning of the summarization attempt.
	 * Is used to adjust totalOpsSize appropriately after successful summarization.
	 */
	private totalOpsSizeBefore: number = 0;

	public numNonRuntimeOps: number = 0;
	/**
	 * Number of non-runtime ops at beginning of attempting to summarize.
	 * Is used to adjust numNonRuntimeOps appropriately after successful summarization.
	 */
	private numNonRuntimeOpsBefore: number = 0;

	public numRuntimeOps: number = 0;
	/**
	 * Number of runtime ops at beginning of attempting to summarize.
	 * Is used to adjust numRuntimeOps appropriately after successful summarization.
	 */
	private numRuntimeOpsBefore: number = 0;

	constructor(
		public lastOpSequenceNumber: number,
		/**
		 * Baseline attempt data used for comparisons with subsequent attempts/calculations.
		 */
		attemptBaseline: ISummarizeAttempt,
	) {
		this._lastAttempt = attemptBaseline;
		this._lastSuccessfulSummary = { ...attemptBaseline };
	}

	public updateWithLastSummaryAckInfo(lastSummary: Readonly<ISummarizeAttempt>): void {
		this._lastAttempt = lastSummary;
		this._lastSuccessfulSummary = { ...lastSummary };
	}

	public recordAttempt(refSequenceNumber?: number): void {
		this._lastAttempt = {
			refSequenceNumber: refSequenceNumber ?? this.lastOpSequenceNumber,
			summaryTime: Date.now(),
		};

		this.numNonRuntimeOpsBefore = this.numNonRuntimeOps;
		this.numRuntimeOpsBefore = this.numRuntimeOps;
		this.totalOpsSizeBefore = this.totalOpsSize;
	}

	public markLastAttemptAsSuccessful(): void {
		this._lastSuccessfulSummary = { ...this.lastAttempt };

		this.numNonRuntimeOps -= this.numNonRuntimeOpsBefore;
		this.numNonRuntimeOpsBefore = 0;

		this.numRuntimeOps -= this.numRuntimeOpsBefore;
		this.numRuntimeOpsBefore = 0;

		this.totalOpsSize -= this.totalOpsSizeBefore;
		this.totalOpsSizeBefore = 0;
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
		private readonly configuration: ISummaryConfigurationHeuristics,
		trySummarize: (reason: SummarizeReason) => void,
		private readonly logger: ITelemetryLoggerExt,
		private readonly summarizeStrategies: ISummaryHeuristicStrategy[] = getDefaultSummaryHeuristicStrategies(),
	) {
		this.idleTimer = new Timer(this.idleTime, () => this.runSummarize("idle"));

		this.runSummarize = (reason: SummarizeReason) => {
			this.idleTimer?.clear();

			// We shouldn't attempt a summary if there are no new processed ops
			const opsSinceLastAck = this.opsSinceLastAck;
			if (opsSinceLastAck > 0) {
				trySummarize(reason);
			}
		};
	}

	public get idleTime(): number {
		const maxIdleTime = this.configuration.maxIdleTime;
		const minIdleTime = this.configuration.minIdleTime;
		const weightedNumOfOps = getWeightedNumberOfOps(
			this.heuristicData.numRuntimeOps,
			this.heuristicData.numNonRuntimeOps,
			this.configuration.runtimeOpWeight,
			this.configuration.nonRuntimeOpWeight,
		);
		const pToMaxOps = (weightedNumOfOps * 1) / this.configuration.maxOps;

		if (pToMaxOps >= 1) {
			return minIdleTime;
		}

		// Return a ratioed idle time based on the percentage of ops
		return maxIdleTime - (maxIdleTime - minIdleTime) * pToMaxOps;
	}

	public get opsSinceLastAck(): number {
		return (
			this.heuristicData.lastOpSequenceNumber -
			this.heuristicData.lastSuccessfulSummary.refSequenceNumber
		);
	}

	public start(): void {
		this.idleTimer?.start(this.idleTime);
	}

	public run(): void {
		for (const strategy of this.summarizeStrategies) {
			if (strategy.shouldRunSummary(this.configuration, this.heuristicData)) {
				return this.runSummarize(strategy.summarizeReason);
			}
		}

		this.idleTimer?.restart(this.idleTime);
	}

	public shouldRunLastSummary(): boolean {
		const weightedOpsSinceLastAck = getWeightedNumberOfOps(
			this.heuristicData.numRuntimeOps,
			this.heuristicData.numNonRuntimeOps,
			this.configuration.runtimeOpWeight,
			this.configuration.nonRuntimeOpWeight,
		);
		const minOpsForLastSummaryAttempt = this.configuration.minOpsForLastSummaryAttempt;

		this.logger.sendTelemetryEvent({
			eventName: "ShouldRunLastSummary",
			weightedOpsSinceLastAck,
			minOpsForLastSummaryAttempt,
		});

		return weightedOpsSinceLastAck >= minOpsForLastSummaryAttempt;
	}

	public dispose(): void {
		this.idleTimer?.clear();
	}
}

/**
 * Strategy used to run a summary when it's been a while since our last successful summary
 */
class MaxTimeSummaryHeuristicStrategy implements ISummaryHeuristicStrategy {
	public readonly summarizeReason: Readonly<SummarizeReason> = "maxTime";

	public shouldRunSummary(
		configuration: ISummaryConfigurationHeuristics,
		heuristicData: ISummarizeHeuristicData,
	): boolean {
		const timeSinceLastSummary = Date.now() - heuristicData.lastSuccessfulSummary.summaryTime;
		return timeSinceLastSummary > configuration.maxTime;
	}
}

function getWeightedNumberOfOps(
	runtimeOpCount: number,
	nonRuntimeOpCount: number,
	runtimeOpWeight: number,
	nonRuntimeOpWeight: number,
): number {
	return runtimeOpWeight * runtimeOpCount + nonRuntimeOpWeight * nonRuntimeOpCount;
}

/**
 * Strategy used to do a weighted analysis on the ops we've processed since the last successful summary
 */
class WeightedOpsSummaryHeuristicStrategy implements ISummaryHeuristicStrategy {
	public readonly summarizeReason: Readonly<SummarizeReason> = "maxOps";

	public shouldRunSummary(
		configuration: ISummaryConfigurationHeuristics,
		heuristicData: ISummarizeHeuristicData,
	): boolean {
		const weightedNumOfOps = getWeightedNumberOfOps(
			heuristicData.numRuntimeOps,
			heuristicData.numNonRuntimeOps,
			configuration.runtimeOpWeight,
			configuration.nonRuntimeOpWeight,
		);
		return weightedNumOfOps > configuration.maxOps;
	}
}

function getDefaultSummaryHeuristicStrategies(): (
	| MaxTimeSummaryHeuristicStrategy
	| WeightedOpsSummaryHeuristicStrategy
)[] {
	return [new MaxTimeSummaryHeuristicStrategy(), new WeightedOpsSummaryHeuristicStrategy()];
}
