/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import {
	type BatchStartInfo,
	generateBatchId,
	type InboundMessageResult,
} from "../../opLifecycle/index.js";
import type { InboundSequencedContainerRuntimeMessage } from "../../messageTypes.js";
import {
	inboundVersionMarkUpdate,
	// eslint-disable-next-line import-x/no-internal-modules -- test targets the inbound-batch helper directly
} from "../../versionMarks/inboundBatch.js";

/** The helper only reads `sequenceNumber` off messages. */
function msg(sequenceNumber: number): InboundSequencedContainerRuntimeMessage {
	return { sequenceNumber } as unknown as InboundSequencedContainerRuntimeMessage;
}

function batchStart(batchId: string | undefined, keyMessageSeq: number): BatchStartInfo {
	return {
		batchId,
		clientId: "client",
		batchStartCsn: 3,
		keyMessage: { sequenceNumber: keyMessageSeq } as unknown as ISequencedDocumentMessage,
	};
}

function fullBatch(start: BatchStartInfo, seqs: number[]): InboundMessageResult {
	return {
		type: "fullBatch",
		messages: seqs.map(msg),
		batchStart: start,
		length: seqs.length,
		groupedBatch: true,
	};
}

function batchStartingMessage(start: BatchStartInfo, seq: number): InboundMessageResult {
	return { type: "batchStartingMessage", batchStart: start, nextMessage: msg(seq) };
}

function nextBatchMessage(seq: number, batchEnd: boolean | undefined): InboundMessageResult {
	return { type: "nextBatchMessage", nextMessage: msg(seq), batchEnd };
}

describe("inboundVersionMarkUpdate", () => {
	describe("fullBatch", () => {
		it("records the batch's last op sequence number and clears any carry", () => {
			const result = inboundVersionMarkUpdate(
				fullBatch(batchStart("b_[3]", 0), [10, 11, 12]),
				"stale_[9]",
			);
			assert.deepEqual(result, {
				sequenced: { batchId: "b_[3]", sequenceNumber: 12 },
				carriedBatchId: undefined,
			});
		});

		it("falls back to the batch-start key message for an empty batch", () => {
			const result = inboundVersionMarkUpdate(
				fullBatch(batchStart("b_[3]", 42), []),
				undefined,
			);
			assert.deepEqual(result, {
				sequenced: { batchId: "b_[3]", sequenceNumber: 42 },
				carriedBatchId: undefined,
			});
		});

		it("derives the batch id from clientId + batchStartCsn when none is explicit", () => {
			const result = inboundVersionMarkUpdate(
				fullBatch(batchStart(undefined, 0), [7]),
				undefined,
			);
			assert.deepEqual(result, {
				sequenced: { batchId: generateBatchId("client", 3), sequenceNumber: 7 },
				carriedBatchId: undefined,
			});
		});
	});

	describe("piecemeal batch", () => {
		it("carries the batch id on the starting message without recording", () => {
			const result = inboundVersionMarkUpdate(
				batchStartingMessage(batchStart("b_[3]", 0), 20),
				undefined,
			);
			assert.deepEqual(result, { carriedBatchId: "b_[3]" });
		});

		it("keeps the carry unchanged on a mid-batch message", () => {
			const result = inboundVersionMarkUpdate(nextBatchMessage(21, undefined), "b_[3]");
			assert.deepEqual(result, { carriedBatchId: "b_[3]" });
		});

		it("records the carried id at the batch's last op and clears the carry", () => {
			const result = inboundVersionMarkUpdate(nextBatchMessage(22, true), "b_[3]");
			assert.deepEqual(result, {
				sequenced: { batchId: "b_[3]", sequenceNumber: 22 },
				carriedBatchId: undefined,
			});
		});

		it("threads a full start -> mid -> end sequence to the last op", () => {
			const start = inboundVersionMarkUpdate(
				batchStartingMessage(batchStart("b_[3]", 0), 30),
				undefined,
			);
			assert.equal(start.sequenced, undefined);

			const mid = inboundVersionMarkUpdate(
				nextBatchMessage(31, undefined),
				start.carriedBatchId,
			);
			assert.equal(mid.sequenced, undefined);

			const end = inboundVersionMarkUpdate(nextBatchMessage(32, true), mid.carriedBatchId);
			assert.deepEqual(end, {
				sequenced: { batchId: "b_[3]", sequenceNumber: 32 },
				carriedBatchId: undefined,
			});
		});

		it("is a no-op for a batch-end message with no carried id", () => {
			const result = inboundVersionMarkUpdate(nextBatchMessage(40, true), undefined);
			assert.deepEqual(result, { carriedBatchId: undefined });
		});
	});
});
