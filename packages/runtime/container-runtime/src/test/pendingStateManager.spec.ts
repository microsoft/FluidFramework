/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	MockLogger2,
	createChildLogger,
	isILoggingError,
} from "@fluidframework/telemetry-utils/internal";
import Deque from "double-ended-queue";

import type {
	InboundSequencedContainerRuntimeMessage,
	RecentlyAddedContainerRuntimeMessageDetails,
	UnknownContainerRuntimeMessage,
} from "../messageTypes.js";
import { BatchManager, BatchMessage } from "../opLifecycle/index.js";
import { IPendingMessage, PendingStateManager } from "../pendingStateManager.js";

type PendingStateManager_WithPrivates = Omit<PendingStateManager, "initialMessages"> & {
	initialMessages: Deque<IPendingMessage>;
};

describe("Pending State Manager", () => {
	const mockLogger = new MockLogger2();
	const logger = createChildLogger({ logger: mockLogger });

	afterEach("ThrowOnErrorLogs", () => {
		// Note: If mockLogger is used within a test,
		// it may inadvertently clear errors such that they're not noticed here
		mockLogger.assertNoErrors();
		mockLogger.clear();
	});

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

			batchManager = new BatchManager({ hardLimit: 950 * 1024, canRebase: true });
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
		let pendingStateManager: PendingStateManager;
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
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				undefined /* initialLocalState */,
				logger,
			);
		});

		const submitBatch = (messages: Partial<ISequencedDocumentMessage>[]) => {
			pendingStateManager.onFlushBatch(
				messages.map<BatchMessage>((message) => ({
					contents: JSON.stringify({ type: message.type, contents: message.contents }),
					referenceSequenceNumber: message.referenceSequenceNumber!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
					metadata: message.metadata as any as Record<string, unknown> | undefined,
				})),
				messages[0]?.clientSequenceNumber,
			);
		};

		const process = (messages: Partial<ISequencedDocumentMessage>[], batchStartCsn: number) =>
			pendingStateManager.processPendingLocalBatch(
				messages as InboundSequencedContainerRuntimeMessage[],
				batchStartCsn,
			);

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
			process(messages, 0 /* batchStartCsn */);
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
			process(messages, 0 /* batchStartCsn */);
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
					0 /* batchStartCsn */,
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
					0 /* batchStartCsn */,
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
					0 /* batchStartCsn */,
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
				0 /* batchStartCsn */,
			);
			assert.strictEqual(closeError, undefined, "unexpected close");
		});

		describe("getLocalState", () => {
			it("removes ops with seq num lower than snapshot", () => {
				const messages = Array.from({ length: 10 }, (_, i) => ({
					clientId: "clientId",
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					contents: { prop1: true },
					sequenceNumber: i + 1, // starting with sequence number 1 so first assert does not filter any op
				}));
				submitBatch(messages);
				process(messages, 0 /* batchStartCsn */);
				let pendingState = pendingStateManager.getLocalState(0).pendingStates;
				assert.strictEqual(pendingState.length, 10);
				pendingState = pendingStateManager.getLocalState(5).pendingStates;
				assert.strictEqual(pendingState.length, 5);
				pendingState = pendingStateManager.getLocalState(10).pendingStates;
				assert.strictEqual(pendingState.length, 0);
			});

			it("throws when trying to get unprocessed ops older than snapshot", () => {
				const messages = Array.from({ length: 10 }, (_, i) => ({
					clientId: "clientId",
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					contents: { prop1: true },
					referenceSequenceNumber: i,
				}));
				submitBatch(messages);
				assert.throws(() => pendingStateManager.getLocalState(1));
				const pendingState = pendingStateManager.getLocalState(0).pendingStates;
				assert.strictEqual(pendingState.length, 10);
			});
		});
	});

	describe("Local state processing", () => {
		function createPendingStateManager(pendingStates): PendingStateManager_WithPrivates {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "CLIENT_ID",
					close: () => {},
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				{ pendingStates },
				logger,
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
					{
						type: "message",
						content: '{"type":"component"}',
						referenceSequenceNumber: 10,
					},
					{
						type: "message",
						content: '{"type": "component", "contents": {"prop1": "value"}}',
						referenceSequenceNumber: 10,
					},
				];
				const pendingStateManager = createPendingStateManager(messages);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), messages);
			});
		});

		describe("Future op compat behavior", () => {
			it("pending op roundtrip", async () => {
				const pendingStateManager = createPendingStateManager([]);
				const futureRuntimeMessage: Pick<
					ISequencedDocumentMessage,
					"type" | "contents" | "clientSequenceNumber"
				> &
					RecentlyAddedContainerRuntimeMessageDetails = {
					type: "FROM_THE_FUTURE",
					contents: "Hello",
					compatDetails: { behavior: "FailToProcess" },
					clientSequenceNumber: 1,
				};

				pendingStateManager.onFlushBatch(
					[
						{
							contents: JSON.stringify(futureRuntimeMessage),
							referenceSequenceNumber: 0,
						},
					],
					1,
				);
				pendingStateManager.processPendingLocalBatch(
					[futureRuntimeMessage as ISequencedDocumentMessage & UnknownContainerRuntimeMessage],
					1 /* batchStartCsn */,
				);
			});
		});
	});

	describe("Pending messages state", () => {
		const messages = [
			{ type: "message", content: '{"type":"component"}', referenceSequenceNumber: 10 },
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop1": "value"}}',
				referenceSequenceNumber: 10,
			},
		];

		function createPendingStateManager(pendingStates): PendingStateManager_WithPrivates {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "CLIENT_ID",
					close: () => {},
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				{ pendingStates },
				logger,
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
			// let each message be its own batch
			for (const message of messages) {
				pendingStateManager.onFlushBatch(
					[
						{
							contents: message.content,
							referenceSequenceNumber: message.referenceSequenceNumber,
						},
					],
					0,
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
			// let each message be its own batch
			for (const message of messages) {
				pendingStateManager.onFlushBatch(
					[
						{
							contents: message.content,
							referenceSequenceNumber: message.referenceSequenceNumber,
						},
					],
					0,
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

	describe("Minimum sequence number", () => {
		const messages: IPendingMessage[] = [
			{
				type: "message",
				content: '{"type":"component"}',
				referenceSequenceNumber: 10,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchIdContext: { clientId: "CLIENT_ID", batchStartCsn: 1 },
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop1": "value"}}',
				referenceSequenceNumber: 11,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchIdContext: { clientId: "CLIENT_ID", batchStartCsn: 2 },
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop2": "value"}}',
				referenceSequenceNumber: 12,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchIdContext: { clientId: "CLIENT_ID", batchStartCsn: 3 },
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop3": "value"}}',
				referenceSequenceNumber: 12,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchIdContext: { clientId: "CLIENT_ID", batchStartCsn: 3 },
			},
		];

		function createPendingStateManager(
			pendingStates?: IPendingMessage[],
		): PendingStateManager {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "123",
					close: () => {},
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				pendingStates ? { pendingStates } : undefined /* initialLocalState */,
				logger,
			) as any;
		}

		it("minimum sequence number can be retrieved from initial messages", async () => {
			const pendingStateManager = createPendingStateManager(messages);
			await pendingStateManager.applyStashedOpsAt();

			assert.strictEqual(
				pendingStateManager.minimumPendingMessageSequenceNumber,
				10,
				"minimum sequence number should be the first message",
			);

			pendingStateManager.replayPendingStates();

			assert.strictEqual(
				pendingStateManager.minimumPendingMessageSequenceNumber,
				undefined,
				"Should have processed messages and thus have no min seq number",
			);
		});

		it("minimum sequence number can be retrieved from pending messages", async () => {
			const pendingStateManager = createPendingStateManager();
			assert.strictEqual(
				pendingStateManager.minimumPendingMessageSequenceNumber,
				undefined,
				"No pending messages should mean no minimum seq number",
			);
			// Each message has a different reference sequence number so let them each be their own batch
			for (const message of messages) {
				pendingStateManager.onFlushBatch(
					[
						{
							contents: message.content,
							referenceSequenceNumber: message.referenceSequenceNumber,
						},
					],
					0,
				);
			}

			assert.strictEqual(
				pendingStateManager.minimumPendingMessageSequenceNumber,
				10,
				"has pending messages and thus a minimum seq number",
			);

			pendingStateManager.replayPendingStates();
			assert.strictEqual(
				pendingStateManager.minimumPendingMessageSequenceNumber,
				undefined,
				"Should no minimum sequence number as there are no messages",
			);
		});
	});
});
