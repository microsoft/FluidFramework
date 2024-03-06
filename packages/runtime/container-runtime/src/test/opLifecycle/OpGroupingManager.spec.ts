/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerMessageType } from "../../index.js";
import { BatchMessage, IBatch, OpGroupingManager } from "../../opLifecycle/index.js";

describe("OpGroupingManager", () => {
	const mockLogger = new MockLogger();
	const createBatch = (length: number, hasReentrantOps?: boolean): IBatch => ({
		...messagesToBatch(new Array(length).fill(createMessage(generateStringOfSize(1)))),
		hasReentrantOps,
	});
	const messagesToBatch = (messages: BatchMessage[]): IBatch => ({
		content: messages,
		contentSizeInBytes: messages
			.map((message) => JSON.stringify(message).length)
			.reduce((a, b) => a + b),
		referenceSequenceNumber: messages[0].referenceSequenceNumber,
	});
	const createMessage = (contents: string) => ({
		metadata: { flag: true },
		localOpMetadata: undefined,
		type: ContainerMessageType.FluidDataStoreOp,
		contents,
		referenceSequenceNumber: 0,
	});
	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");

	describe("Configs", () => {
		it("Grouped batching is disabled", () => {
			assert.strictEqual(
				new OpGroupingManager(
					{
						groupedBatchingEnabled: false,
						opCountThreshold: 0,
						reentrantBatchGroupingEnabled: true,
					},
					mockLogger,
				).shouldGroup(createBatch(100)),
				false,
			);
		});

		it("Grouped batching is enabled but the batch is too small", () => {
			assert.strictEqual(
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
						opCountThreshold: 10,
						reentrantBatchGroupingEnabled: true,
					},
					mockLogger,
				).shouldGroup(createBatch(5)),
				false,
			);
		});

		it("Grouped batching is enabled, the batch is large enough, but it is reentrant", () => {
			assert.strictEqual(
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
						opCountThreshold: 2,
						reentrantBatchGroupingEnabled: false,
					},
					mockLogger,
				).shouldGroup(createBatch(5, true)),
				false,
			);
		});

		it("Grouped batching is enabled, the batch is large enough, and it is reentrant", () => {
			assert.strictEqual(
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
						opCountThreshold: 2,
						reentrantBatchGroupingEnabled: true,
					},
					mockLogger,
				).shouldGroup(createBatch(5, true)),
				true,
			);
		});

		it("Grouped batching is enabled and the batch is large enough", () => {
			assert.strictEqual(
				new OpGroupingManager(
					{
						groupedBatchingEnabled: true,
						opCountThreshold: 2,
						reentrantBatchGroupingEnabled: false,
					},
					mockLogger,
				).shouldGroup(createBatch(5)),
				true,
			);
		});
	});

	describe("Fakes clientSequenceNumber when ungrouping", () => {
		it("grouped op", () => {
			const opGroupingManager = new OpGroupingManager(
				{
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
					reentrantBatchGroupingEnabled: true,
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
			} as any;

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
					reentrantBatchGroupingEnabled: true,
				},
				mockLogger,
			);

			const op = {
				clientSequenceNumber: 10,
				contents: "1",
			} as any;

			const result = opGroupingManager.ungroupOp(op);

			assert.deepStrictEqual(result, [
				{
					clientSequenceNumber: 10,
					contents: "1",
				},
			]);
		});

		it("non-grouped op with grouped batching disabled", () => {
			const opGroupingManager = new OpGroupingManager(
				{
					groupedBatchingEnabled: false,
					opCountThreshold: 2,
					reentrantBatchGroupingEnabled: true,
				},
				mockLogger,
			);

			const op = {
				clientSequenceNumber: 10,
				contents: "1",
			} as any;

			const result = opGroupingManager.ungroupOp(op);

			assert.deepStrictEqual(result, [
				{
					clientSequenceNumber: 10,
					contents: "1",
				},
			]);
		});
	});

	it("Ungrouping multiple times does not mess up groupedBatch messages", () => {
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
		} as any;
		const opGroupingManager = new OpGroupingManager(
			{
				groupedBatchingEnabled: false,
				opCountThreshold: 2,
				reentrantBatchGroupingEnabled: true,
			},
			mockLogger,
		);

		// Run the groupedBatch through a couple times to ensure it cannot get messed up
		let messagesToUngroup: ISequencedDocumentMessage[] = [groupedBatch];
		let result: ISequencedDocumentMessage[] = [];
		for (let i = 0; i < 4; i++) {
			result = [];
			for (const message of messagesToUngroup) {
				for (const ungroupedOp of opGroupingManager.ungroupOp(message)) {
					result.push(ungroupedOp);
				}
			}
			messagesToUngroup = [...result];
		}

		const expected = [
			{
				type: "op",
				sequenceNumber: 10,
				clientSequenceNumber: 1,
				metadata: undefined,
				compression: undefined,
				contents: {
					type: ContainerMessageType.FluidDataStoreOp,
					contents: {
						contents: "a",
					},
				},
			},
			{
				type: "op",
				sequenceNumber: 10,
				clientSequenceNumber: 2,
				metadata: undefined,
				compression: undefined,
				contents: {
					type: ContainerMessageType.FluidDataStoreOp,
					contents: {
						contents: "b",
					},
				},
			},
		];
		assert.deepStrictEqual(result, expected, "ungrouping should work as expected");
	});
});
