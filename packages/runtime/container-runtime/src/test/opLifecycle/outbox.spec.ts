/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	IDeltaManager,
	IBatchMessage,
	IContainerContext,
} from "@fluidframework/container-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { IDocumentMessage, MessageType } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	CompressionAlgorithms,
	ICompressionRuntimeOptions,
	makeLegacySendBatchFn,
} from "../../containerRuntime.js";
import { ContainerMessageType } from "../../messageTypes.js";
import {
	BatchMessage,
	BatchSequenceNumbers,
	IBatch,
	OpCompressor,
	OpGroupingManager,
	type OpGroupingManagerConfig,
	OpSplitter,
	Outbox,
} from "../../opLifecycle/index.js";
import { IPendingBatchMessage, PendingStateManager } from "../../pendingStateManager.js";

function typeFromBatchedOp(op: IBatchMessage) {
	assert(op.contents !== undefined);
	return JSON.parse(op.contents).type as string;
}

describe("Outbox", () => {
	const maxBatchSizeInBytes = 1024;
	interface State {
		deltaManagerFlushCalls: number;
		canSendOps: boolean;
		batchesSubmitted: { messages: IBatchMessage[]; referenceSequenceNumber?: number }[];
		batchesCompressed: IBatch[];
		batchesSplit: IBatch[];
		individualOpsSubmitted: any[];
		pendingOpContents: any[];
		opsSubmitted: number;
		opsResubmitted: number;
		isReentrant: boolean;
	}
	const state: State = {
		deltaManagerFlushCalls: 0,
		canSendOps: true,
		batchesSubmitted: [],
		batchesCompressed: [],
		batchesSplit: [],
		individualOpsSubmitted: [],
		pendingOpContents: [],
		opsSubmitted: 0,
		opsResubmitted: 0,
		isReentrant: false,
	};

	const mockLogger = new MockLogger();
	const getMockDeltaManager = (): Partial<
		IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>
	> => ({
		flush() {
			state.deltaManagerFlushCalls++;
		},
	});

	const getMockContext = (): Partial<IContainerContext> => ({
		deltaManager: getMockDeltaManager() as IDeltaManager<
			ISequencedDocumentMessage,
			IDocumentMessage
		>,
		clientDetails: { capabilities: { interactive: true } },
		updateDirtyContainerState: (_dirty: boolean) => {},
		submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => {
			state.individualOpsSubmitted.push({ type, contents, batch, appData });
			state.opsSubmitted++;
			return state.opsSubmitted;
		},
		submitBatchFn: (batch: IBatchMessage[], referenceSequenceNumber?: number): number => {
			state.batchesSubmitted.push({ messages: batch, referenceSequenceNumber });
			state.opsSubmitted += batch.length;
			return state.opsSubmitted;
		},
	});

	const getMockLegacyContext = (): Partial<IContainerContext> => ({
		deltaManager: getMockDeltaManager() as IDeltaManager<
			ISequencedDocumentMessage,
			IDocumentMessage
		>,
		clientDetails: { capabilities: { interactive: true } },
		updateDirtyContainerState: (_dirty: boolean) => {},
		submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => {
			state.individualOpsSubmitted.push({ type, contents, batch, appData });
			state.opsSubmitted++;
			return state.opsSubmitted;
		},
		connected: true,
	});

	const getMockCompressor = (): Partial<OpCompressor> => ({
		compressBatch: (batch: IBatch): IBatch => {
			state.batchesCompressed.push(batch);
			return batch;
		},
	});

	const getMockSplitter = (enabled: boolean, chunkSizeInBytes: number): Partial<OpSplitter> => ({
		chunkSizeInBytes,
		isBatchChunkingEnabled: enabled,
		splitFirstBatchMessage: (batch: IBatch): IBatch => {
			state.batchesSplit.push(batch);
			return batch;
		},
	});

	const getMockPendingStateManager = (): Partial<PendingStateManager> => ({
		onSubmitMessage: (
			content: string,
			referenceSequenceNumber: number,
			_localOpMetadata: unknown,
			opMetadata: Record<string, unknown> | undefined,
		): void => {
			state.pendingOpContents.push({ content, referenceSequenceNumber, opMetadata });
		},
	});

	const createMessage = (type: ContainerMessageType, contents: string): BatchMessage => ({
		contents: JSON.stringify({ type, contents }),
		metadata: undefined,
		localOpMetadata: {},
		referenceSequenceNumber: Number.POSITIVE_INFINITY,
	});

	const batchedMessage = (
		message: BatchMessage,
		batchMarker: boolean | undefined = undefined,
	) => ({
		contents: message.contents,
		metadata:
			batchMarker === undefined
				? message.metadata
				: { ...message.metadata, batch: batchMarker },
		compression: undefined,
		referenceSequenceNumber: message.referenceSequenceNumber,
	});

	const addBatchMetadata = (messages: BatchMessage[]): BatchMessage[] => {
		if (messages.length > 1) {
			messages[0].metadata = {
				...messages[0].metadata,
				batch: true,
			};
			messages[messages.length - 1].metadata = {
				...messages[messages.length - 1].metadata,
				batch: false,
			};
		}

		return messages;
	};
	const toBatch = (messages: BatchMessage[]): IBatch => ({
		content: addBatchMetadata(messages),
		contentSizeInBytes: messages
			.map((message) => message.contents?.length ?? 0)
			.reduce((a, b) => a + b, 0),
		referenceSequenceNumber:
			messages.length === 0 ? undefined : messages[0].referenceSequenceNumber,
		hasReentrantOps: false,
	});

	const DefaultCompressionOptions = {
		minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
		compressionAlgorithm: CompressionAlgorithms.lz4,
	};

	let currentSeqNumbers: BatchSequenceNumbers = {};

	const getOutbox = (params: {
		context: IContainerContext;
		maxBatchSize?: number;
		compressionOptions?: ICompressionRuntimeOptions;
		enableChunking?: boolean;
		disablePartialFlush?: boolean;
		chunkSizeInBytes?: number;
		opGroupingConfig?: OpGroupingManagerConfig;
	}) => {
		const { submitFn, submitBatchFn, deltaManager } = params.context;

		const legacySendBatchFn = makeLegacySendBatchFn(submitFn, deltaManager);

		return new Outbox({
			shouldSend: () => state.canSendOps,
			pendingStateManager: getMockPendingStateManager() as PendingStateManager,
			submitBatchFn,
			legacySendBatchFn,
			compressor: getMockCompressor() as OpCompressor,
			splitter: getMockSplitter(
				params.enableChunking ?? false,
				params.chunkSizeInBytes ?? Number.POSITIVE_INFINITY,
			) as OpSplitter,
			config: {
				maxBatchSizeInBytes: params.maxBatchSize ?? maxBatchSizeInBytes,
				compressionOptions: params.compressionOptions ?? DefaultCompressionOptions,
				disablePartialFlush: params.disablePartialFlush ?? false,
			},
			logger: mockLogger,
			groupingManager: new OpGroupingManager(
				params.opGroupingConfig ?? {
					groupedBatchingEnabled: false,
					opCountThreshold: Infinity,
					reentrantBatchGroupingEnabled: false,
				},
				mockLogger,
			),
			getCurrentSequenceNumbers: () => currentSeqNumbers,
			reSubmit: (message: IPendingBatchMessage) => {
				state.opsResubmitted++;
			},
			opReentrancy: () => state.isReentrant,
			closeContainer: (error?: ICriticalContainerError) => {},
		});
	};

	beforeEach(() => {
		state.deltaManagerFlushCalls = 0;
		state.canSendOps = true;
		state.batchesSubmitted.splice(0);
		state.batchesCompressed.splice(0);
		state.batchesSplit.splice(0);
		state.individualOpsSubmitted.splice(0);
		state.pendingOpContents.splice(0);
		state.opsSubmitted = 0;
		state.opsResubmitted = 0;
		state.isReentrant = false;
		currentSeqNumbers = {};
		mockLogger.clear();
	});

	it("Sending batches", () => {
		const outbox = getOutbox({ context: getMockContext() as IContainerContext });
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"),
			createMessage(ContainerMessageType.IdAllocation, "3"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "4"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "5"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submitIdAllocation(messages[3]);

		outbox.flush();

		outbox.submit(messages[4]);
		outbox.flush();

		outbox.submit(messages[5]);

		assert.equal(state.opsSubmitted, messages.length - 1);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[
				[batchedMessage(messages[2], true), batchedMessage(messages[3], false)],
				[batchedMessage(messages[0], true), batchedMessage(messages[1], false)],
				[batchedMessage(messages[4])], // The last message was not batched
			],
		);
		assert.equal(state.deltaManagerFlushCalls, 0);
		const rawMessagesInFlushOrder = [
			messages[2],
			messages[3],
			messages[0],
			messages[1],
			messages[4],
		];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Will send messages only when allowed, but will store them in the pending state", () => {
		const outbox = getOutbox({ context: getMockContext() as IContainerContext });
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
		];
		outbox.submit(messages[0]);
		outbox.flush();

		outbox.submit(messages[1]);
		state.canSendOps = false;
		outbox.flush();

		assert.equal(state.opsSubmitted, 1);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[[batchedMessage(messages[0])]],
		);
		assert.deepEqual(
			state.pendingOpContents,
			messages.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Uses legacy path for legacy contexts", () => {
		const outbox = getOutbox({ context: getMockLegacyContext() as IContainerContext });
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);

		outbox.flush();

		assert.equal(state.opsSubmitted, messages.length);
		assert.equal(state.batchesSubmitted.length, 0);
		assert.deepEqual(state.individualOpsSubmitted.length, messages.length);
		assert.equal(state.deltaManagerFlushCalls, 2);
		const rawMessagesInFlushOrder = [messages[2], messages[0], messages[1], messages[3]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Compress only if compression is enabled", () => {
		const outbox = getOutbox({
			context: getMockContext() as IContainerContext,
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);

		outbox.flush();

		assert.equal(state.opsSubmitted, messages.length);
		assert.equal(state.batchesSubmitted.length, 2);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.deltaManagerFlushCalls, 0);
		assert.deepEqual(state.batchesCompressed, [
			toBatch([messages[2]]),
			toBatch([messages[0], messages[1], messages[3]]),
		]);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[
				[batchedMessage(messages[2])],
				[
					batchedMessage(messages[0], true),
					batchedMessage(messages[1]),
					batchedMessage(messages[3], false),
				],
			],
		);

		const rawMessagesInFlushOrder = [messages[2], messages[0], messages[1], messages[3]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Compress only if the batch is larger than the configured limit", () => {
		const outbox = getOutbox({
			context: getMockContext() as IContainerContext,
			maxBatchSize: 1,
			compressionOptions: {
				minimumBatchSizeInBytes: 1024,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);

		outbox.flush();

		assert.equal(state.opsSubmitted, messages.length);
		assert.equal(state.batchesSubmitted.length, 2);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.deltaManagerFlushCalls, 0);
		assert.deepEqual(state.batchesCompressed, []);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[
				[batchedMessage(messages[2])],
				[
					batchedMessage(messages[0], true),
					batchedMessage(messages[1]),
					batchedMessage(messages[3], false),
				],
			],
		);

		const rawMessagesInFlushOrder = [messages[2], messages[0], messages[1], messages[3]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Throws at flush, when compression is enabled and the compressed batch is still larger than the threshold", () => {
		const outbox = getOutbox({
			context: getMockContext() as IContainerContext,
			maxBatchSize: 1,
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "2"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submit(messages[2]);

		assert.throws(() => outbox.flush());
		// The batch is compressed
		assert.deepEqual(state.batchesCompressed, [toBatch(messages)]);
		// The batch is not persisted
		assert.deepEqual(state.pendingOpContents, []);
	});

	it("Chunks when compression is enabled, compressed batch is larger than the threshold and chunking is enabled", () => {
		const outbox = getOutbox({
			context: getMockContext() as IContainerContext,
			maxBatchSize: 1,
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			enableChunking: true,
			chunkSizeInBytes: 2,
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);

		outbox.flush();
		assert.deepEqual(state.batchesCompressed, [
			toBatch([messages[2]]),
			toBatch([messages[0], messages[1], messages[3]]),
		]);
		assert.deepEqual(state.batchesSplit, [
			toBatch([messages[2]]),
			toBatch([messages[0], messages[1], messages[3]]),
		]);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[
				[batchedMessage(messages[2])],
				[
					batchedMessage(messages[0], true),
					batchedMessage(messages[1]),
					batchedMessage(messages[3], false),
				],
			],
		);

		const rawMessagesInFlushOrder = [messages[2], messages[0], messages[1], messages[3]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Does not chunk when compression is enabled, compressed batch is smaller than the threshold and chunking is enabled", () => {
		const outbox = getOutbox({
			context: getMockContext() as IContainerContext,
			maxBatchSize: 1,
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			enableChunking: true,
			chunkSizeInBytes: 10000,
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);

		outbox.flush();
		assert.deepEqual(state.batchesCompressed, [
			toBatch([messages[2]]),
			toBatch([messages[0], messages[1], messages[3]]),
		]);
		assert.deepEqual(state.batchesSplit, []);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[
				[batchedMessage(messages[2])],
				[
					batchedMessage(messages[0], true),
					batchedMessage(messages[1]),
					batchedMessage(messages[3], false),
				],
			],
		);
	});

	it("Splits the batch when an out of order message is detected", () => {
		const outbox = getOutbox({ context: getMockContext() as IContainerContext });
		const messages = [
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
				referenceSequenceNumber: 1,
			},
		];

		currentSeqNumbers.referenceSequenceNumber = 1;

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.flush();

		assert.equal(state.opsSubmitted, messages.length);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.batchesSubmitted.length, 2);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[[batchedMessage(messages[0])], [batchedMessage(messages[1])]],
		);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.referenceSequenceNumber),
			[0, 1],
		);
		assert.equal(state.deltaManagerFlushCalls, 0);
		const rawMessagesInFlushOrder = [messages[0], messages[1]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);

		mockLogger.assertMatch([
			{
				eventName: "Outbox:ReferenceSequenceNumberMismatch",
			},
		]);
	});

	[
		[
			{
				...createMessage(ContainerMessageType.IdAllocation, "0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.IdAllocation, "0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				referenceSequenceNumber: 1,
			},
		],
		[
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.IdAllocation, "0"),
				referenceSequenceNumber: 1,
			},
		],
	].forEach((ops: BatchMessage[]) => {
		it("Flushes all batches when an out of order message is detected in either flows", () => {
			const outbox = getOutbox({ context: getMockContext() as IContainerContext });
			for (const op of ops) {
				currentSeqNumbers.referenceSequenceNumber = op.referenceSequenceNumber;
				if (typeFromBatchedOp(op) === ContainerMessageType.IdAllocation) {
					outbox.submitIdAllocation(op);
				} else {
					outbox.submit(op);
				}
			}

			assert.equal(state.opsSubmitted, ops.length - 1);
			assert.equal(state.individualOpsSubmitted.length, 0);
			assert.equal(state.batchesSubmitted.length, 1);
			assert.deepEqual(
				state.batchesSubmitted.map((x) => x.messages),
				[[batchedMessage(ops[0]), batchedMessage(ops[1])]],
			);

			mockLogger.assertMatch([
				{
					eventName: "Outbox:ReferenceSequenceNumberMismatch",
				},
			]);
		});
	});

	it("Does not flush the batch when an out of order message is detected, if configured", () => {
		const outbox = getOutbox({
			context: getMockContext() as IContainerContext,
			disablePartialFlush: true,
		});
		const messages: BatchMessage[] = [
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
				referenceSequenceNumber: 1,
			},
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
				referenceSequenceNumber: 2,
			},
			{
				...createMessage(ContainerMessageType.IdAllocation, "1"),
				referenceSequenceNumber: 3,
			},
			{
				...createMessage(ContainerMessageType.IdAllocation, "1"),
				referenceSequenceNumber: 3,
			},
		];

		for (const message of messages) {
			currentSeqNumbers.referenceSequenceNumber = message.referenceSequenceNumber;
			if (typeFromBatchedOp(message) === ContainerMessageType.IdAllocation) {
				outbox.submitIdAllocation(message);
			} else {
				outbox.submit(message);
			}
		}

		assert.equal(state.opsSubmitted, 0);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.batchesSubmitted.length, 0);

		mockLogger.assertMatch([
			{
				eventName: "Outbox:ReferenceSequenceNumberMismatch",
			},
		]);
	});

	it("Log at most 3 reference sequence number mismatch events", () => {
		const outbox = getOutbox({ context: getMockContext() as IContainerContext });

		for (let i = 0; i < 10; i++) {
			currentSeqNumbers.referenceSequenceNumber = 0;
			outbox.submit({
				...createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				referenceSequenceNumber: 0,
			});
			currentSeqNumbers.referenceSequenceNumber = 1;
			outbox.submit({
				...createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				referenceSequenceNumber: 1,
			});
		}

		mockLogger.assertMatch(
			new Array(3).fill({
				eventName: "Outbox:ReferenceSequenceNumberMismatch",
			}),
		);
	});

	it("blobAttach ops always flush before regular ops", () => {
		const outbox = getOutbox({ context: getMockContext() as IContainerContext });

		const messages = [
			createMessage(ContainerMessageType.BlobAttach, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.BlobAttach, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
			createMessage(ContainerMessageType.BlobAttach, "4"),
		];

		outbox.submitBlobAttach(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitBlobAttach(messages[2]);
		outbox.submit(messages[3]);
		outbox.submitBlobAttach(messages[4]);

		outbox.flush();
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[
				[
					batchedMessage(messages[0], true),
					batchedMessage(messages[2]),
					batchedMessage(messages[4], false),
				],
				[batchedMessage(messages[1], true), batchedMessage(messages[3], false)],
			],
		);

		const rawMessagesInFlushOrder = [
			messages[0],
			messages[2],
			messages[4],
			messages[1],
			messages[3],
		];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	describe("flush", () => {
		function validateCounts(
			opsSubmitted: number,
			batchesSubmitted: number,
			opsResubmitted: number,
		) {
			assert.strictEqual(state.opsSubmitted, opsSubmitted, "unexpected opsSubmitted");
			assert.strictEqual(
				state.batchesSubmitted.length,
				batchesSubmitted,
				"unexpected batchesSubmitted",
			);
			assert.strictEqual(state.opsResubmitted, opsResubmitted, "unexpected opsResubmitted");
		}

		it("batch has reentrant ops, but grouped batching is off", () => {
			const outbox = getOutbox({
				context: getMockContext() as IContainerContext,
				opGroupingConfig: {
					groupedBatchingEnabled: false,
					opCountThreshold: 2,
					reentrantBatchGroupingEnabled: true,
				},
			});

			const messages = [
				createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			];

			outbox.submit(messages[0]);
			outbox.submit(messages[1]);

			outbox.flush();

			validateCounts(2, 1, 0);
		});

		it("batch has reentrant ops", () => {
			const outbox = getOutbox({
				context: getMockContext() as IContainerContext,
				opGroupingConfig: {
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
					reentrantBatchGroupingEnabled: true,
				},
			});

			const messages = [
				createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			];

			state.isReentrant = true;
			outbox.submit(messages[0]);
			outbox.submit(messages[1]);
			state.isReentrant = false;

			outbox.flush();

			validateCounts(0, 0, 2);
		});

		it("should group the batch", () => {
			const outbox = getOutbox({
				context: getMockContext() as IContainerContext,
				opGroupingConfig: {
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
					reentrantBatchGroupingEnabled: true,
				},
			});

			const messages = [
				createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			];

			outbox.submit(messages[0]);
			outbox.submit(messages[1]);

			outbox.flush();

			validateCounts(1, 1, 0);
		});

		it("should not group the batch", () => {
			const outbox = getOutbox({
				context: getMockContext() as IContainerContext,
				opGroupingConfig: {
					groupedBatchingEnabled: false,
					opCountThreshold: 2,
					reentrantBatchGroupingEnabled: true,
				},
			});

			const messages = [
				createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
				createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			];

			outbox.submit(messages[0]);
			outbox.submit(messages[1]);

			outbox.flush();

			validateCounts(2, 1, 0);
		});

		it("should not group blobAttach ops", () => {
			const outbox = getOutbox({
				context: getMockContext() as IContainerContext,
				opGroupingConfig: {
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
					reentrantBatchGroupingEnabled: true,
				},
			});

			const messages = [
				createMessage(ContainerMessageType.BlobAttach, "0"),
				createMessage(ContainerMessageType.BlobAttach, "1"),
			];

			outbox.submitBlobAttach(messages[0]);
			outbox.submitBlobAttach(messages[1]);

			outbox.flush();

			validateCounts(2, 1, 0);
		});
	});
});
