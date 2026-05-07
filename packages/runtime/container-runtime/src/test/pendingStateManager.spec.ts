/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions */

import { strict as assert } from "node:assert";

import { booleanCases, generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import {
	ContainerErrorTypes,
	type IErrorBase,
} from "@fluidframework/container-definitions/internal";
import {
	MessageType,
	type ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type {
	FluidDataStoreMessage,
	IEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import { MockLogger, createChildLogger } from "@fluidframework/telemetry-utils/internal";
import type Deque from "double-ended-queue";
import Sinon from "sinon";

import {
	ContainerMessageType,
	type InboundSequencedContainerRuntimeMessage,
	type LocalContainerRuntimeMessage,
} from "../messageTypes.js";
import {
	addBatchMetadata,
	BatchManager,
	type LocalBatchMessage,
	OpGroupingManager,
	type InboundMessageResult,
} from "../opLifecycle/index.js";
import {
	findFirstCharacterMismatched,
	type IPendingMessage,
	PendingStateManager,
	type IPendingLocalState,
	type IRuntimeStateHandler,
	type PendingBatchResubmitMetadata,
	type PendingMessageResubmitData,
} from "../pendingStateManager.js";

type Patch<T, U> = Omit<T, keyof U> & U;

type PendingStateManager_WithPrivates = Patch<
	PendingStateManager,
	{
		pendingMessages: Deque<IPendingMessage>;
		initialMessages: Deque<IPendingMessage>;
	}
>;

// Make a mock op with distinguishable contents
function op(data: string = ""): LocalContainerRuntimeMessage {
	return {
		type: ContainerMessageType.FluidDataStoreOp,
		contents: data as unknown,
	} as LocalContainerRuntimeMessage;
}

function withBatchMetadata(
	messages: LocalBatchMessage[],
	batchId?: string,
): LocalBatchMessage[] {
	return addBatchMetadata({ messages, referenceSequenceNumber: -1 }, batchId).messages;
}

type StubbedRuntimeStateHandler = {
	[K in keyof IRuntimeStateHandler]: Sinon.SinonStub<
		Parameters<IRuntimeStateHandler[K]>,
		ReturnType<IRuntimeStateHandler[K]>
	>;
};

const testAddressedDataStoreMessage = {
	address: "test-address",
	contents: {
		type: "op",
		content: "test-content",
	},
} as const satisfies IEnvelope<FluidDataStoreMessage>;

describe("Pending State Manager", () => {
	const sandbox = Sinon.createSandbox();
	function getStateHandlerStub(): StubbedRuntimeStateHandler {
		const stubs: StubbedRuntimeStateHandler = {
			applyStashedOp: sandbox.stub(),
			clientId: sandbox.stub(),
			connected: sandbox.stub(),
			reSubmitBatch: sandbox.stub(),
			isActiveConnection: sandbox.stub(),
			isAttached: sandbox.stub(),
			isInStagingMode: sandbox.stub(),
		};
		stubs.applyStashedOp.resolves(undefined);
		stubs.clientId.returns("clientId");
		stubs.connected.returns(true);
		stubs.isActiveConnection.returns(true);
		stubs.isAttached.returns(true);
		stubs.isInStagingMode.returns(false);
		return stubs;
	}
	const mockLogger = new MockLogger();
	const logger = createChildLogger({ logger: mockLogger });
	const opGroupingManager = new OpGroupingManager({ groupedBatchingEnabled: true }, logger);

	function newPendingStateManager(
		stubs: IRuntimeStateHandler,
		stashedLocalState?: IPendingLocalState,
	): PendingStateManager_WithPrivates {
		return new PendingStateManager(
			stubs,
			stashedLocalState,
			logger,
		) as unknown as PendingStateManager_WithPrivates;
	}

	afterEach("Sinon sandbox restore", () => {
		sandbox.restore();
	});

	afterEach("ThrowOnErrorLogs", () => {
		// Note: If mockLogger is used within a test,
		// it may inadvertently clear errors such that they're not noticed here
		mockLogger.assertNoErrors();
		mockLogger.clear();
	});

	describe("Rollback", () => {
		let rollbackCalled: boolean;
		let rollbackContent: LocalBatchMessage[];
		let rollbackShouldThrow: boolean;
		let batchManager: BatchManager;

		function getMessage(payload: string) {
			return {
				runtimeOp: op(payload),
			} as LocalBatchMessage;
		}

		const rollBackCallback = (m: LocalBatchMessage) => {
			rollbackCalled = true;
			rollbackContent.push(m);
			if (rollbackShouldThrow) {
				throw new Error("test error");
			}
		};

		beforeEach(async () => {
			rollbackCalled = false;
			rollbackContent = [];
			rollbackShouldThrow = false;

			batchManager = new BatchManager({ disableGroupedBatching: false });
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
			assert.strictEqual(rollbackContent[0].runtimeOp.contents, "33");
			assert.strictEqual(rollbackContent[1].runtimeOp.contents, "22");
			assert.strictEqual(rollbackContent[2].runtimeOp.contents, "11");
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
			assert.strictEqual(rollbackContent[0].runtimeOp.contents, "33");
			assert.strictEqual(rollbackContent[1].runtimeOp.contents, "22");
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
						throw new Error("test error");
					},
					clientId: () => "oldClientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
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
				messages.map<LocalBatchMessage>((message) => ({
					runtimeOp: {
						type: message.type,
						contents: message.contents,
					} as LocalContainerRuntimeMessage,
					referenceSequenceNumber: message.referenceSequenceNumber!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
					metadata: message.metadata as Record<string, unknown> | undefined,
					localOpMetadata,
				})),
				clientSequenceNumber ?? messages[0]?.clientSequenceNumber,
				false /* staged */,
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
			const { placeholderMessage } = opGroupingManager.createEmptyGroupedBatch("batchId", 0);
			pendingStateManager.onFlushEmptyBatch(
				placeholderMessage,
				1 /* clientSequenceNumber */,
				false /* staged */,
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
							runtimeOp: {
								contents: message.contents,
								type: message.type,
							} as LocalContainerRuntimeMessage,
							referenceSequenceNumber: 0,
						},
					],
					0 /* clientSequenceNumber */,
					false /* staged */,
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
							runtimeOp: {
								type: message.type,
								contents: message.contents,
								somethingElse: 123, // Unexpected key
							} as LocalContainerRuntimeMessage,
							referenceSequenceNumber: 0,
						},
					],
					0 /* clientSequenceNumber */,
					false /* staged */,
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
				const nonAsciiChar = String.fromCodePoint(0x80);
				const testCases = [
					{ input: ["", ""], expected: [-1] },
					{ input: ["", "b"], expected: [0, undefined, "b"] },
					{ input: ["a", "b"], expected: [0, "a", "b"] },
					{ input: ["xyz", "xxx"], expected: [1, "y", "x"] },
					{ input: ["xyz", "xy"], expected: [2, "z", undefined] },
					{ input: ["xy", "xxx"], expected: [1, "y", "x"] },
					{ input: ["xyz", "xyz"], expected: [-1] },
					{ input: ["QQ", `Q${nonAsciiChar}`], expected: [1, "Q", "[non-ASCII]"] },
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
				let pendingState = pendingStateManager.getLocalState(0).pending.pendingStates;
				assert.strictEqual(pendingState.length, 10);
				pendingState = pendingStateManager.getLocalState(5).pending.pendingStates;
				assert.strictEqual(pendingState.length, 5);
				pendingState = pendingStateManager.getLocalState(10).pending.pendingStates;
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
				const pendingState = pendingStateManager.getLocalState(0).pending.pendingStates;
				assert.strictEqual(pendingState.length, 10);
			});
		});

		describe("staged-from-rehydration handling", () => {
			it("clears stagedFromStashedRehydration when ack arrives for a staged rehydrated op", () => {
				// Simulate the post-applyStashedOpsAt state with the staged-from-stashed
				// discriminator set. When the previous-session's ack arrives (delayed),
				// onLocalBatchBegin must clear those flags rather than asserting 0xb85.
				const psm = new PendingStateManager(
					{
						applyStashedOp: async () => undefined,
						clientId: () => clientId,
						connected: () => true,
						reSubmitBatch: () => {},
						isActiveConnection: () => false,
						isAttached: () => true,
						isInStagingMode: () => false,
					},
					undefined,
					logger,
				) as unknown as PendingStateManager_WithPrivates;

				// Direct inject so we can use protocol-level "op" type that the test
				// infrastructure round-trips, while still exercising the staged-from-
				// rehydration branch we care about.
				const stagedRehydratedMessage: IPendingMessage = {
					type: "message",
					content: '{"type":"op","contents":{"prop1":"value"}}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId, batchStartCsn: 0, length: 1, staged: true },
					runtimeOp: {
						type: MessageType.Operation,
						contents: { prop1: "value" },
					} as unknown as LocalContainerRuntimeMessage,
					stagedFromStashedRehydration: true,
				};
				psm.pendingMessages.push(stagedRehydratedMessage);

				const ackedMessage: Partial<ISequencedDocumentMessage> = {
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					contents: { prop1: "value" },
				};
				assert.doesNotThrow(() =>
					(psm as unknown as PendingStateManager).processInboundMessages(
						{
							type: "fullBatch",
							messages: [ackedMessage as InboundSequencedContainerRuntimeMessage],
							batchStart: {
								batchStartCsn: 0,
								keyMessage: ackedMessage as ISequencedDocumentMessage,
								clientId,
								batchId: undefined,
							},
							length: 1,
							groupedBatch: false,
						} satisfies InboundMessageResult,
						true /* local */,
					),
				);

				// Front message consumed (flags cleared inside onLocalBatchBegin before
				// the ack was processed).
				assert.strictEqual(psm.pendingMessages.length, 0, "ack consumed the message");
			});

			it("still asserts 0xb85 for a user-staged-in-session op at the front", () => {
				// Independent from rehydration: a user-staged op should never receive a
				// real ack since it doesn't go to the wire. If the queue front is staged
				// without the rehydration discriminator and a local ack arrives, the
				// assertion remains the desync detector it's always been.
				//
				// We directly inject a staged pending message because the normal
				// `onFlushBatch(staged: true, csn: defined)` path asserts 0xb84
				// (staged batches shouldn't have been submitted to the wire).
				const psm = new PendingStateManager(
					{
						applyStashedOp: async () => undefined,
						clientId: () => clientId,
						connected: () => true,
						reSubmitBatch: () => {},
						isActiveConnection: () => false,
						isAttached: () => true,
						isInStagingMode: () => false,
					},
					undefined,
					logger,
				) as unknown as PendingStateManager_WithPrivates;

				const stagedPendingMessage: IPendingMessage = {
					type: "message",
					content: '{"type":"component","contents":{"prop1":"value"}}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId, batchStartCsn: 0, length: 1, staged: true },
					runtimeOp: {
						type: MessageType.Operation,
						contents: { prop1: "value" },
					} as unknown as LocalContainerRuntimeMessage,
					// stagedFromStashedRehydration intentionally omitted — this is the
					// "user-staged in this session" path.
				};
				psm.pendingMessages.push(stagedPendingMessage);

				const ackedMessage: Partial<ISequencedDocumentMessage> = {
					clientId,
					type: MessageType.Operation,
					clientSequenceNumber: 0,
					referenceSequenceNumber: 0,
					contents: { prop1: "value" },
				};
				assert.throws(
					() =>
						(psm as unknown as PendingStateManager).processInboundMessages(
							{
								type: "fullBatch",
								messages: [ackedMessage as InboundSequencedContainerRuntimeMessage],
								batchStart: {
									batchStartCsn: 0,
									keyMessage: ackedMessage as ISequencedDocumentMessage,
									clientId,
									batchId: undefined,
								},
								length: 1,
								groupedBatch: false,
							} satisfies InboundMessageResult,
							true /* local */,
						),
					(error: Error) => error.message.includes("0xb85"),
				);
			});

			it("popStagedBatches removes the staged rehydrated message; subsequent state is consistent", async () => {
				// discardChanges drops the staged rehydrated op locally. Any subsequently-
				// arriving previous-session ack would be delivered over the new connection
				// with the prior session's clientId, so the connection layer treats it as
				// remote and onLocalBatchBegin is never called. PSM-side, the discard
				// must leave pendingMessages in a consistent state (empty, since this was
				// the only entry).
				const stashedMessage: IPendingMessage = {
					type: "message",
					content: '{"type":"component","contents":{"prop1":"value"}}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId, batchStartCsn: 0, length: 1, staged: false },
					runtimeOp: undefined,
				};
				const psm = new PendingStateManager(
					{
						applyStashedOp: async () => undefined,
						clientId: () => clientId,
						connected: () => true,
						reSubmitBatch: () => {},
						isActiveConnection: () => false,
						isAttached: () => true,
						isInStagingMode: () => true,
					},
					{ pendingStates: [stashedMessage] },
					logger,
				) as unknown as PendingStateManager_WithPrivates;
				await psm.applyStashedOpsAt();
				assert.strictEqual(psm.pendingMessages.length, 1);
				assert.strictEqual(psm.pendingMessages.peekFront()?.batchInfo.staged, true);

				// Discard.
				psm.popStagedBatches(() => {});
				assert.strictEqual(psm.pendingMessages.length, 0, "discard drained the queue");
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
					isInStagingMode: () => false,
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
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
				},
				{
					type: "message",
					content: '{"type": "component", "contents": {"prop1": "value"}}',
					referenceSequenceNumber: 11,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1, staged: false },
					runtimeOp: undefined,
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
					isInStagingMode: () => false,
				},
				{ pendingStates: messages },
				logger,
			);
			await pendingStateManager.applyStashedOpsAt();
			assert.strictEqual(applyStashedOps.length, 2);
			assert.strictEqual(pendingStateManager.pendingMessagesCount, 2);
		});

		it("applyStashedOpsAt for empty batch", async () => {
			const oldPsm = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "1",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
				},
				undefined /* initialLocalState */,
				logger,
			);
			const { placeholderMessage } = opGroupingManager.createEmptyGroupedBatch("batchId", 0);
			oldPsm.onFlushEmptyBatch(placeholderMessage, 0, false /* staged */);
			const localStateWithEmptyBatch = oldPsm.getLocalState(0).pending;

			const applyStashedOps: string[] = [];
			const pendingStateManager = new PendingStateManager(
				{
					applyStashedOp: async (content) => applyStashedOps.push(content),
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
				},
				localStateWithEmptyBatch,
				logger,
			);
			await pendingStateManager.applyStashedOpsAt();
			assert.strictEqual(applyStashedOps.length, 0);
			assert.strictEqual(pendingStateManager.pendingMessagesCount, 1);
		});

		it("does not invoke hooks when seqNum filter excludes the front message", async () => {
			let beforeCount = 0;
			let afterCount = 0;
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 10,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
				},
			];

			const psm = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
				},
				{ pendingStates: messages },
				logger,
				{
					onBeforeFirstStashedOpApply: async () => {
						beforeCount++;
					},
					onAfterStashedOpsApplied: async () => {
						afterCount++;
					},
				},
			);

			// seqNum 5 is below the front message's referenceSequenceNumber (10).
			// No op will be applied this call, so hooks must not fire and
			// isApplyingStashedOps must not flip — otherwise paired hooks fire
			// with no replay between them, and a start-handler that called
			// enterStagingMode() would trip "Already in staging mode" on the
			// next eligible call.
			await psm.applyStashedOpsAt(5);
			assert.strictEqual(beforeCount, 0, "before-hook should not fire");
			assert.strictEqual(afterCount, 0, "after-hook should not fire");
			assert.strictEqual(psm.isApplyingStashedOps, false);
			assert.strictEqual(psm.pendingMessagesCount, 1, "message must remain queued");
		});

		it("fires hooks once across multiple calls within a single load (latched)", async () => {
			// applyStashedOpsAt is invoked once at boot AND again per saved-op replay
			// during initial load (notifyOpReplay). The hooks must fire exactly once
			// per load — not once per refSeq group — so a host that calls
			// enterStagingMode() in the start handler doesn't trip "Already in
			// staging mode" on the second eligible call.
			let beforeCount = 0;
			let afterCount = 0;
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 5,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
				},
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 10,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1, staged: false },
					runtimeOp: undefined,
				},
			];

			const psm = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
				},
				{ pendingStates: messages },
				logger,
				{
					onBeforeFirstStashedOpApply: async () => {
						beforeCount++;
					},
					onAfterStashedOpsApplied: async () => {
						afterCount++;
					},
				},
			);

			// First call processes only the refSeq=5 message; refSeq=10 is filtered.
			await psm.applyStashedOpsAt(5);
			assert.strictEqual(beforeCount, 1, "before-hook fires on first eligible call");
			assert.strictEqual(afterCount, 0, "after-hook waits for full drain");
			assert.strictEqual(psm.isApplyingStashedOps, true, "window stays open across calls");

			// Second call processes the refSeq=10 message and drains the queue.
			await psm.applyStashedOpsAt(10);
			assert.strictEqual(beforeCount, 1, "before-hook does not re-fire");
			assert.strictEqual(afterCount, 1, "after-hook fires on drain");
			assert.strictEqual(psm.isApplyingStashedOps, false, "window closed");

			// Third call (e.g. another notifyOpReplay) is a no-op.
			await psm.applyStashedOpsAt(15);
			assert.strictEqual(beforeCount, 1);
			assert.strictEqual(afterCount, 1);
		});

		it("wraps hook errors as DataProcessingError and closes the apply window", async () => {
			// Hook throws during the apply window are stashed-op-apply failures
			// (per the convention from PR #16343). They must be classified as
			// DataProcessingError, not propagate as raw Error.
			//
			// Critically, the apply window must close on the throw path so the
			// runtime doesn't stay permanently readonly (`isApplyingStashedOps`
			// returns false post-throw) and any host that received
			// `pendingStateApplyStart` gets a paired `pendingStateApplyEnd`.
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
				},
			];

			let afterHookCalled = 0;
			const psm = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
				},
				{ pendingStates: messages },
				logger,
				{
					onBeforeFirstStashedOpApply: async () => {
						throw new Error("hook explosion");
					},
					onAfterStashedOpsApplied: async () => {
						afterHookCalled++;
					},
				},
			);

			await assert.rejects(
				psm.applyStashedOpsAt(),
				(error: IErrorBase) => error.errorType === ContainerErrorTypes.dataProcessingError,
				"hook errors are wrapped as DataProcessingError",
			);
			assert.strictEqual(
				psm.isApplyingStashedOps,
				false,
				"flag must clear on throw — otherwise runtime stays readonly",
			);
			assert.strictEqual(
				afterHookCalled,
				1,
				"after-hook fires once even on the pre-hook throw path",
			);
		});

		it("closes the apply window when the apply loop throws on a non-empty queue", async () => {
			// `applyStashedOp` rejects mid-loop; finally must still close the window.
			// Without this, isApplyingStashedOps would stay true forever (the apply
			// loop's queue is non-empty when the throw escapes) and the runtime
			// would advertise readonly indefinitely.
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
				},
				// Second message guarantees the queue is non-empty when applyStashedOp
				// rejects on the first one.
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1, staged: false },
					runtimeOp: undefined,
				},
			];

			let afterHookCalled = 0;
			const psm = new PendingStateManager(
				{
					applyStashedOp: async () => {
						throw new Error("apply-stashed-op explosion");
					},
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
				},
				{ pendingStates: messages },
				logger,
				{
					onAfterStashedOpsApplied: async () => {
						afterHookCalled++;
					},
				},
			);

			await assert.rejects(
				psm.applyStashedOpsAt(),
				(error: IErrorBase) => error.errorType === ContainerErrorTypes.dataProcessingError,
			);
			assert.strictEqual(
				psm.isApplyingStashedOps,
				false,
				"flag must clear on apply-loop throw",
			);
			assert.strictEqual(afterHookCalled, 1, "after-hook fires on apply-loop throw");
		});

		it("ignores empty-batch placeholders in the staging eligibility scan", async () => {
			// Empty `groupedBatch` placeholders (created by `onFlushEmptyBatch`) carry
			// no user intent and live alongside real ops in the stashed queue. They
			// must not flip the staging decision off — otherwise any stash containing
			// a single empty batch would silently disable staging on the rehydration
			// path, breaking discardChanges() for the offline edits.
			const messages: IPendingMessage[] = [
				// Empty groupedBatch placeholder — would be rejected by canStageMessageOfType.
				{
					type: "message",
					content: '{"type":"groupedBatch","contents":[]}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
				},
				// Real un-acked FluidDataStoreOp — stageable.
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1, staged: false },
					runtimeOp: undefined,
				},
			];

			const psm = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => true,
				},
				{ pendingStates: messages },
				logger,
			) as unknown as PendingStateManager_WithPrivates;

			await psm.applyStashedOpsAt();

			const queue = psm.pendingMessages.toArray();
			assert.strictEqual(queue.length, 2);
			// The real op is staged because the empty-batch placeholder didn't disable
			// the decision.
			const realOp = queue.find((m) => m.runtimeOp !== undefined);
			assert.ok(realOp !== undefined);
			assert.strictEqual(realOp.batchInfo.staged, true);
			assert.strictEqual(realOp.stagedFromStashedRehydration, true);
		});

		it("stages every un-acked rehydrated op including non-FluidDataStoreOp types", async () => {
			// All un-acked stashed ops are staged regardless of runtime-op type when
			// the host enters staging mode. Non-stageable types (Attach, Alias,
			// BlobAttach, IdAllocation) don't go through the regular submit path on
			// (re)connect — they sit in the queue (see replayPendingStates skip in
			// the non-committing path) until the host commits or discards. Discard
			// dispatches to type-specific rollback handlers in containerRuntime's
			// `rollbackStagedChange`.
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"blobAttach","metadata":{}}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
				},
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1, staged: false },
					runtimeOp: undefined,
				},
			];

			const psm = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => true,
				},
				{ pendingStates: messages },
				logger,
			) as unknown as PendingStateManager_WithPrivates;

			await psm.applyStashedOpsAt();

			const queue = psm.pendingMessages.toArray();
			for (const msg of queue) {
				assert.strictEqual(
					msg.batchInfo.staged,
					true,
					"all un-acked rehydrated ops are staged regardless of type",
				);
				assert.strictEqual(msg.stagedFromStashedRehydration, true);
			}
		});

		it("marks un-acked rehydrated ops staged when staging mode is active", async () => {
			// Acked messages have a sequenceNumber; un-acked do not. The selective
			// mutation should only re-stage the un-acked ones, preserving the queue
			// invariant that non-staged precede staged.
			const messages: IPendingMessage[] = [
				{
					type: "message",
					content: '{"type":"component"}',
					referenceSequenceNumber: 10,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
					runtimeOp: undefined,
					sequenceNumber: 11, // acked
				},
				{
					type: "message",
					content: '{"type": "component", "contents": {"prop1": "value"}}',
					referenceSequenceNumber: 12,
					localOpMetadata: undefined,
					opMetadata: undefined,
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1, staged: false },
					runtimeOp: undefined,
					// sequenceNumber omitted — un-acked
				},
			];

			const psm = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "clientId",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => true,
				},
				{ pendingStates: messages },
				logger,
			) as unknown as PendingStateManager_WithPrivates;

			await psm.applyStashedOpsAt();

			const queue = psm.pendingMessages.toArray();
			assert.strictEqual(queue.length, 2);
			assert.strictEqual(queue[0].batchInfo.staged, false, "acked op stays non-staged");
			assert.strictEqual(
				queue[0].stagedFromStashedRehydration,
				undefined,
				"acked op has no rehydration flag",
			);
			assert.strictEqual(queue[1].batchInfo.staged, true, "un-acked op is staged");
			assert.strictEqual(
				queue[1].stagedFromStashedRehydration,
				true,
				"un-acked op carries rehydration discriminator",
			);
		});
	});

	describe("Pending messages state", () => {
		const forInitialMessages = [
			{ type: "message", content: '{"type":"component"}', referenceSequenceNumber: 10 },
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop1": "value"}}',
				referenceSequenceNumber: 10,
			},
		] as IPendingMessage[];
		const forFlushedMessages: LocalBatchMessage[] = [
			{
				runtimeOp: { type: "component" } as LocalContainerRuntimeMessage,
				referenceSequenceNumber: 10,
			},
			{
				runtimeOp: { type: "component" } as LocalContainerRuntimeMessage,
				referenceSequenceNumber: 10,
			},
		];

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
					isInStagingMode: () => false,
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
			for (const message of forFlushedMessages) {
				pendingStateManager.onFlushBatch(
					[
						{
							runtimeOp: message.runtimeOp,
							referenceSequenceNumber: message.referenceSequenceNumber,
						},
					],
					0,
					false /* staged */,
				);
			}
			assert.strictEqual(
				pendingStateManager.hasPendingMessages(),
				true,
				"There should be pending messages",
			);
			assert.strictEqual(
				pendingStateManager.pendingMessagesCount,
				forFlushedMessages.length,
				"Pending messages count should be same as pending messages",
			);
		});

		it("has initial messages but no pending messages", () => {
			const pendingStateManager = createPendingStateManager(forInitialMessages);
			assert.strictEqual(
				pendingStateManager.hasPendingMessages(),
				true,
				"There should be initial messages",
			);
			assert.strictEqual(
				pendingStateManager.pendingMessagesCount,
				forFlushedMessages.length,
				"Pending messages count should be same as initial messages",
			);
		});

		it("has both pending messages and initial messages", () => {
			const pendingStateManager = createPendingStateManager(forInitialMessages);
			// let each message be its own batch
			for (const message of forFlushedMessages) {
				pendingStateManager.onFlushBatch(
					[
						{
							runtimeOp: message.runtimeOp,
							referenceSequenceNumber: message.referenceSequenceNumber,
						},
					],
					0,
					false /* staged */,
				);
			}
			assert.strictEqual(
				pendingStateManager.hasPendingMessages(),
				true,
				"There should be pending messages",
			);
			assert.strictEqual(
				pendingStateManager.pendingMessagesCount,
				forInitialMessages.length + forFlushedMessages.length,
				"Pending messages count should be same as pending + initial messages",
			);
		});
	});

	describe("Minimum sequence number", () => {
		const forInitialMessages: IPendingMessage[] = [
			{
				type: "message",
				content: '{"type":"component"}',
				referenceSequenceNumber: 10,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 1, staged: false },
				runtimeOp: undefined,
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop1": "value"}}',
				referenceSequenceNumber: 11,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 2, length: 1, staged: false },
				runtimeOp: undefined,
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop2": "value"}}',
				referenceSequenceNumber: 12,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 3, length: 1, staged: false },
				runtimeOp: undefined,
			},
			{
				type: "message",
				content: '{"type": "component", "contents": {"prop3": "value"}}',
				referenceSequenceNumber: 12,
				localOpMetadata: undefined,
				opMetadata: undefined,
				batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 4, length: 1, staged: false },
				runtimeOp: undefined,
			},
		];
		const forFlushedMessages = forInitialMessages.map<LocalBatchMessage>(
			(message: IPendingMessage) => ({
				runtimeOp: JSON.parse(message.content) as LocalContainerRuntimeMessage,
				referenceSequenceNumber: message.referenceSequenceNumber,
			}),
		);

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
					isInStagingMode: () => false,
				},
				pendingStates ? { pendingStates } : undefined /* initialLocalState */,
				logger,
			);
		}

		it("minimum sequence number can be retrieved from initial messages", async () => {
			const pendingStateManager = createPendingStateManager(forInitialMessages);
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
			for (const message of forFlushedMessages) {
				pendingStateManager.onFlushBatch(
					[
						{
							runtimeOp: message.runtimeOp,
							referenceSequenceNumber: message.referenceSequenceNumber,
						},
					],
					0,
					false /* staged */,
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

	describe("hasPendingUserChanges", () => {
		function createPendingStateManager(
			pendingMessages: IPendingMessage[] = [],
			initialMessages: IPendingMessage[] = [],
		): PendingStateManager_WithPrivates {
			const psm: PendingStateManager_WithPrivates = new PendingStateManager(
				{
					applyStashedOp: async () => undefined,
					clientId: () => "CLIENT_ID",
					connected: () => true,
					reSubmitBatch: () => {},
					isActiveConnection: () => false,
					isAttached: () => true,
					isInStagingMode: () => false,
				},
				{ pendingStates: initialMessages },
				logger,
			) as unknown as PendingStateManager_WithPrivates;

			psm.pendingMessages.push(...pendingMessages);
			return psm;
		}
		const dirtyableOp = {
			type: ContainerMessageType.Alias,
		} satisfies Partial<LocalContainerRuntimeMessage> as LocalContainerRuntimeMessage;
		const nonDirtyableOp = {
			type: ContainerMessageType.GC,
		} satisfies Partial<LocalContainerRuntimeMessage> as LocalContainerRuntimeMessage;

		it("returns false when there are no pending or initial messages", () => {
			const psm = createPendingStateManager();
			assert.strictEqual(
				psm.hasPendingUserChanges(),
				false,
				"Should be false with no messages",
			);
		});

		it("returns true if any pending message is dirtyable", () => {
			const pendingMessages: Partial<IPendingMessage>[] = [
				{
					runtimeOp: dirtyableOp,
				},
			];
			const psm = createPendingStateManager(pendingMessages as IPendingMessage[]);
			assert.strictEqual(
				psm.hasPendingUserChanges(),
				true,
				"Should be true with dirtyable op",
			);
		});

		it("returns false if all pending messages are not dirtyable", () => {
			const pendingMessages: Partial<IPendingMessage>[] = [
				{
					runtimeOp: nonDirtyableOp,
				},
			];
			const psm = createPendingStateManager(pendingMessages as IPendingMessage[]);
			assert.strictEqual(
				psm.hasPendingUserChanges(),
				false,
				"Should be false with non-dirtyable op",
			);
		});

		it("returns false if all pending messages are empty batches (runtimeOp undefined)", () => {
			const psm = createPendingStateManager();
			const { placeholderMessage } = opGroupingManager.createEmptyGroupedBatch("batchId", 0);
			psm.onFlushEmptyBatch(placeholderMessage, 0, false);
			assert.strictEqual(
				psm.hasPendingUserChanges(),
				false,
				"Should be false for empty batch",
			);
		});

		it("returns true if there are any initial messages, even if non-dirtyable", () => {
			const initialMessages: Partial<IPendingMessage>[] = [
				{
					runtimeOp: nonDirtyableOp,
				},
			];
			const psm = createPendingStateManager([], initialMessages as IPendingMessage[]);
			assert.strictEqual(
				psm.hasPendingUserChanges(),
				true,
				"Should be true with initial messages",
			);
		});
	});

	describe("replayPendingStates", () => {
		const clientId = "clientId";

		for (const {
			firstBatchSize,
			secondBatchSize,
			secondBatchStaged,
		} of generatePairwiseOptions({
			firstBatchSize: [0, 1] as const, // 0 means no ops resubmitted so it becomes an empty batch during replay
			secondBatchSize: [undefined, 1, 2] as const, // undefined means no second batch
			secondBatchStaged: booleanCases,
		})) {
			it(`should replay all pending states as batches [batch sizes: ${firstBatchSize} / ${secondBatchSize} ${secondBatchStaged ? "(staged)" : ""}]`, () => {
				const stubs = getStateHandlerStub();
				const pendingStateManager = newPendingStateManager(stubs);
				const RefSeqInitial_10 = 10;
				const refSeqResubmit_15 = 15;

				stubs.reSubmitBatch.callsFake((batch, metadata) => {
					// Here's where we implement [firstBatchSize === 0] case - Flush an empty batch on resubmit
					if (firstBatchSize === 0 && stubs.reSubmitBatch.callCount === 1) {
						assert(
							metadata.batchId !== undefined,
							"PRECONDITION: Expected batchId for empty batch",
						);
						const { placeholderMessage } = opGroupingManager.createEmptyGroupedBatch(
							metadata.batchId,
							refSeqResubmit_15,
						);
						pendingStateManager.onFlushEmptyBatch(
							placeholderMessage,
							/* clientSequenceNumber: */ 1,
							/* staged: */ metadata.staged,
						);
						return;
					}

					// Otherwise, simulate the typical re-submission of the batch through the ContainerRuntime
					pendingStateManager.onFlushBatch(
						withBatchMetadata(
							batch.map(({ runtimeOp, opMetadata, localOpMetadata }) => ({
								runtimeOp,
								referenceSequenceNumber: refSeqResubmit_15,
								metadata: opMetadata,
								localOpMetadata: `${localOpMetadata}_RESUBMITTED`,
							})),
							metadata.batchId,
						),
						/* clientSequenceNumber: */ metadata.staged ? undefined : 1,
						/* staged: */ metadata.staged,
					);
				});

				// First batch - Always starts with 1 op, but will become empty on replay if firstBatchSize is 0
				pendingStateManager.onFlushBatch(
					[
						{
							runtimeOp: {
								type: ContainerMessageType.FluidDataStoreOp,
								contents: testAddressedDataStoreMessage,
							},
							referenceSequenceNumber: RefSeqInitial_10,
							metadata: undefined, // Single message batch has no batch metadata
							localOpMetadata: "FIRST_BATCH_MSG1",
						},
					],
					/* clientSequenceNumber: */ 1,
					/* staged: */ false,
				);
				// Second batch (if applicable) - May have multiple ops or be skipped altogether
				if (secondBatchSize !== undefined) {
					pendingStateManager.onFlushBatch(
						withBatchMetadata(
							Array.from<unknown, LocalBatchMessage>({ length: secondBatchSize }, (_, i) => ({
								runtimeOp: {
									type: ContainerMessageType.FluidDataStoreOp,
									contents: testAddressedDataStoreMessage,
								},
								referenceSequenceNumber: RefSeqInitial_10,
								localOpMetadata: `SECOND_BATCH_MSG${i + 1}`,
							})),
						),
						/* clientSequenceNumber: */ secondBatchStaged ? undefined : 2,
						/* staged: */ secondBatchStaged,
					);
				}
				pendingStateManager.replayPendingStates();

				const resubmittedMessages = pendingStateManager.pendingMessages.toArray();
				assert.equal(
					resubmittedMessages.length,
					1 + (secondBatchSize ?? 0), // Even if firstBatchSize is 0, we still have the empty batch placeholder
					"Incorrect number of resubmitted messages",
				);

				// First batch expectations - Should be 1 pending message, either the empty batch placeholder or the first message
				const [firstResubmittedBatchPendingMessage] = resubmittedMessages.splice(0, 1);
				(({
					batchInfo: { length, staged },
					opMetadata,
					referenceSequenceNumber,
				}: IPendingMessage) => {
					assert.strictEqual(length, 1, "First batch size incorrect");
					assert.strictEqual(opMetadata?.batchId, `${clientId}_[1]`);
					assert.strictEqual(staged, false);
					assert.strictEqual(referenceSequenceNumber, refSeqResubmit_15);
				})(firstResubmittedBatchPendingMessage);

				// Second batch expectations
				if (secondBatchSize === undefined) {
					assert(resubmittedMessages.length === 0, "No second batch expected");
					return;
				}
				const secondResubmittedBatchPendingMessages = resubmittedMessages.splice(
					0,
					secondBatchSize,
				);
				// The first messages should have batchInfo and batchId on it
				(({ batchInfo: { length, staged }, opMetadata }: IPendingMessage) => {
					assert.strictEqual(length, secondBatchSize, "Wrong batch size (2nd)");
					if (secondBatchStaged) {
						assert((opMetadata?.batchId as string)?.length === 41, "Wrong clientId (2nd)");
						assert((opMetadata?.batchId as string)?.includes("-1"), "Wrong clientId (2nd)");
					} else {
						assert.strictEqual(opMetadata?.batchId, `${clientId}_[2]`, "Wrong clientId (2nd)");
					}
					assert.strictEqual(staged, secondBatchStaged, "Wrong staged flag (2nd)");
				})(secondResubmittedBatchPendingMessages[0]);
				// Every message should have the same reference sequence number
				assert(
					secondResubmittedBatchPendingMessages.every(
						(m) => m.referenceSequenceNumber === refSeqResubmit_15,
					),
					"Second batch reference sequence number incorrect",
				);
			});
		}

		it("should replay only staged batches when committingStagedBatches is true", () => {
			const stubs = getStateHandlerStub();
			const pendingStateManager = newPendingStateManager(stubs);
			const reSubmittedBatches: {
				batch: PendingMessageResubmitData[];
				metadata: PendingBatchResubmitMetadata;
			}[] = [];
			stubs.reSubmitBatch.callsFake((batch, metadata) => {
				reSubmittedBatches.push({ batch, metadata });
			});

			// Enqueue an unstaged one first, then staged.  The opposite order is not possible/supported
			pendingStateManager.onFlushBatch(
				[
					{
						runtimeOp: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: testAddressedDataStoreMessage,
						},
						referenceSequenceNumber: 13,
						metadata: undefined,
						localOpMetadata: { foo: "unstaged" },
					},
				],
				/* clientSequenceNumber: */ 1,
				/* staged: */ false,
			);
			pendingStateManager.onFlushBatch(
				[
					{
						runtimeOp: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: testAddressedDataStoreMessage,
						},
						referenceSequenceNumber: 12,
						metadata: undefined,
						localOpMetadata: { foo: "staged" },
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ true,
			);
			pendingStateManager.replayPendingStates({
				committingStagedBatches: true,
				squash: false,
			});
			// We should only resubmit the staged batch, with the staged flag cleared
			assert.strictEqual(
				reSubmittedBatches.length,
				1,
				"Should resubmit only the staged batch when committingStagedBatches is true",
			);
			assert.deepStrictEqual(
				reSubmittedBatches[0].batch[0].localOpMetadata,
				{ foo: "staged" },
				"Should resubmit the staged batch",
			);
			assert.strictEqual(
				reSubmittedBatches[0].metadata.staged,
				false,
				"Staged flag should be cleared on resubmission",
			);
			// The unstaged batch should remain in the pendingMessages queue
			assert.strictEqual(
				pendingStateManager.pendingMessages.length,
				1,
				"Unstaged batch should remain in the queue",
			);
			assert.deepStrictEqual(
				pendingStateManager.pendingMessages.peekFront()?.localOpMetadata,
				{
					foo: "unstaged",
				},
			);
		});

		it("should throw if replayPendingStates is called twice for same clientId without committingStagedBatches", () => {
			const stubs = getStateHandlerStub();
			const pendingStateManager = newPendingStateManager(stubs);
			const reSubmittedBatches: {
				batch: PendingMessageResubmitData[];
				metadata: PendingBatchResubmitMetadata;
			}[] = [];
			stubs.reSubmitBatch.callsFake((batch, metadata) => {
				reSubmittedBatches.push({ batch, metadata });
			});
			pendingStateManager.onFlushBatch(
				[
					{
						runtimeOp: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: testAddressedDataStoreMessage,
						},
						referenceSequenceNumber: 15,
						metadata: undefined,
						localOpMetadata: { foo: "bar" },
					},
				],
				/* clientSequenceNumber: */ 1,
				/* staged: */ false,
			);
			// This will set clientIdFromLastReplay
			pendingStateManager.replayPendingStates();
			// Add another batch to allow replay again
			pendingStateManager.onFlushBatch(
				[
					{
						runtimeOp: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: testAddressedDataStoreMessage,
						},
						referenceSequenceNumber: 15,
						metadata: undefined,
						localOpMetadata: { foo: "bar" },
					},
				],
				/* clientSequenceNumber: */ 1,
				/* staged: */ false,
			);
			// This will throw since clientIdFromLastReplay is already set to the same clientId
			assert.throws(
				() => pendingStateManager.replayPendingStates(),
				/0x173/,
				"Should throw if replayPendingStates is called twice for same clientId",
			);
		});

		it("should set squash flag when replayPendingStates is called with squash: true", () => {
			const stubs = getStateHandlerStub();
			const pendingStateManager = newPendingStateManager(stubs);
			pendingStateManager.onFlushBatch(
				[
					{
						runtimeOp: {
							type: ContainerMessageType.FluidDataStoreOp,
							contents: testAddressedDataStoreMessage,
						},
						referenceSequenceNumber: 16,
						metadata: undefined,
						localOpMetadata: { foo: "bar" },
					},
				],
				/* clientSequenceNumber: */ 1,
				/* staged: */ false,
			);
			pendingStateManager.replayPendingStates({
				squash: true,
				committingStagedBatches: false,
			});
			assert(
				stubs.reSubmitBatch.calledOnceWith(Sinon.match.any, {
					squash: true,
					staged: Sinon.match.bool,
					batchId: Sinon.match.string,
				}),
				"Squash flag should be set to true",
			);
		});
	});

	describe("popStagedBatches", () => {
		it("should pop all staged batch messages in LIFO order and invoke callback", () => {
			const stubs = getStateHandlerStub();
			const psm = newPendingStateManager(stubs);

			// Add staged batch 1
			psm.onFlushBatch(
				[
					{
						runtimeOp: op("foo1"),
						referenceSequenceNumber: 1,
						metadata: undefined,
						localOpMetadata: undefined,
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ true,
			);
			// Add staged batch 2
			psm.onFlushBatch(
				[
					{
						runtimeOp: op("foo2"),
						referenceSequenceNumber: 2,
						metadata: undefined,
						localOpMetadata: undefined,
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ true,
			);
			const popped: string[] = [];
			psm.popStagedBatches((msg) => {
				popped.push(msg.runtimeOp.contents as string);
			});
			assert.deepStrictEqual(popped, ["foo2", "foo1"], "Should pop in LIFO order");
			assert.strictEqual(
				psm.hasPendingMessages(),
				false,
				"All staged messages should be popped",
			);
		});

		it("should not pop unstaged messages", () => {
			const stubs = getStateHandlerStub();
			const psm = newPendingStateManager(stubs);

			// Add unstaged batch
			psm.onFlushBatch(
				[
					{
						runtimeOp: op("foo1"),
						referenceSequenceNumber: 1,
						metadata: undefined,
						localOpMetadata: undefined,
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ false,
			);
			// Add staged batch
			psm.onFlushBatch(
				[
					{
						runtimeOp: op("foo2"),
						referenceSequenceNumber: 2,
						metadata: undefined,
						localOpMetadata: undefined,
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ true,
			);
			const popped: string[] = [];
			psm.popStagedBatches((msg) => {
				popped.push(msg.runtimeOp.contents as string);
			});
			assert.deepStrictEqual(popped, ["foo2"], "Should only pop staged messages");
			assert.strictEqual(psm.hasPendingMessages(), true, "Unstaged message should remain");
			assert.strictEqual(
				psm.pendingMessages.length,
				1,
				"Only unstaged message should remain in queue",
			);
		});

		it("should not invoke callback for empty batch or messages without runtimeOp", () => {
			const stubs = getStateHandlerStub();
			const psm = newPendingStateManager(stubs);

			// Add staged empty batch
			const { placeholderMessage } = opGroupingManager.createEmptyGroupedBatch("batchId", 3);
			psm.onFlushEmptyBatch(
				placeholderMessage,
				/* clientSequenceNumber: */ undefined,
				/* staged: */ true,
			);
			// Add staged message with no runtimeOp (simulate by direct mutation after adding)
			psm.onFlushBatch(
				[
					{
						runtimeOp: op("foo2"),
						referenceSequenceNumber: 4,
						metadata: undefined,
						localOpMetadata: undefined,
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ true,
			);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			psm.pendingMessages.peekBack()!.runtimeOp = undefined;
			// Add staged normal batch
			psm.onFlushBatch(
				[
					{
						runtimeOp: op("foo3"),
						referenceSequenceNumber: 5,
						metadata: undefined,
						localOpMetadata: undefined,
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ true,
			);
			const popped: string[] = [];
			psm.popStagedBatches((msg) => {
				popped.push(msg.runtimeOp.contents as string);
			});
			assert.deepStrictEqual(
				popped,
				["foo3"],
				"Should only invoke the callback on staged messages with typical runtimeOp",
			);
			assert.strictEqual(
				psm.pendingMessages.length,
				0,
				"Non-typical staged messages should also be popped, just without invoking callback",
			);
		});

		it("should do nothing if there are no staged messages", () => {
			const stubs = getStateHandlerStub();
			const psm = newPendingStateManager(stubs);

			// Add unstaged batch
			psm.onFlushBatch(
				[
					{
						runtimeOp: op("foo1"),
						referenceSequenceNumber: 1,
						metadata: undefined,
						localOpMetadata: undefined,
					},
				],
				/* clientSequenceNumber: */ undefined,
				/* staged: */ false,
			);
			const popped: string[] = [];
			psm.popStagedBatches((msg) => {
				popped.push(msg.runtimeOp.type as string);
			});
			assert.deepStrictEqual(popped, [], "Should not pop any messages");
			assert.strictEqual(
				psm.pendingMessages.length,
				1,
				"Unstaged message should remain in queue",
			);
		});
	});
});
