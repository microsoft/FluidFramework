/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { ContainerMessageType } from "../../index.js";
import {
	OutboundBatchMessage,
	OpGroupingManager,
	isGroupedBatch,
	type OutboundBatch,
	type EmptyGroupedBatch,
	type LocalEmptyBatchPlaceholder,
} from "../../opLifecycle/index.js";

describe("OpGroupingManager", () => {
	const mockLogger = new MockLogger();
	const createBatch = (
		length: number,
		hasReentrantOps?: boolean,
		opHasMetadata: boolean = false,
		batchId?: string,
	): OutboundBatch => ({
		...messagesToBatch(Array.from({ length }, () => createMessage(opHasMetadata, batchId))),
		hasReentrantOps,
	});
	const messagesToBatch = (messages: OutboundBatchMessage[]): OutboundBatch => ({
		messages,
		contentSizeInBytes: messages
			.map((message) => JSON.stringify(message).length)
			.reduce((a, b) => a + b),
		referenceSequenceNumber: messages[0].referenceSequenceNumber,
	});
	const createMessage = (opHasMetadata: boolean, batchId?: string) => {
		let metadata: { flag?: boolean; batchId?: string } | undefined = opHasMetadata
			? { flag: true }
			: undefined;
		metadata = batchId ? { ...metadata, batchId } : metadata;
		return {
			metadata,
			type: ContainerMessageType.FluidDataStoreOp,
			contents: "0",
			referenceSequenceNumber: 0,
		};
	};

	describe("groupBatch", () => {
		it("grouped batching disabled", () => {
			assert.throws(() => {
				new OpGroupingManager(
					{
						groupedBatchingEnabled: false,
					},
					mockLogger,
				).groupBatch(createBatch(5));
			});
		});

		it("grouped batching enabled", () => {
			const result = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
				},
				mockLogger,
			).groupBatch(createBatch(5));
			assert.strictEqual(result.messages.length, 1);
			assert.deepStrictEqual(result.messages, [
				{
					contents:
						'{"type":"groupedBatch","contents":[{"contents":0},{"contents":0},{"contents":0},{"contents":0},{"contents":0}]}',
					metadata: { batchId: undefined },
					referenceSequenceNumber: 0,
				},
			]);
		});

		it("batchId on grouped batch", () => {
			const batchId = "batchId";
			const result = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
				},
				mockLogger,
			).groupBatch(createBatch(5, false, false, batchId));
			assert.strictEqual(result.messages.length, 1);
			assert.strictEqual(result.messages[0].metadata?.batchId, batchId);
		});

		it("empty grouped batching disabled", () => {
			assert.throws(() => {
				new OpGroupingManager(
					{
						groupedBatchingEnabled: false,
					},
					mockLogger,
				).createEmptyGroupedBatch("resubmittingBatchId", 0);
			});
		});

		it("create empty batch", () => {
			const emptyGroupedBatch: EmptyGroupedBatch = {
				type: "groupedBatch",
				contents: [],
			};
			const batchId = "batchId";
			const expectedOutboundMessage: OutboundBatchMessage = {
				contents: '{"type":"groupedBatch","contents":[]}',
				metadata: { batchId },
				localOpMetadata: { emptyBatch: true },
				referenceSequenceNumber: 0,
				runtimeOp: undefined,
			};

			const result = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
				},
				mockLogger,
			).createEmptyGroupedBatch(batchId, 0);

			assert.deepStrictEqual(result.outboundBatch.messages, [expectedOutboundMessage]);

			const expectedPlaceholderMessage: LocalEmptyBatchPlaceholder = {
				runtimeOp: emptyGroupedBatch,
				metadata: { batchId },
				localOpMetadata: { emptyBatch: true },
				referenceSequenceNumber: 0,
			};
			assert.deepStrictEqual(result.placeholderMessage, expectedPlaceholderMessage);
		});

		it("should throw for an empty batch", () => {
			const emptyBatch: OutboundBatch = {
				messages: [],
				contentSizeInBytes: 0,
				referenceSequenceNumber: 0,
			};
			assert.throws(
				() => {
					new OpGroupingManager(
						{
							groupedBatchingEnabled: true,
						},
						mockLogger,
					).groupBatch(emptyBatch);
				},
				(e: Error) => validateAssertionError(e, "Unexpected attempt to group an empty batch"),
			);
		});

		it("singleton batch is returned as-is", () => {
			const original = createBatch(1);
			const result = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
				},
				mockLogger,
			).groupBatch(original);
			assert.equal(result, original, "Expected the original batch to be returned");
		});

		it("grouped batching enabled, op metadata not allowed", () => {
			assert.throws(() => {
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
					},
					mockLogger,
				).groupBatch(createBatch(5, false, true));
			});
		});

		it("grouped batching enabled, op metadata not allowed with batch id", () => {
			assert.throws(() => {
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
					},
					mockLogger,
				).groupBatch(createBatch(5, false, true, "batchId"));
			});
		});
	});

	describe("ungroupOp", () => {
		it("packed grouped op", () => {
			const opGroupingManager = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
				},
				mockLogger,
			);

			const op = {
				clientSequenceNumber: 10,
				contents: {
					type: OpGroupingManager.groupedBatchOp,
					contents: [
						{
							contents: "1",
						},
						{
							contents: "2",
						},
						{
							contents: "3",
						},
					],
				},
			} as unknown as ISequencedDocumentMessage;

			assert.strictEqual(isGroupedBatch(op), true);
			const result = opGroupingManager.ungroupOp(op);

			assert.deepStrictEqual(result, [
				{
					clientSequenceNumber: 1,
					contents: "1",
					compression: undefined,
					metadata: undefined,
				},
				{
					clientSequenceNumber: 2,
					contents: "2",
					compression: undefined,
					metadata: undefined,
				},
				{
					clientSequenceNumber: 3,
					contents: "3",
					compression: undefined,
					metadata: undefined,
				},
			]);
		});

		it("non-grouped op with grouped batching enabled", () => {
			const opGroupingManager = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
				},
				mockLogger,
			);

			const op = {
				clientSequenceNumber: 10,
				contents: "1",
			} as unknown as ISequencedDocumentMessage;

			assert.strictEqual(isGroupedBatch(op), false);
			assert.throws(() => opGroupingManager.ungroupOp(op));
		});

		it("non-grouped op with grouped batching disabled", () => {
			const opGroupingManager = new OpGroupingManager(
				{
					groupedBatchingEnabled: false,
				},
				mockLogger,
			);

			const op = {
				clientSequenceNumber: 10,
				contents: "1",
			} as unknown as ISequencedDocumentMessage;

			assert.strictEqual(isGroupedBatch(op), false);
			assert.throws(() => opGroupingManager.ungroupOp(op));
		});

		it("Ungrouping multiple times is not allowed", () => {
			const groupedBatch = {
				type: "op",
				sequenceNumber: 10,
				clientSequenceNumber: 12,
				contents: {
					type: OpGroupingManager.groupedBatchOp,
					contents: [
						{
							contents: {
								type: ContainerMessageType.FluidDataStoreOp,
								contents: {
									contents: "a",
								},
							},
						},
						{
							contents: {
								type: ContainerMessageType.FluidDataStoreOp,
								contents: {
									contents: "b",
								},
							},
						},
					],
				},
			} as unknown as ISequencedDocumentMessage;
			const opGroupingManager = new OpGroupingManager(
				{
					groupedBatchingEnabled: false,
				},
				mockLogger,
			);

			for (const ungroupedOp of opGroupingManager.ungroupOp(groupedBatch)) {
				assert.strictEqual(isGroupedBatch(ungroupedOp), false);
				assert.throws(() => opGroupingManager.ungroupOp(ungroupedOp));
			}
		});
	});
});
