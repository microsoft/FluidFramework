/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { Timer } from "@fluidframework/common-utils";
import Deque from "double-ended-queue";
import { ISummaryConfigurationHeuristics } from "../containerRuntime";
import {
	ISummarizeHeuristicData,
	ISummarizeHeuristicRunner,
	ISummarizeAttempt,
	ISummaryHeuristicStrategy,
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

	private readonly runtimeOps = new Deque<number>();
	public get numRuntimeOps(): number {
		return this.runtimeOps.length;
	}

	public recordRuntimeOp(sequenceNumber: number): void {
		this.runtimeOps.insertBack(sequenceNumber);
	}

	private readonly nonRuntimeOps = new Deque<number>();
	public get numNonRuntimeOps(): number {
		return this.nonRuntimeOps.length;
	}

	public recordNonRuntimeOp(sequenceNumber: number): void {
		this.nonRuntimeOps.insertBack(sequenceNumber);
	}

	public totalOpsSize: number = 0;
	public hasMissingOpData: boolean = false;

	/**
	 * Cumulative size in bytes of all the ops at the beginning of the summarization attempt.
	 * Is used to adjust totalOpsSize appropriately after successful summarization.
	 */
	private totalOpsSizeBefore: number = 0;

	constructor(
		public lastOpSequenceNumber: number,
		/** Baseline attempt data used for comparisons with subsequent attempts/calculations. */
		attemptBaseline: ISummarizeAttempt,
	) {
		this._lastAttempt = attemptBaseline;
		this._lastSuccessfulSummary = { ...attemptBaseline };
	}

	public updateWithLastSummaryAckInfo(lastSummary: Readonly<ISummarizeAttempt>) {
		this._lastAttempt = lastSummary;
		this._lastSuccessfulSummary = { ...lastSummary };
	}

	public recordAttempt(refSequenceNumber?: number) {
		this._lastAttempt = {
			refSequenceNumber: refSequenceNumber ?? this.lastOpSequenceNumber,
			summaryTime: Date.now(),
		};

		this.totalOpsSizeBefore = this.totalOpsSize;
	}

	public markLastAttemptAsSuccessful() {
		this._lastSuccessfulSummary = { ...this.lastAttempt };

		for (const queue of [this.runtimeOps, this.nonRuntimeOps]) {
			while (
				!queue.isEmpty() &&
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				queue.peekFront()! <= this._lastSuccessfulSummary.refSequenceNumber
			) {
				queue.removeFront();
			}
		}

		this.totalOpsSize -= this.totalOpsSizeBefore;
		this.totalOpsSizeBefore = 0;
	}

	public numOpsInSummary(referenceSequenceNumber: number): number {
		let total = 0;

		for (const queue of [this.runtimeOps, this.nonRuntimeOps]) {
			for (const seqNum of queue.toArray()) {
				if (seqNum <= referenceSequenceNumber) {
					total++;
				}
			}
		}

		return total;
	}

	public recordMissingSequenceNumbers(numMissing: number): void {
		// Split the diff 50-50 and increment the counts appropriately
		const runtimeOpsToAdd = Math.floor(numMissing / 2);
		const nonRuntimeOpsToAdd = Math.ceil(numMissing / 2);

		let fakeSqn = -1;

		for (let i = 0; i < runtimeOpsToAdd; i++) {
			this.runtimeOps.insertFront(fakeSqn--);
		}

		for (let i = 0; i < nonRuntimeOpsToAdd; i++) {
			this.nonRuntimeOps.insertFront(fakeSqn--);
		}
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
		private readonly logger: ITelemetryLogger,
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
		const pToMaxOps = (weightedNumOfOps * 1.0) / this.configuration.maxOps;

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

	public start() {
		this.idleTimer?.start(this.idleTime);
	}

	public run() {
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

	public dispose() {
		this.idleTimer?.clear();
	}
}

/** Strategy used to run a summary when it's been a while since our last successful summary */
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

/** Strategy used to do a weighted analysis on the ops we've processed since the last successful summary */
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

function getDefaultSummaryHeuristicStrategies() {
	return [new MaxTimeSummaryHeuristicStrategy(), new WeightedOpsSummaryHeuristicStrategy()];
}
