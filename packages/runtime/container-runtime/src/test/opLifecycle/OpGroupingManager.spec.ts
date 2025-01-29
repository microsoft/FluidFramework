/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { ContainerMessageType } from "../../index.js";
import {
	BatchMessage,
	IBatch,
	OpGroupingManager,
	isGroupedBatch,
} from "../../opLifecycle/index.js";

describe("OpGroupingManager", () => {
	const mockLogger = new MockLogger();
	const createBatch = (
		length: number,
		hasReentrantOps?: boolean,
		opHasMetadata: boolean = false,
		batchId?: string,
	): IBatch => ({
		...messagesToBatch(
			Array.from({ length }).map(() => createMessage(opHasMetadata, batchId)),
		),
		hasReentrantOps,
	});
	const messagesToBatch = (messages: BatchMessage[]): IBatch => ({
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

	describe("Configs", () => {
		interface ConfigOption {
			enabled: boolean;
			tooSmall?: boolean;
			reentrant?: boolean;
			reentryEnabled?: boolean;
			expectedResult: boolean;
		}
		const options: ConfigOption[] = [
			{ enabled: false, expectedResult: false },
			{ enabled: true, tooSmall: true, expectedResult: false },
			{ enabled: true, reentrant: true, expectedResult: true },
			{ enabled: true, expectedResult: true },
		];

		for (const option of options) {
			it(`shouldGroup: groupedBatchingEnabled [${option.enabled}] tooSmall [${
				option.tooSmall === true
			}] reentrant [${option.reentrant === true}]`, () => {
				assert.strictEqual(
					new OpGroupingManager(
						{
							groupedBatchingEnabled: option.enabled,
							opCountThreshold: option.tooSmall === true ? 10 : 2,
						},
						mockLogger,
					).shouldGroup(createBatch(5, option.reentrant)),
					option.expectedResult,
				);
			});
		}
	});

	describe("groupBatch", () => {
		it("grouped batching disabled", () => {
			assert.throws(() => {
				new OpGroupingManager(
					{
						groupedBatchingEnabled: false,
						opCountThreshold: 2,
					},
					mockLogger,
				).groupBatch(createBatch(5));
			});
		});

		it("grouped batching enabled", () => {
			const result = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
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
					opCountThreshold: 2,
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
						opCountThreshold: 2,
					},
					mockLogger,
				).createEmptyGroupedBatch("resubmittingBatchId", 0);
			});
		});

		it("create empty batch", () => {
			const batchId = "batchId";
			const result = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
				},
				mockLogger,
			).createEmptyGroupedBatch(batchId, 0);
			assert.deepStrictEqual(result.messages, [
				{
					contents: '{"type":"groupedBatch","contents":[]}',
					metadata: { batchId },
					localOpMetadata: { emptyBatch: true },
					referenceSequenceNumber: 0,
				},
			]);
		});

		it("should group on empty batch", () => {
			const result = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
				},
				mockLogger,
			).shouldGroup({
				messages: [],
				contentSizeInBytes: 0,
				referenceSequenceNumber: 0,
				hasReentrantOps: false,
			});
			assert.strictEqual(result, true);
		});

		it("grouped batching enabled, not large enough", () => {
			assert.throws(() => {
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
						opCountThreshold: 10,
					},
					mockLogger,
				).groupBatch(createBatch(5));
			});
		});

		it("grouped batching enabled, op metadata not allowed", () => {
			assert.throws(() => {
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
						opCountThreshold: 2,
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
						opCountThreshold: 2,
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
					opCountThreshold: 2,
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
					opCountThreshold: 2,
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
					opCountThreshold: 2,
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
					opCountThreshold: 2,
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
