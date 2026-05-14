/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { ITelemetryContext } from "@fluidframework/runtime-definitions/internal";

// eslint-disable-next-line import-x/no-internal-modules
import { DuplicateBatchDetector } from "../../opLifecycle/duplicateBatchDetector.js";
import type { BatchStartInfo } from "../../opLifecycle/index.js";

/**
 * Helper function to create (enough of) a BatchStartInfo for testing.
 * Inbound batch may have explicit batchId, or merely clientId and batchStartCsn and batchId must be computed - allow either as inputs
 */
function makeBatch({
	sequenceNumber,
	minimumSequenceNumber,
	batchId,
	clientId,
	batchStartCsn,
}: { sequenceNumber: number; minimumSequenceNumber: number } & (
	| { batchId: string; clientId?: undefined; batchStartCsn?: undefined }
	| { batchId?: undefined; clientId: string; batchStartCsn: number }
)): BatchStartInfo {
	return {
		keyMessage: {
			sequenceNumber,
			minimumSequenceNumber,
		} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
		batchId,
		clientId,
		batchStartCsn,
	} satisfies Partial<BatchStartInfo> as BatchStartInfo;
}

type Patch<T, U> = Omit<T, keyof U> & U;

type PatchedDuplicateBatchDetector = Patch<
	DuplicateBatchDetector,
	{
		seqNumByBatchId: Map<string, number>;
		batchIdsBySeqNum: Map<number, string>;
	}
>;

describe("DuplicateBatchDetector", () => {
	// expose private members for testing
	let detector: PatchedDuplicateBatchDetector;
	let seqNum: number;

	beforeEach("setup", () => {
		seqNum = 1;
		detector = new DuplicateBatchDetector(
			undefined /* batchIdsFromSnapshot */,
		) as unknown as PatchedDuplicateBatchDetector;
	});

	afterEach("validation", () => {
		assert.deepEqual(
			[...detector.seqNumByBatchId.keys()].sort(),
			[...detector.batchIdsBySeqNum.values()].sort(),
			"Invariant: seqNumByBatchId and batchIdsBySeqNum should be in sync",
		);
	});

	it("Constructor param is respected", () => {
		const input: [number, string][] = [
			[1, "batch1"],
			[2, "batch2"],
		];
		detector = new DuplicateBatchDetector(input) as unknown as PatchedDuplicateBatchDetector;
		assert.deepEqual(detector.getRecentBatchInfoForSummary(), input);
	});

	it("First inbound batch is not a duplicate", () => {
		assert(detector.seqNumByBatchId.size === 0, "Expected detector to start empty");

		const inboundBatch = makeBatch({
			sequenceNumber: seqNum++,
			minimumSequenceNumber: 0,
			batchId: "batch1",
		});
		const result = detector.processInboundBatch(inboundBatch);
		assert.deepEqual(result, { duplicate: false });
	});

	it("Different inbound batches are not duplicates", () => {
		const inboundBatch1 = makeBatch({
			sequenceNumber: seqNum++,
			minimumSequenceNumber: 0,
			batchId: "batch1",
		});
		const inboundBatch2 = makeBatch({
			sequenceNumber: seqNum++,
			minimumSequenceNumber: 0,
			batchId: "batch2",
		});
		detector.processInboundBatch(inboundBatch1);
		const result = detector.processInboundBatch(inboundBatch2);
		assert.deepEqual(result, { duplicate: false });
	});

	it("Matching inbound batches are duplicates", () => {
		const inboundBatch1 = makeBatch({
			sequenceNumber: seqNum++, // 1
			minimumSequenceNumber: 0,
			batchId: "batch1",
		});
		const inboundBatch2 = makeBatch({
			sequenceNumber: seqNum++, // 2
			minimumSequenceNumber: 0,
			batchId: "batch1",
		});
		detector.processInboundBatch(inboundBatch1);
		const result = detector.processInboundBatch(inboundBatch2);
		assert.deepEqual(result, { duplicate: true, otherSequenceNumber: 1 });
	});

	it("Matching inbound batches, one with batchId one without, are duplicates", () => {
		const inboundBatch1 = makeBatch({
			sequenceNumber: seqNum++, // 1
			minimumSequenceNumber: 0,
			batchId: "clientId_[33]",
		});
		const inboundBatch2 = makeBatch({
			sequenceNumber: seqNum++, // 2
			minimumSequenceNumber: 0,
			clientId: "clientId",
			batchStartCsn: 33,
		});
		detector.processInboundBatch(inboundBatch1);
		const result = detector.processInboundBatch(inboundBatch2);
		assert.deepEqual(result, { duplicate: true, otherSequenceNumber: 1 });
	});

	it("Matching inbound batches are duplicates (roundtrip through summary)", () => {
		const inboundBatch1 = makeBatch({
			sequenceNumber: seqNum++, // 1
			minimumSequenceNumber: 0,
			batchId: "batch1",
		});
		detector.processInboundBatch(inboundBatch1);

		const summaryPayload = JSON.stringify(detector.getRecentBatchInfoForSummary());
		const detector2 = new DuplicateBatchDetector(
			JSON.parse(summaryPayload) as [number, string][] | undefined,
		);

		const inboundBatch2 = makeBatch({
			sequenceNumber: seqNum++, // 2
			minimumSequenceNumber: 0,
			batchId: "batch1",
		});
		const result = detector2.processInboundBatch(inboundBatch2);
		assert.deepEqual(result, { duplicate: true, otherSequenceNumber: 1 });
	});

	it("should clear old batchIds that are no longer at risk for duplicates", () => {
		const inboundBatch1 = makeBatch({
			sequenceNumber: seqNum++, // 1
			minimumSequenceNumber: 0,
			batchId: "batch1",
		});
		const inboundBatch2 = makeBatch({
			sequenceNumber: seqNum++, // 2
			minimumSequenceNumber: 0,
			batchId: "batch2",
		});
		const inboundBatch3 = makeBatch({
			sequenceNumber: seqNum++, // 3
			minimumSequenceNumber: 2,
			batchId: "batch3",
		});
		detector.processInboundBatch(inboundBatch1);
		detector.processInboundBatch(inboundBatch2);

		assert.deepEqual(
			[...detector.seqNumByBatchId.keys()].sort(),
			["batch1", "batch2"],
			"Incorrect batchIds (after 2)",
		);

		detector.processInboundBatch(inboundBatch3);

		assert.deepEqual(
			[...detector.seqNumByBatchId.keys()].sort(),
			["batch2", "batch3"],
			"Incorrect batchIds (after 3)",
		);
	});

	describe("getStateForSummary", () => {
		it("If empty, return undefined", () => {
			assert.equal(
				detector.batchIdsBySeqNum.size,
				0,
				"PRECONDITION: Expected detector to start empty",
			);
			assert.equal(detector.getRecentBatchInfoForSummary(), undefined);
		});

		it("If not empty, return batchIds by seqNum (and update telemetryContext)", () => {
			const inboundBatch1 = makeBatch({
				sequenceNumber: seqNum++, // 1
				minimumSequenceNumber: 0,
				batchId: "batch1",
			});
			const inboundBatch2 = makeBatch({
				sequenceNumber: seqNum++, // 2
				minimumSequenceNumber: 0,
				batchId: "batch2",
			});
			detector.processInboundBatch(inboundBatch1);
			detector.processInboundBatch(inboundBatch2);

			const telemetrySets = new Map<string, unknown>();
			const telemetryContext = {
				set: (key: string, subKey: string, value: unknown) => {
					assert.equal(key, "fluid_DuplicateBatchDetector_");
					telemetrySets.set(subKey, value);
				},
			} satisfies Partial<ITelemetryContext> as ITelemetryContext;

			const recentBatchInfo = detector.getRecentBatchInfoForSummary(telemetryContext);

			assert.deepEqual(
				recentBatchInfo,
				[
					[1, "batch1"],
					[2, "batch2"],
				],
				"Incorrect recentBatchInfo",
			);
			assert.equal(telemetrySets.get("recentBatchCount"), 2);
			assert.equal(telemetrySets.get("peakRecentBatchCount"), 2);
			assert.equal(telemetrySets.get("processedBatchCount"), 2);
		});

		it("Per-window perf counters reset after each summary", () => {
			detector.processInboundBatch(
				makeBatch({
					sequenceNumber: seqNum++, // 1
					minimumSequenceNumber: 0,
					batchId: "batch1",
				}),
			);
			detector.processInboundBatch(
				makeBatch({
					sequenceNumber: seqNum++, // 2
					minimumSequenceNumber: 0,
					batchId: "batch2",
				}),
			);

			const firstWindow = new Map<string, unknown>();
			detector.getRecentBatchInfoForSummary({
				set: (_key: string, subKey: string, value: unknown) => {
					firstWindow.set(subKey, value);
				},
			} satisfies Partial<ITelemetryContext> as ITelemetryContext);
			assert.equal(firstWindow.get("processedBatchCount"), 2);
			assert.equal(firstWindow.get("peakRecentBatchCount"), 2);

			// Process one more batch; MSN advances enough to drop both prior entries.
			detector.processInboundBatch(
				makeBatch({
					sequenceNumber: seqNum++, // 3
					minimumSequenceNumber: 3,
					batchId: "batch3",
				}),
			);

			const secondWindow = new Map<string, unknown>();
			detector.getRecentBatchInfoForSummary({
				set: (_key: string, subKey: string, value: unknown) => {
					secondWindow.set(subKey, value);
				},
			} satisfies Partial<ITelemetryContext> as ITelemetryContext);
			// Only one batch processed since the prior summary.
			assert.equal(secondWindow.get("processedBatchCount"), 1);
			// Peak in this window starts at the size carried over from the prior window (2)
			// — peak only ever grows during a window. Current size after cleanup is 1.
			assert.equal(secondWindow.get("peakRecentBatchCount"), 2);
			assert.equal(secondWindow.get("recentBatchCount"), 1);
		});
	});
});
