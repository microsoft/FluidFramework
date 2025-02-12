/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import {
	ContainerErrorTypes,
	type IErrorBase,
} from "@fluidframework/container-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger, createChildLogger } from "@fluidframework/telemetry-utils/internal";
import Deque from "double-ended-queue";

import type { InboundSequencedContainerRuntimeMessage } from "../messageTypes.js";
import {
	BatchManager,
	BatchMessage,
	type InboundMessageResult,
} from "../opLifecycle/index.js";
import {
	findFirstCharacterMismatched,
	IPendingMessage,
	PendingStateManager,
} from "../pendingStateManager.js";

type PendingStateManager_WithPrivates = Omit<PendingStateManager, "initialMessages"> & {
	initialMessages: Deque<IPendingMessage>;
};

describe("Pending State Manager", () => {
	const mockLogger = new MockLogger();
	const logger = createChildLogger({ logger: mockLogger });

	afterEach("ThrowOnErrorLogs", () => {
		// Note: If mockLogger is used within a test,
		// it may inadvertently clear errors such that they're not noticed here
		mockLogger.assertNoErrors();
		mockLogger.clear();
	});

	describe("Rollback", () => {
		let rollbackCalled: boolean;
		let rollbackContent: BatchMessage[];
		let rollbackShouldThrow: boolean;
		let batchManager: BatchManager;

		function getMessage(payload: string) {
			return { contents: payload } as unknown as BatchMessage;
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
		const clientId = "clientId";

		beforeEach(async () => {
			pendingStateManager = new PendingStateManager(
				{
					applyStashedOp: () => {
						throw new Error();
					},
					clientId: () => "oldClientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				undefined /* initialLocalState */,
				logger,
			);
		});

		const submitBatch = (
			messages: Partial<ISequencedDocumentMessage>[],
			clientSequenceNumber?: number,
			localOpMetadata?: unknown,
		) => {
			pendingStateManager.onFlushBatch(
				messages.map<BatchMessage>((message) => ({
					contents: JSON.stringify({ type: message.type, contents: message.contents }),
					referenceSequenceNumber: message.referenceSequenceNumber!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
					metadata: message.metadata as Record<string, unknown> | undefined,
					localOpMetadata,
				})),
				clientSequenceNumber ?? messages[0]?.clientSequenceNumber,
			);
		};

		const processFullBatch = (
			messages: Partial<ISequencedDocumentMessage>[],
			batchStartCsn: number,
			groupedBatch: boolean,
			emptyBatchSequenceNumber?: number,
			resubmittedBatchId?: string,
		) =>
			pendingStateManager.processInboundMessages(
				{
					type: "fullBatch",
					messages: messages as InboundSequencedContainerRuntimeMessage[],
					batchStart: {
						batchStartCsn,
						keyMessage: {
							sequenceNumber: emptyBatchSequenceNumber,
						} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
						clientId,
						batchId: resubmittedBatchId,
					},
					length: messages.length,
					groupedBatch,
				},
				true /* local */,
			);

		it("Grouped batch is processed correctly", () => {
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
			processFullBatch(messages, 0 /* batchStartCsn */, true /* groupedBatch */);
		});

		it("Ungrouped batch is processed correctly", () => {
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
			pendingStateManager.processInboundMessages(
				{
					type: "batchStartingMessage",
					nextMessage: messages[0] as InboundSequencedContainerRuntimeMessage,
					batchStart: {
						batchStartCsn: 0,
						keyMessage: messages[0] as ISequencedDocumentMessage,
						clientId,
						batchId: undefined,
					},
				} satisfies InboundMessageResult,
				true /* local */,
			);
			pendingStateManager.processInboundMessages(
				{
					type: "nextBatchMessage",
					nextMessage: messages[1] as InboundSequencedContainerRuntimeMessage,
				} satisfies InboundMessageResult,
				true /* local */,
			);
			pendingStateManager.processInboundMessages(
				{
					type: "nextBatchMessage",
					nextMessage: messages[2] as InboundSequencedContainerRuntimeMessage,
					batchEnd: true,
				} satisfies InboundMessageResult,
				true /* local */,
			);
		});

		it("empty batch is processed correctly", () => {
			// Empty batch is reflected in the pending state manager as a single message
			// with the following metadata:
			submitBatch(
				[
					{
						contents: JSON.stringify({ type: "groupedBatch", contents: [] }),
						referenceSequenceNumber: 0,
						metadata: { batchId: "batchId" },
					},
				],
				1 /* clientSequenceNumber */,
				{ emptyBatch: true },
			);
			// A groupedBatch is supposed to have nested messages inside its contents,
			// but an empty batch has no nested messages. When processing en empty grouped batch,
			// the psm will expect the next pending message to be an "empty" message as portrayed above.
			processFullBatch(
				[],
				1 /* batchStartCsn */,
				true /* groupedBatch */,
				3 /* emptyBatchSequenceNumber */,
				"batchId" /* resubmittedBatchId */,
			);
		});

		describe("processing out of sync messages will throw and log", () => {
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
				assert.throws(
					() =>
						processFullBatch(
							messages.map((message) => ({
								...message,
								type: "otherType",
							})),
							0 /* batchStartCsn */,
							false /* groupedBatch */,
						),
					(closeError: IErrorBase) =>
						closeError.errorType === ContainerErrorTypes.dataProcessingError,
				);
				mockLogger.assertMatch(
					[
						{
							eventName: "unexpectedAckReceived",
							pendingContentScrubbed: JSON.stringify({ type: "op" }),
							incomingContentScrubbed: JSON.stringify({ type: "otherType" }),
							contentsMatch: true,
							pendingLength: 13,
							incomingLength: 20,
							mismatchStartIndex: 10,
							pendingChar: "p",
							incomingChar: "t",
						},
					],
					"Expected to log scrubbed messages",
					true /* inlineDetailsProp */,
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
				assert.throws(
					() =>
						processFullBatch(
							messages.map((message) => ({
								...message,
								contents: undefined,
							})),
							0 /* batchStartCsn */,
							false /* groupedBatch */,
						),
					(closeError: IErrorBase) =>
						closeError.errorType === ContainerErrorTypes.dataProcessingError,
				);
				mockLogger.assertMatch(
					[
						{
							eventName: "unexpectedAckReceived",
							pendingContentScrubbed: JSON.stringify({ type: "op", contents: {} }),
							incomingContentScrubbed: JSON.stringify({ type: "op" }),
							contentsMatch: false,
							pendingLength: 27,
							incomingLength: 13,
							mismatchStartIndex: 12,
							pendingChar: ",",
							incomingChar: "}",
						},
					],
					"Expected to log scrubbed messages",
					true /* inlineDetailsProp */,
				);
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
				assert.throws(
					() =>
						processFullBatch(
							messages.map((message) => ({
								...message,
								contents: { prop1: true },
							})),
							0 /* batchStartCsn */,
							false /* groupedBatch */,
						),
					(closeError: IErrorBase) =>
						closeError.errorType === ContainerErrorTypes.dataProcessingError,
				);
				mockLogger.assertMatch(
					[
						{
							eventName: "unexpectedAckReceived",
							pendingContentScrubbed: JSON.stringify({ type: "op", contents: {} }),
							incomingContentScrubbed: JSON.stringify({
								type: "op",
								contents: { prop1: "boolean" },
							}),
							contentsMatch: false,
							pendingLength: 27,
							incomingLength: 39,
							mismatchStartIndex: 25,
							pendingChar: "}",
							incomingChar: '"',
						},
					],
					"Expected to log scrubbed messages",
					true /* inlineDetailsProp */,
				);
			});

			it("stringified message content out of order", () => {
				const message: Partial<ISequencedDocumentMessage> = {
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					contents: {},
				};

				// contents and type are swapped in the stringified message relative to what we typically do/expect
				pendingStateManager.onFlushBatch(
					[
						{
							contents: JSON.stringify({ contents: message.contents, type: message.type }),
							referenceSequenceNumber: 0,
						},
					],
					0 /* clientSequenceNumber */,
				);

				assert.throws(
					() => processFullBatch([message], 0 /* batchStartCsn */, false /* groupedBatch */),
					(closeError: IErrorBase) =>
						closeError.errorType === ContainerErrorTypes.dataProcessingError,
				);
				mockLogger.assertMatch(
					[
						{
							eventName: "unexpectedAckReceived",
							pendingContentScrubbed: JSON.stringify({ contents: {}, type: "op" }),
							incomingContentScrubbed: JSON.stringify({ type: "op", contents: {} }),
							contentsMatch: true,
							pendingLength: 27,
							incomingLength: 27,
							mismatchStartIndex: 2,
							pendingChar: "c",
							incomingChar: "t",
						},
					],
					"Expected to log scrubbed messages",
					true /* inlineDetailsProp */,
				);
			});

			it("stringified message content with unexpected keys", () => {
				const message: Partial<ISequencedDocumentMessage> = {
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					contents: {},
				};

				// contents and type are swapped in the stringified message relative to what we typically do/expect
				pendingStateManager.onFlushBatch(
					[
						{
							contents: JSON.stringify({
								type: message.type,
								contents: message.contents,
								somethingElse: 123, // Unexpected key
							}),
							referenceSequenceNumber: 0,
						},
					],
					0 /* clientSequenceNumber */,
				);

				assert.throws(
					() => processFullBatch([message], 0 /* batchStartCsn */, false /* groupedBatch */),
					(closeError: IErrorBase) =>
						closeError.errorType === ContainerErrorTypes.dataProcessingError,
				);
				mockLogger.assertMatch(
					[
						{
							eventName: "unexpectedAckReceived",
							pendingContentScrubbed: JSON.stringify({
								type: "op",
								contents: {},
								somethingElse: "number",
							}),
							incomingContentScrubbed: JSON.stringify({ type: "op", contents: {} }),
							contentsMatch: true,
							pendingLength: 47,
							incomingLength: 27,
							mismatchStartIndex: 26,
							pendingChar: ",",
							incomingChar: "}",
						},
					],
					"Expected to log scrubbed messages",
					true /* inlineDetailsProp */,
				);
			});

			it("processing in sync messages will not throw", () => {
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
				processFullBatch(
					messages.map((message) => ({
						...message,
						contents: { prop1: true },
					})),
					0 /* batchStartCsn */,
					false /* groupedBatch */,
				);
			});

			it("findFirstCharacterMismatched", () => {
				const testCases = [
					{ input: ["", ""], expected: [-1] },
					{ input: ["", "b"], expected: [0, undefined, "b"] },
					{ input: ["a", "b"], expected: [0, "a", "b"] },
					{ input: ["xyz", "xxx"], expected: [1, "y", "x"] },
					{ input: ["xyz", "xy"], expected: [2, "z", undefined] },
					{ input: ["xy", "xxx"], expected: [1, "y", "x"] },
					{ input: ["xyz", "xyz"], expected: [-1] },
				];
				for (const {
					input: [a, b],
					expected: [i, charA, charB],
				} of testCases) {
					assert.deepEqual(
						findFirstCharacterMismatched(a, b),
						[i, charA, charB],
						`Failed input: "${a}", "${b}"`,
					);
					assert.deepEqual(
						findFirstCharacterMismatched(b, a),
						[i, charB, charA],
						`Failed input: "${b}", "${a}"`,
					);
				}
			});
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
				processFullBatch(messages, 0 /* batchStartCsn */, false /* groupedBatch */);
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
		function createPendingStateManager(
			pendingStates: IPendingMessage[] | undefined,
		): PendingStateManager_WithPrivates {
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "CLIENT_ID",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				pendingStates ? { pendingStates } : undefined,
				logger,
			) as unknown as PendingStateManager_WithPrivates;
		}

		describe("Constructor pendingStates", () => {
			it("Empty local state", () => {
				{
					const pendingStateManager = createPendingStateManager(
						undefined as unknown as IPendingMessage[],
					);
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
				] as unknown as IPendingMessage[];
				const pendingStateManager = createPendingStateManager(messages);
				assert.deepStrictEqual(pendingStateManager.initialMessages.toArray(), messages);
			});
		});
	});

	describe("replayPendingStates", () => {
		let pendingStateManager: PendingStateManager;
		const resubmittedBatchIds: string[] = [];
		const clientId = "clientId";

		beforeEach(async () => {
			resubmittedBatchIds.length = 0;
			pendingStateManager = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => clientId,
					connected: () => true,
					reSubmitBatch: (batch, batchId) => {
						resubmittedBatchIds.push(batchId);
					},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				undefined /* initialLocalState */,
				logger,
			);
		});

		it("replays pending states", () => {
			const messages = [
				{
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					contents: {},
				},
				{
					type: MessageType.Operation,
					clientSequenceNumber: 1,
					referenceSequenceNumber: 0,
					contents: {},
				},
			];
			pendingStateManager.onFlushBatch(
				messages.map<BatchMessage>((message) => ({
					contents: JSON.stringify({ type: message.type, contents: message.contents }),
					referenceSequenceNumber: message.referenceSequenceNumber,
				})),
				0,
			);
			pendingStateManager.replayPendingStates();
			assert.strictEqual(resubmittedBatchIds[0], `${clientId}_[0]`);
			assert.strictEqual(resubmittedBatchIds[1], `${clientId}_[0]`);
		});

		it("replays pending states with empty batch", () => {
			// Empty batch is reflected in the pending state manager as a single message
			// with the following metadata:
			pendingStateManager.onFlushBatch(
				[
					{
						contents: JSON.stringify({ type: "groupedBatch", contents: [] }),
						referenceSequenceNumber: 0,
						metadata: { emptyBatch: true, batchId: "batchId" },
					},
				],
				0,
			);
			pendingStateManager.replayPendingStates();
			assert.strictEqual(resubmittedBatchIds[0], "batchId");
		});
	});

	describe("applyStashedOpsAt", () => {
		it("applyStashedOpsAt", async () => {
			const applyStashedOps: string[] = [];
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 10,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1 },
				},
				{
					type: "message",
					content: '{"type": "component", "contents": {"prop1": "value"}}',
					referenceSequenceNumber: 11,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1 },
				},
			];

			const pendingStateManager = new PendingStateManager(
				{
					applyStashedOp: async (content) => applyStashedOps.push(content),
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				{ pendingStates: messages },
				logger,
			);
			await pendingStateManager.applyStashedOpsAt();
			assert.strictEqual(applyStashedOps.length, 2);
			assert.strictEqual(pendingStateManager.pendingMessagesCount, 2);
		});

		it("applyStashedOpsAt for empty batch", async () => {
			const applyStashedOps: string[] = [];
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"groupedBatch", "contents": []}',
					referenceSequenceNumber: 10,
					opMetadata: undefined,
					localOpMetadata: { emptyBatch: true },
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1 },
				},
			];

			const pendingStateManager = new PendingStateManager(
				{
					applyStashedOp: async (content) => applyStashedOps.push(content),
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				{ pendingStates: messages },
				logger,
			);
			await pendingStateManager.applyStashedOpsAt();
			assert.strictEqual(applyStashedOps.length, 0);
			assert.strictEqual(pendingStateManager.pendingMessagesCount, 1);
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
		] as unknown as IPendingMessage[];

		function createPendingStateManager(
			pendingStates: IPendingMessage[] | undefined,
		): PendingStateManager_WithPrivates {
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "CLIENT_ID",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				pendingStates ? { pendingStates } : undefined,
				logger,
			) as unknown as PendingStateManager_WithPrivates;
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
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1 },
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop1": "value"}}',
				referenceSequenceNumber: 11,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1 },
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop2": "value"}}',
				referenceSequenceNumber: 12,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 3, length: 1 },
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop3": "value"}}',
				referenceSequenceNumber: 12,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 4, length: 1 },
			},
		];

		function createPendingStateManager(
			pendingStates?: IPendingMessage[],
		): PendingStateManager {
			return new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "123",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
				},
				pendingStates ? { pendingStates } : undefined /* initialLocalState */,
				logger,
			);
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
