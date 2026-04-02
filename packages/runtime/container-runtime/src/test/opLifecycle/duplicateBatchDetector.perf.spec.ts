/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark, type BenchmarkTimingOptions } from "@fluid-tools/benchmark";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

// eslint-disable-next-line import-x/no-internal-modules
import { DuplicateBatchDetector } from "../../opLifecycle/duplicateBatchDetector.js";
import type { BatchStartInfo } from "../../opLifecycle/index.js";

/**
 * Helper to generate snapshot data for pre-populating a DuplicateBatchDetector.
 * Creates `count` entries with sequential sequence numbers starting at 1.
 */
function generateSnapshotEntries(count: number): [number, string][] {
	return Array.from({ length: count }, (_, i) => [i + 1, `batch-${i}`] as [number, string]);
}

/**
 * Helper to create a BatchStartInfo for benchmarking.
 */
function makeBatch(
	sequenceNumber: number,
	minimumSequenceNumber: number,
	batchId: string,
): BatchStartInfo {
	return {
		keyMessage: {
			sequenceNumber,
			minimumSequenceNumber,
		} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
		batchId,
		clientId: "benchmark-client",
		batchStartCsn: sequenceNumber,
	} satisfies Partial<BatchStartInfo> as BatchStartInfo;
}

/**
 * Benchmarks for DuplicateBatchDetector.processInboundBatch.
 *
 * These tests measure the overhead of processing an inbound batch when the detector
 * is pre-populated with many tracked batch IDs, which is the scenario we care about
 * for batch ID tracking performance (e.g., high-latency networks where MSN lags behind).
 *
 * Three scenarios are tested per batch count:
 * 1. No cleanup needed: MSN=0, so clearOldBatchIds returns immediately (O(1) via minSeqNum check)
 * 2. Partial cleanup: MSN advances past half the entries, triggering iteration + deletion
 * 3. Full cleanup: MSN advances past all entries, triggering full iteration + deletion
 *
 * Cleanup scenarios use benchmarkFnCustom to recreate the detector for each measurement,
 * since cleanup modifies the detector state (deletes entries). Only the processInboundBatch
 * call is timed, not the detector construction.
 */
describe("DuplicateBatchDetector benchmark", () => {
	const trackedBatchCounts = [100, 500, 1000];

	/**
	 * For cleanup scenarios, we use benchmarkFnCustom so we can recreate the detector
	 * for each measurement (since cleanup mutates state). We run 1 iteration per batch
	 * to keep each measurement isolated.
	 */
	const customExecutionOptions: BenchmarkTimingOptions = {
		minBatchDurationSeconds: 0,
		minBatchCount: 20,
	};

	for (const trackedBatchCount of trackedBatchCounts) {
		describe(`${trackedBatchCount} tracked batches`, () => {
			let detector: DuplicateBatchDetector;
			let entries: [number, string][];

			// Scenario 1: No cleanup needed (MSN=0 → early exit in clearOldBatchIds)
			// This can use benchmarkFn (tight loop) since MSN=0 never triggers cleanup,
			// so detector state remains valid across iterations.
			benchmark({
				title: `processInboundBatch - no cleanup (${trackedBatchCount} tracked)`,
				type: BenchmarkType.Measurement,
				before: () => {
					entries = generateSnapshotEntries(trackedBatchCount);
					detector = new DuplicateBatchDetector(entries);
				},
				benchmarkFn: () => {
					// MSN=0 means clearOldBatchIds hits the early exit (msn <= minSeqNum).
					// This measures: early-exit check + getEffectiveBatchId + map lookup + map insert.
					// Note: detector grows by 1 entry per iteration, but that doesn't affect the
					// early-exit path since minSeqNum remains 1.
					const nextSeqNum = trackedBatchCount + 1;
					const batch = makeBatch(nextSeqNum, 0, `new-batch-${nextSeqNum}`);
					detector.processInboundBatch(batch);
				},
			});

			// Scenario 2: Partial cleanup (MSN advances past half the entries)
			benchmark({
				title: `processInboundBatch - 50% cleanup (${trackedBatchCount} tracked)`,
				type: BenchmarkType.Measurement,
				...customExecutionOptions,
				async benchmarkFnCustom(state) {
					let running = true;
					do {
						// Fresh detector for each measurement
						entries = generateSnapshotEntries(trackedBatchCount);
						detector = new DuplicateBatchDetector(entries);

						const nextSeqNum = trackedBatchCount + 1;
						const msn = Math.floor(trackedBatchCount / 2);
						const batch = makeBatch(nextSeqNum, msn, `new-batch-${nextSeqNum}`);

						const start = state.timer.now();
						detector.processInboundBatch(batch);
						const end = state.timer.now();

						running = state.recordBatch(state.timer.toSeconds(start, end));
					} while (running);
				},
			});

			// Scenario 3: Full cleanup (MSN advances past all entries)
			benchmark({
				title: `processInboundBatch - 100% cleanup (${trackedBatchCount} tracked)`,
				type: BenchmarkType.Measurement,
				...customExecutionOptions,
				async benchmarkFnCustom(state) {
					let running = true;
					do {
						// Fresh detector for each measurement
						entries = generateSnapshotEntries(trackedBatchCount);
						detector = new DuplicateBatchDetector(entries);

						const nextSeqNum = trackedBatchCount + 1;
						const msn = trackedBatchCount + 1;
						const batch = makeBatch(nextSeqNum, msn, `new-batch-${nextSeqNum}`);

						const start = state.timer.now();
						detector.processInboundBatch(batch);
						const end = state.timer.now();

						running = state.recordBatch(state.timer.toSeconds(start, end));
					} while (running);
				},
			});
		});
	}
});
