/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import Deque from "double-ended-queue";

import {
	ContainerErrorTypes,
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { isILoggingError } from "@fluidframework/telemetry-utils";

import { IPendingMessage, PendingStateManager } from "../pendingStateManager.js";
import { BatchManager, BatchMessage } from "../opLifecycle/index.js";
import type {
	RecentlyAddedContainerRuntimeMessageDetails,
	UnknownContainerRuntimeMessage,
} from "../messageTypes.js";

type PendingStateManager_WithPrivates = Omit<PendingStateManager, "initialMessages"> & {
	initialMessages: Deque<IPendingMessage>;
};

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

			batchManager = new BatchManager({ hardLimit: 950 * 1024 });
		});

		it("should do nothing when rolling back empty pending stack", () => {
			const checkpoint = batchManager.checkpoint();
			checkpoint.rollback(rollBackCallback);

			assert.strictEqual(rollbackCalled, false);
			assert.strictEqual(batchManager.empty, true);
		});

		it("should do nothing when rolling back nothing", () => {
			batchManager.push(getMessage("1"), /* reentrant */ false);
			const checkpoint = batchManager.checkpoint();
			checkpoint.rollback(rollBackCallback);

			assert.strictEqual(rollbackCalled, false);
			assert.strictEqual(batchManager.empty, false);
		});

		it("should succeed when rolling back entire pending stack", () => {
			const checkpoint = batchManager.checkpoint();
			batchManager.push(getMessage("11"), /* reentrant */ false);
			batchManager.push(getMessage("22"), /* reentrant */ false);
			batchManager.push(getMessage("33"), /* reentrant */ false);
			checkpoint.rollback(rollBackCallback);

			assert.strictEqual(rollbackCalled, true);
			assert.strictEqual(rollbackContent.length, 3);
			assert.strictEqual(rollbackContent[0].contents, "33");
			assert.strictEqual(rollbackContent[1].contents, "22");
			assert.strictEqual(rollbackContent[2].contents, "11");
			assert.strictEqual(batchManager.empty, true);
		});

		it("should succeed when rolling back part of pending stack", () => {
			batchManager.push(getMessage("11"), /* reentrant */ false);
			const checkpoint = batchManager.checkpoint();
			batchManager.push(getMessage("22"), /* reentrant */ false);
			batchManager.push(getMessage("33"), /* reentrant */ false);
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
			batchManager.push(getMessage("11"), /* reentrant */ false);
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
			closeError = undefined;
			pendingStateManager = new PendingStateManager(
				{
					applyStashedOp: () => {
						throw new Error();
					},
					clientId: () => "oldClientId",
					close: (error?: ICriticalContainerError) => (closeError = error),
					connected: () => true,
					reSubmit: () => {},
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				undefined /* initialLocalState */,
				undefined /* logger */,
			);
		});

		const submitBatch = (messages: Partial<ISequencedDocumentMessage>[]) => {
			messages.forEach((message) => {
				pendingStateManager.onSubmitMessage(
					JSON.stringify({ type: message.type, contents: message.contents }),
					message.referenceSequenceNumber,
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
			assert(isILoggingError(closeError));
			assert.strictEqual(closeError.errorType, ContainerErrorTypes.dataProcessingError);
			assert.strictEqual(closeError.getTelemetryProperties().hasBatchStart, true);
			assert.strictEqual(closeError.getTelemetryProperties().hasBatchEnd, false);
		});

		describe("processing out of sync messages will call close", () => {
			it("messageTypes do not match", () => {
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
						type: "otherType",
					})),
				);
				assert(isILoggingError(closeError));
				assert.strictEqual(closeError.errorType, ContainerErrorTypes.dataProcessingError);
				assert.strictEqual(
					closeError.getTelemetryProperties().expectedMessageType,
					MessageType.Operation,
				);
			});

			it("only one message has undefined content", () => {
				const messages: Partial<ISequencedDocumentMessage>[] = [
					{
						clientId,
						type: MessageType.Operation,
						clientSequenceNumber: 0,
						referenceSequenceNumber: 0,
						contents: {},
					},
				];

				submitBatch(messages);
				process(
					messages.map((message) => ({
						...message,
						contents: undefined,
					})),
				);
				assert.strictEqual(closeError?.errorType, ContainerErrorTypes.dataProcessingError);
			});

			it("stringified message content does not match", () => {
				const messages: Partial<ISequencedDocumentMessage>[] = [
					{
						clientId,
						type: MessageType.Operation,
						clientSequenceNumber: 0,
						referenceSequenceNumber: 0,
						contents: {},
					},
				];

				submitBatch(messages);
				process(
					messages.map((message) => ({
						...message,
						contents: { prop1: true },
					})),
				);
				assert.strictEqual(closeError?.errorType, ContainerErrorTypes.dataProcessingError);
			});
		});

		it("processing in sync messages will not call close", () => {
			const messages: Partial<ISequencedDocumentMessage>[] = [
				{
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					contents: { prop1: true },
				},
			];

			submitBatch(messages);
			process(
				messages.map((message) => ({
					...message,
					contents: { prop1: true },
				})),
			);
			assert.strictEqual(closeError, undefined, "unexpected close");
		});
	});

	describe("Local state processing", () => {
		function createPendingStateManager(pendingStates): PendingStateManager_WithPrivates {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => undefined,
					close: () => {},
					connected: () => true,
					reSubmit: () => {},
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				{ pendingStates },
				undefined /* logger */,
			) as any;
		}

		describe("Constructor pendingStates", () => {
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

			it("New format", () => {
				const messages = [
					{ type: "message", content: '{"type":"component"}' },
					{
						type: "message",
						content: '{"type": "component", "contents": {"prop1": "value"}}',
					},
				];
				const pendingStateManager = createPendingStateManager(messages);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), messages);
			});
		});

		describe("Future op compat behavior", () => {
			it("pending op roundtrip", async () => {
				const pendingStateManager = createPendingStateManager([]);
				const futureRuntimeMessage: Pick<ISequencedDocumentMessage, "type" | "contents"> &
					RecentlyAddedContainerRuntimeMessageDetails = {
					type: "FROM_THE_FUTURE",
					contents: "Hello",
					compatDetails: { behavior: "FailToProcess" },
				};

				pendingStateManager.onSubmitMessage(
					JSON.stringify(futureRuntimeMessage),
					0,
					undefined,
					undefined,
				);
				pendingStateManager.processPendingLocalMessage(
					futureRuntimeMessage as ISequencedDocumentMessage &
						UnknownContainerRuntimeMessage,
				);
			});
		});
	});

	describe("Pending messages state", () => {
		const messages = [
			{ type: "message", content: '{"type":"component"}' },
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop1": "value"}}',
			},
		];

		function createPendingStateManager(pendingStates): PendingStateManager_WithPrivates {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => undefined,
					close: () => {},
					connected: () => true,
					reSubmit: () => {},
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				{ pendingStates },
				undefined /* logger */,
			) as any;
		}

		it("no pending or initial messages", () => {
			const pendingStateManager = createPendingStateManager(undefined);
			assert.strictEqual(
				pendingStateManager.hasPendingMessages(),
				false,
				"There shouldn't be pending messages",
			);
			assert.strictEqual(
				pendingStateManager.pendingMessagesCount,
				0,
				"Pending messages count should be 0",
			);
		});

		it("has pending messages but no initial messages", () => {
			const pendingStateManager = createPendingStateManager(undefined);
			for (const message of messages) {
				pendingStateManager.onSubmitMessage(
					JSON.stringify(message.content),
					0,
					undefined /* localOpMetadata */,
					undefined /* opMetadata */,
				);
			}
			assert.strictEqual(
				pendingStateManager.hasPendingMessages(),
				true,
				"There should be pending messages",
			);
			assert.strictEqual(
				pendingStateManager.pendingMessagesCount,
				messages.length,
				"Pending messages count should be same as pending messages",
			);
		});

		it("has initial messages but no pending messages", () => {
			const pendingStateManager = createPendingStateManager(messages);
			assert.strictEqual(
				pendingStateManager.hasPendingMessages(),
				true,
				"There should be initial messages",
			);
			assert.strictEqual(
				pendingStateManager.pendingMessagesCount,
				messages.length,
				"Pending messages count should be same as initial messages",
			);
		});

		it("has both pending messages and initial messages", () => {
			const pendingStateManager = createPendingStateManager(messages);
			for (const message of messages) {
				pendingStateManager.onSubmitMessage(
					JSON.stringify(message.content),
					0,
					undefined /* localOpMetadata */,
					undefined /* opMetadata */,
				);
			}
			assert.strictEqual(
				pendingStateManager.hasPendingMessages(),
				true,
				"There should be pending messages",
			);
			assert.strictEqual(
				pendingStateManager.pendingMessagesCount,
				messages.length * 2,
				"Pending messages count should be same as pending + initial messages",
			);
		});
	});
});
