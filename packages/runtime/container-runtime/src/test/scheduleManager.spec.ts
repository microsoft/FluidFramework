/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "@fluid-internal/client-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { ScheduleManager } from "../scheduleManager.js";

describe("ScheduleManager", () => {
	describe("Batch processing events", () => {
		let batchBegin: number = 0;
		let batchEnd: number = 0;
		let sequenceNumber: number = 0;
		let emitter: EventEmitter;
		let deltaManager: MockDeltaManager;
		let scheduleManager: ScheduleManager;
		const testClientId = "test-client";

		beforeEach(() => {
			emitter = new EventEmitter();
			deltaManager = new MockDeltaManager();
			deltaManager.inbound.processCallback = (message: ISequencedDocumentMessage) => {
				scheduleManager.beforeOpProcessing(message);
				scheduleManager.afterOpProcessing(undefined, message);
				deltaManager.emit("op", message);
			};
			scheduleManager = new ScheduleManager(
				deltaManager,
				emitter,
				() => testClientId,
				createChildLogger({ namespace: "fluid:testScheduleManager" }),
			);

			emitter.on("batchBegin", () => {
				// When we receive a "batchBegin" event, we should not have any outstanding
				// events, i.e., batchBegin and batchEnd should be equal.
				assert.strictEqual(
					batchBegin,
					batchEnd,
					"Received batchBegin before previous batchEnd",
				);
				batchBegin++;
			});

			emitter.on("batchEnd", () => {
				batchEnd++;
				// Every "batchEnd" event should correspond to a "batchBegin" event, i.e.,
				// batchBegin and batchEnd should be equal.
				assert.strictEqual(
					batchBegin,
					batchEnd,
					"Received batchEnd without corresponding batchBegin",
				);
			});
		});

		afterEach(() => {
			batchBegin = 0;
			batchEnd = 0;
			sequenceNumber = 0;
		});

		/**
		 * Pushes single op to the inbound queue. Adds proper sequence numbers to them
		 */
		function pushOp(partialMessage: Partial<ISequencedDocumentMessage>) {
			sequenceNumber++;
			const message = { ...partialMessage, sequenceNumber };
			deltaManager.inbound.push(message as ISequencedDocumentMessage);
		}

		/**
		 * awaits until all ops that could be processed are processed.
		 */
		async function processOps() {
			const inbound = deltaManager.inbound;
			while (!inbound.paused && inbound.length > 0) {
				await Promise.resolve();
			}
		}

		it("Single non-batch message", async () => {
			const message: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
			};

			// Send a non-batch message.
			pushOp(message);

			await processOps();

			assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
			assert.strictEqual(batchBegin, 1, "Did not receive correct batchBegin events");
			assert.strictEqual(batchEnd, 1, "Did not receive correct batchEnd events");
		});

		it("Multiple non-batch messages", async () => {
			const message: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
			};

			// Sent 5 non-batch messages.
			pushOp(message);
			pushOp(message);
			pushOp(message);
			pushOp(message);
			pushOp(message);

			await processOps();

			assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
			assert.strictEqual(batchBegin, 5, "Did not receive correct batchBegin events");
			assert.strictEqual(batchEnd, 5, "Did not receive correct batchEnd events");
		});

		it("Message with non batch-related metadata", async () => {
			const message: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
				metadata: { foo: 1 },
			};

			pushOp(message);
			await processOps();

			// We should have a "batchBegin" and a "batchEnd" event for the batch.
			assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
			assert.strictEqual(
				batchBegin,
				1,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(batchEnd, 1, "Did not receive correct batchEnd event for the batch");
		});

		it("Messages in a single batch", async () => {
			const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
				metadata: { batch: true },
			};

			const batchMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
			};

			const batchEndMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
				metadata: { batch: false },
			};

			// Send a batch with 4 messages.
			pushOp(batchBeginMessage);
			pushOp(batchMessage);
			pushOp(batchMessage);

			await processOps();
			assert.strictEqual(
				deltaManager.inbound.length,
				3,
				"Some of partial batch ops were processed",
			);

			pushOp(batchEndMessage);
			await processOps();

			// We should have only received one "batchBegin" and one "batchEnd" event for the batch.
			assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
			assert.strictEqual(
				batchBegin,
				1,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(batchEnd, 1, "Did not receive correct batchEnd event for the batch");
		});

		it("two batches", async () => {
			const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
				metadata: { batch: true },
			};

			const batchMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
			};

			const batchEndMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
				metadata: { batch: false },
			};

			// Pause to not allow ops to be processed while we accumulated them.
			await deltaManager.inbound.pause();

			// Send a batch with 4 messages.
			pushOp(batchBeginMessage);
			pushOp(batchMessage);
			pushOp(batchMessage);
			pushOp(batchEndMessage);

			// Add incomplete batch
			pushOp(batchBeginMessage);
			pushOp(batchMessage);
			pushOp(batchMessage);

			assert.strictEqual(
				deltaManager.inbound.length,
				7,
				"none of the batched ops are processed yet",
			);

			void deltaManager.inbound.resume();
			await processOps();

			assert.strictEqual(
				deltaManager.inbound.length,
				3,
				"none of the second batch ops are processed yet",
			);
			assert.strictEqual(
				batchBegin,
				1,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(batchEnd, 1, "Did not receive correct batchEnd event for the batch");

			// End the batch - all ops should be processed.
			pushOp(batchEndMessage);
			await processOps();

			assert.strictEqual(deltaManager.inbound.length, 0, "processed all ops");
			assert.strictEqual(
				batchBegin,
				2,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(batchEnd, 2, "Did not receive correct batchEnd event for the batch");
		});

		it("non-batched ops followed by batch", async () => {
			const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
				metadata: { batch: true },
			};

			const batchMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
			};

			const batchEndMessage: Partial<ISequencedDocumentMessage> = {
				clientId: testClientId,
				type: MessageType.Operation,
				metadata: { batch: false },
			};

			// Pause to not allow ops to be processed while we accumulated them.
			await deltaManager.inbound.pause();

			// Send a batch with 2 messages.
			pushOp(batchMessage);
			pushOp(batchMessage);

			// Add incomplete batch
			pushOp(batchBeginMessage);
			pushOp(batchMessage);
			pushOp(batchMessage);

			await processOps();

			assert.strictEqual(
				deltaManager.inbound.length,
				5,
				"none of the batched ops are processed yet",
			);

			void deltaManager.inbound.resume();
			await processOps();

			assert.strictEqual(
				deltaManager.inbound.length,
				3,
				"none of the second batch ops are processed yet",
			);

			// End the batch - all ops should be processed.
			pushOp(batchEndMessage);
			await processOps();

			assert.strictEqual(deltaManager.inbound.length, 0, "processed all ops");
			assert.strictEqual(
				batchBegin,
				3,
				"Did not receive correct batchBegin event for the batch",
			);
			assert.strictEqual(batchEnd, 3, "Did not receive correct batchEnd event for the batch");
		});

		function testWrongBatches() {
			const clientId1: string = "test-client-1";
			const clientId2: string = "test-client-2";

			const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
				clientId: clientId1,
				type: MessageType.Operation,
				metadata: { batch: true },
			};

			const batchMessage: Partial<ISequencedDocumentMessage> = {
				clientId: clientId1,
				type: MessageType.Operation,
			};

			const messagesToFail: Partial<ISequencedDocumentMessage>[] = [
				// System op from same client
				{
					clientId: clientId1,
					type: MessageType.NoOp,
				},

				// Batch messages interleaved with a batch begin message from same client
				batchBeginMessage,

				// Send a message from another client. This should result in a a violation!
				{
					clientId: clientId2,
					type: MessageType.Operation,
				},

				// Send a message from another client with non batch-related metadata. This should result
				// in a "batchEnd" event for the previous batch since the client id changes. Also, we
				// should get a "batchBegin" and a "batchEnd" event for the new client.
				{
					clientId: clientId2,
					type: MessageType.Operation,
					metadata: { foo: 1 },
				},

				// Send a batch from another client. This should result in a "batchEnd" event for the
				// previous batch since the client id changes. Also, we should get one "batchBegin" and
				// one "batchEnd" event for the batch from the new client.
				{
					clientId: clientId2,
					type: MessageType.Operation,
					metadata: { batch: true },
				},
			];

			let counter = 0;
			for (const messageToFail of messagesToFail) {
				counter++;
				it(`Partial batch messages, case ${counter}`, async () => {
					// Send a batch with 3 messages from first client but don't send batch end message.
					pushOp(batchBeginMessage);
					pushOp(batchMessage);
					pushOp(batchMessage);

					await processOps();
					assert.strictEqual(
						deltaManager.inbound.length,
						3,
						"Some of partial batch ops were processed",
					);

					assert.throws(() => pushOp(messageToFail));

					assert.strictEqual(
						deltaManager.inbound.length,
						4,
						"Some of batch ops were processed",
					);
					assert.strictEqual(
						batchBegin,
						0,
						"Did not receive correct batchBegin event for the batch",
					);
					assert.strictEqual(
						batchEnd,
						0,
						"Did not receive correct batchBegin event for the batch",
					);
				});
			}
		}

		testWrongBatches();
	});
});
