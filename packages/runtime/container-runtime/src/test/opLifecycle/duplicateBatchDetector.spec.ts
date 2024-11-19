/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import type { ITelemetryContext } from "@fluidframework/runtime-definitions/internal";

// eslint-disable-next-line import/no-internal-modules
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

describe("DuplicateBatchDetector", () => {
	// expose private members for testing
	let detector: Patch<
		DuplicateBatchDetector,
		{
			batchIdsAll: Set<string>;
			batchIdsBySeqNum: Map<number, string>;
		}
	>;
	let seqNum: number;

	beforeEach("setup", () => {
		seqNum = 1;
		detector = new DuplicateBatchDetector(undefined /* batchIdsFromSnapshot */) as any;
	});

	afterEach("validation", () => {
		assert.deepEqual(
			[...detector.batchIdsAll].sort(),
			[...detector.batchIdsBySeqNum].map(([, batchId]) => batchId).sort(),
			"Invariant: batchIdsAll and batchIdsBySeqNum should be in sync",
		);
	});

	it("Constructor param is respected", () => {
		const input: [number, string][] = [
			[1, "batch1"],
			[2, "batch2"],
		];
		detector = new DuplicateBatchDetector(input) as any;
		assert.deepEqual(detector.getRecentBatchInfoForSummary(), input);
	});

	it("First inbound batch is not a duplicate", () => {
		assert(detector.batchIdsAll.size === 0, "Expected detector to start empty");

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
		const detector2 = new DuplicateBatchDetector(JSON.parse(summaryPayload));

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
			[...detector.batchIdsAll].sort(),
			["batch1", "batch2"],
			"Incorrect batchIds (after 2)",
		);

		detector.processInboundBatch(inboundBatch3);

		assert.deepEqual(
			[...detector.batchIdsAll].sort(),
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

			let setCalled = 0;
			const telemetryContext = {
				set: (key: string, subKey: string, value: any) => {
					++setCalled;
					assert.equal(key, "fluid_DuplicateBatchDetector_");
					assert.equal(subKey, "recentBatchCount");
					assert.equal(value, 2);
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
			assert.equal(setCalled, 1, "Expected telemetryContext.set to be called once");
		});
	});
});
