/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ContainerMessageType } from "../..";
import { BatchMessage, IBatch, OpGroupingManager } from "../../opLifecycle";

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
});
