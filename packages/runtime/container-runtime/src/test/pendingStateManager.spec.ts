/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { DataProcessingError } from "@fluidframework/container-utils";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { PendingStateManager } from "../pendingStateManager";
import { BatchManager, BatchMessage } from "../opLifecycle";

describe("Pending State Manager", () => {
	describe("Rollback", () => {
		let rollbackCalled;
		let rollbackContent;
		let rollbackShouldThrow;
		let batchManager: BatchManager;

		function getMessage(payload: string) {
			return { contents: payload } as any as BatchMessage;
		}

		const rollBackCallback = (m: BatchMessage) => {
			rollbackCalled = true;
			rollbackContent.push(m);
			if (rollbackShouldThrow) {
				throw new Error();
			}
		};

		beforeEach(async () => {
			rollbackCalled = false;
			rollbackContent = [];
			rollbackShouldThrow = false;

			batchManager = new BatchManager({ hardLimit: 950 * 1024 }, new MockLogger());
		});

		it("should do nothing when rolling back empty pending stack", () => {
			const checkpoint = batchManager.checkpoint();
			checkpoint.rollback(rollBackCallback);

			assert.strictEqual(rollbackCalled, false);
			assert.strictEqual(batchManager.empty, true);
		});

		it("should do nothing when rolling back nothing", () => {
			batchManager.push(getMessage("1"));
			const checkpoint = batchManager.checkpoint();
			checkpoint.rollback(rollBackCallback);

			assert.strictEqual(rollbackCalled, false);
			assert.strictEqual(batchManager.empty, false);
		});

		it("should succeed when rolling back entire pending stack", () => {
			const checkpoint = batchManager.checkpoint();
			batchManager.push(getMessage("11"));
			batchManager.push(getMessage("22"));
			batchManager.push(getMessage("33"));
			checkpoint.rollback(rollBackCallback);

			assert.strictEqual(rollbackCalled, true);
			assert.strictEqual(rollbackContent.length, 3);
			assert.strictEqual(rollbackContent[0].contents, "33");
			assert.strictEqual(rollbackContent[1].contents, "22");
			assert.strictEqual(rollbackContent[2].contents, "11");
			assert.strictEqual(batchManager.empty, true);
		});

		it("should succeed when rolling back part of pending stack", () => {
			batchManager.push(getMessage("11"));
			const checkpoint = batchManager.checkpoint();
			batchManager.push(getMessage("22"));
			batchManager.push(getMessage("33"));
			checkpoint.rollback(rollBackCallback);

			assert.strictEqual(rollbackCalled, true);
			assert.strictEqual(rollbackContent.length, 2);
			assert.strictEqual(rollbackContent[0].contents, "33");
			assert.strictEqual(rollbackContent[1].contents, "22");
			assert.strictEqual(batchManager.empty, false);
		});

		it("should throw and close when rollback fails", () => {
			rollbackShouldThrow = true;
			const checkpoint = batchManager.checkpoint();
			batchManager.push(getMessage("11"));
			assert.throws(() => {
				checkpoint.rollback(rollBackCallback);
			});

			assert.strictEqual(rollbackCalled, true);
		});
	});

	describe("Op processing", () => {
		let pendingStateManager;
		let closeError: ICriticalContainerError | undefined;
		const clientId = "clientId";

		beforeEach(async () => {
			pendingStateManager = new PendingStateManager(
				{
					applyStashedOp: () => {
						throw new Error();
					},
					clientId: () => "oldClientId",
					close: (error?: ICriticalContainerError) => (closeError = error),
					connected: () => true,
					reSubmit: () => {},
					rollback: () => {},
					orderSequentially: (callback: () => void) => {
						callback();
					},
				},
				undefined,
			);
		});

		const submitBatch = (messages: Partial<ISequencedDocumentMessage>[]) => {
			messages.forEach((message) => {
				pendingStateManager.onSubmitMessage(
					message.type,
					message.clientSequenceNumber,
					message.referenceSequenceNumber,
					message.contents,
					undefined,
					message.metadata,
				);
			});
		};

		const process = (messages: Partial<ISequencedDocumentMessage>[]) =>
			messages.forEach((message) => {
				pendingStateManager.processPendingLocalMessage(message);
			});

		it("proper batch is processed correctly", () => {
			const messages: Partial<ISequencedDocumentMessage>[] = [
				{
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					metadata: { batch: true },
				},
				{
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 1,
					referenceSequenceNumber: 0,
				},
				{
					clientId,
					type: MessageType.Operation,
					metadata: { batch: false },
					clientSequenceNumber: 2,
					referenceSequenceNumber: 0,
				},
			];

			submitBatch(messages);
			process(messages);
			assert(closeError === undefined);
		});

		it("batch missing end message will call close", () => {
			const messages: Partial<ISequencedDocumentMessage>[] = [
				{
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					metadata: { batch: true },
				},
				{
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 1,
					referenceSequenceNumber: 0,
				},
			];

			submitBatch(messages);
			process(messages);
			assert(closeError instanceof DataProcessingError);
			assert.strictEqual(closeError.getTelemetryProperties().hasBatchStart, true);
			assert.strictEqual(closeError.getTelemetryProperties().hasBatchEnd, false);
		});

		it("processing out of sync messages will call close", () => {
			const messages: Partial<ISequencedDocumentMessage>[] = [
				{
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
				},
			];

			submitBatch(messages);
			process(
				messages.map((message) => ({
					...message,
					clientSequenceNumber: (message.clientSequenceNumber ?? 0) + 1,
				})),
			);
			assert(closeError instanceof DataProcessingError);
			assert.strictEqual(closeError.getTelemetryProperties().expectedClientSequenceNumber, 0);
		});
	});

	// TODO: Remove in 2.0.0-internal.4.0.0 once only new format is written in getLocalState()
	describe("Local state processing", () => {
		function createPendingStateManager(pendingStates): any {
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => undefined,
					close: () => {},
					connected: () => true,
					reSubmit: () => {},
					rollback: () => {},
					orderSequentially: () => {},
				},
				{ pendingStates },
			);
		}

		describe("Constructor conversion", () => {
			it("Empty local state", () => {
				{
					const pendingStateManager = createPendingStateManager(undefined);
					assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), []);
				}
				{
					const pendingStateManager = createPendingStateManager([]);
					assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), []);
				}
			});

			it("Only flush messages", () => {
				const pendingStateManager = createPendingStateManager([
					{ type: "flush" },
					{ type: "flush" },
				]);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), []);
			});

			it("New format", () => {
				const messages = [
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: false } },
					{ type: "message" },
				];
				const pendingStateManager = createPendingStateManager(messages);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), messages);
			});

			it("Ends with no flush", () => {
				const pendingStateManager = createPendingStateManager([
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "message" },
				]);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), [
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: false } },
				]);
			});

			it("Ends with flush", () => {
				const pendingStateManager = createPendingStateManager([
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "flush" },
					{ type: "message" },
					{ type: "flush" },
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "flush" },
				]);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), [
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message", opMetadata: { batch: false } },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message", opMetadata: { batch: false } },
				]);
			});

			it("Mix of new and old", () => {
				const pendingStateManager = createPendingStateManager([
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: false } },
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "flush" },
					{ type: "message" },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "message" },
					{ type: "flush" },
				]);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), [
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: false } },
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message", opMetadata: { batch: false } },
					{ type: "message" },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: true } },
					{ type: "message" },
					{ type: "message", opMetadata: { batch: false } },
				]);
			});
		});

		it("getLocalState writes old format", async () => {
			const pendingStateManager = createPendingStateManager([
				{ type: "message", referenceSequenceNumber: 0, opMetadata: { batch: true } },
				{ type: "message", referenceSequenceNumber: 0 },
				{ type: "message", referenceSequenceNumber: 0, opMetadata: { batch: false } },
				{ type: "message", referenceSequenceNumber: 0, opMetadata: { batch: true } },
				{ type: "message", referenceSequenceNumber: 0, opMetadata: { batch: false } },
				{ type: "message", referenceSequenceNumber: 0 },
			]);

			await pendingStateManager.applyStashedOpsAt(0);

			assert.deepStrictEqual(pendingStateManager.getLocalState().pendingStates, [
				/* eslint-disable max-len */
				{
					type: "message",
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: { batch: true },
				},
				{ type: "message", referenceSequenceNumber: 0, localOpMetadata: undefined },
				{
					type: "message",
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: { batch: false },
				},
				{ type: "flush" },
				{
					type: "message",
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: { batch: true },
				},
				{
					type: "message",
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: { batch: false },
				},
				{ type: "flush" },
				{ type: "message", referenceSequenceNumber: 0, localOpMetadata: undefined },
				/* eslint-enable max-len */
			]);
		});
	});
});
