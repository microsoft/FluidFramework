/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	IDeltaManager,
	IBatchMessage,
	IContainerContext,
} from "@fluidframework/container-definitions/internal";
import {
	IDocumentMessage,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import {
	CompressionAlgorithms,
	ICompressionRuntimeOptions,
	makeLegacySendBatchFn,
} from "../../containerRuntime.js";
import { ContainerMessageType } from "../../messageTypes.js";
import { asBatchMetadata, asEmptyBatchLocalOpMetadata } from "../../metadata.js";
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
import {
	PendingMessageResubmitData,
	PendingStateManager,
	type IPendingMessage,
} from "../../pendingStateManager.js";

function typeFromBatchedOp(op: IBatchMessage) {
	assert(op.contents !== undefined);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
		individualOpsSubmitted: unknown[];
		pendingOpContents: Partial<IPendingMessage & { batchStartCsn: number }>[];
		opsSubmitted: number;
		opsResubmitted: number;
		isReentrant: boolean;
	}
	// state will be set to defaults in beforeEach
	const state: State = {} as unknown as State;

	const mockLogger = new MockLogger();
	const getMockDeltaManager = (): Partial<
		IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>
	> => ({
		flush() {
			state.deltaManagerFlushCalls++;
		},
	});

	const getMockContext = (): IContainerContext =>
		({
			deltaManager: getMockDeltaManager() as IDeltaManager<
				ISequencedDocumentMessage,
				IDocumentMessage
			>,
			clientDetails: { capabilities: { interactive: true } },
			updateDirtyContainerState: (_dirty: boolean) => {},
			submitFn: (type: MessageType, contents: unknown, batch: boolean, appData?: unknown) => {
				state.individualOpsSubmitted.push({ type, contents, batch, appData });
				state.opsSubmitted++;
				return state.opsSubmitted;
			},
			submitBatchFn: (batch: IBatchMessage[], referenceSequenceNumber?: number): number => {
				state.batchesSubmitted.push({ messages: batch, referenceSequenceNumber });
				state.opsSubmitted += batch.length;
				return state.opsSubmitted;
			},
		}) satisfies Partial<IContainerContext> as IContainerContext;

	const getMockLegacyContext = (): Partial<IContainerContext> => ({
		deltaManager: getMockDeltaManager() as IDeltaManager<
			ISequencedDocumentMessage,
			IDocumentMessage
		>,
		clientDetails: { capabilities: { interactive: true } },
		updateDirtyContainerState: (_dirty: boolean) => {},
		submitFn: (type: MessageType, contents: unknown, batch: boolean, appData?: unknown) => {
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

	const getMockSplitter = (
		enabled: boolean,
		chunkSizeInBytes: number,
	): Partial<OpSplitter> => ({
		chunkSizeInBytes,
		isBatchChunkingEnabled: enabled,
		splitFirstBatchMessage: (batch: IBatch): IBatch => {
			state.batchesSplit.push(batch);
			return batch;
		},
	});

	const getMockPendingStateManager = (): Partial<PendingStateManager> => ({
		// Similar implementation as the real PSM - queue each message 1-by-1
		onFlushBatch: (batch: BatchMessage[], clientSequenceNumber: number | undefined): void => {
			for (const {
				contents: content = "",
				referenceSequenceNumber,
				metadata: opMetadata,
				localOpMetadata,
			} of batch)
				state.pendingOpContents.push({
					content,
					referenceSequenceNumber,
					opMetadata,
					localOpMetadata,
					batchStartCsn: clientSequenceNumber ?? -1,
				});
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
		messages: addBatchMetadata(messages),
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
		immediateMode?: boolean;
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
					opCountThreshold: Number.POSITIVE_INFINITY,
				},
				mockLogger,
			),
			getCurrentSequenceNumbers: () => currentSeqNumbers,
			reSubmit: (message: PendingMessageResubmitData) => {
				state.opsResubmitted++;
			},
			opReentrancy: () => state.isReentrant,
			closeContainer: (error?: ICriticalContainerError) => {},
		});
	};

	beforeEach(() => {
		state.deltaManagerFlushCalls = 0;
		state.canSendOps = true;
		state.batchesSubmitted = [];
		state.batchesCompressed = [];
		state.batchesSplit = [];
		state.individualOpsSubmitted = [];
		state.pendingOpContents = [];
		state.opsSubmitted = 0;
		state.opsResubmitted = 0;
		state.isReentrant = false;
		currentSeqNumbers = {};
		mockLogger.clear();
	});

	it("Sending batches", () => {
		const outbox = getOutbox({ context: getMockContext() });
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"),
			createMessage(ContainerMessageType.IdAllocation, "3"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "4"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "5"),
		];

		// Flush 1
		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submitIdAllocation(messages[3]);
		outbox.flush();

		// Flush 2
		outbox.submit(messages[4]);
		outbox.flush();

		// Not Flushed
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

		// Note the expected CSN here is fixed to the batch's starting CSN
		const expectedMessageOrderWithCsn = [
			// Flush 1 (ID Allocation)
			[messages[2], 1],
			[messages[3], 1],
			// Flush 1 (Main)
			[messages[0], 3],
			[messages[1], 3],
			// Flush 2 (Main)
			[messages[4], 5],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Flush empty (GroupedBatching enabled)", () => {
		const outbox = getOutbox({
			context: getMockContext(),
			opGroupingConfig: {
				groupedBatchingEnabled: true,
				opCountThreshold: 2,
			},
		});
		currentSeqNumbers.referenceSequenceNumber = 0;
		// Typically, flushing with nothing submitted should be a no-op...
		outbox.flush();
		assert.equal(state.opsSubmitted, 0);
		assert.equal(state.batchesSubmitted.length, 0);
		assert.equal(state.deltaManagerFlushCalls, 0);
		assert.equal(state.pendingOpContents.length, 0);
		const batchId = "batchId";
		// ...But if batchId is provided, it's resubmit, and we need to send an empty batch with the batchId
		outbox.flush(batchId);
		assert.equal(state.opsSubmitted, 1);
		assert.equal(state.batchesSubmitted.length, 1);
		assert.equal(
			state.batchesSubmitted[0].messages[0].contents,
			'{"type":"groupedBatch","contents":[]}',
		);
		assert.equal(state.batchesSubmitted[0].messages[0].metadata?.batchId, batchId);
		assert.equal(
			asEmptyBatchLocalOpMetadata(state.pendingOpContents[0].localOpMetadata)?.emptyBatch,
			true,
		);
	});

	it("Batch ID added when applicable", () => {
		const outbox = getOutbox({
			context: getMockContext(),
			opGroupingConfig: {
				groupedBatchingEnabled: true,
				opCountThreshold: 3,
			},
		});
		// Flush 1 - resubmit multi-message batch including ID Allocation
		outbox.submitIdAllocation(createMessage(ContainerMessageType.IdAllocation, "0")); // Separate batch, batch ID not used
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "1"));
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "2"));
		outbox.flush("batchId-A");

		// Flush 2 - resubmit single-message batch
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "3"));
		outbox.flush("batchId-B");

		// Flush 3 - resubmit blob attach batch
		outbox.submitBlobAttach(createMessage(ContainerMessageType.BlobAttach, "4"));
		outbox.submitBlobAttach(createMessage(ContainerMessageType.BlobAttach, "5"));
		currentSeqNumbers.referenceSequenceNumber = 0;
		outbox.flush("batchId-C");

		// Flush 4 - no batch ID given
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "6"));
		outbox.flush(); // Ignored - No batchID given (not resubmit)

		// Not Flushed (will not appear in batchesSubmitted or pendingOpContents)
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "7"));

		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages.map((m) => m.metadata?.batchId)),
			[
				[undefined], // Flush 1 - ID Allocation (no batch ID used)
				["batchId-A", undefined], // Flush 1 - Main
				["batchId-B"], // Flush 2 - Main
				["batchId-C", undefined], // Flush 3 - Blob Attach
				[undefined], // Flush 4 - Main (no batch ID given)
			],
			"Submitted batches have incorrect batch ID",
		);

		assert.deepEqual(
			state.pendingOpContents.map(({ opMetadata }) => asBatchMetadata(opMetadata)?.batchId),
			[
				undefined, // ID Allocation (no batch ID used)
				"batchId-A",
				undefined, // second message in batch
				"batchId-B",
				"batchId-C",
				undefined, // second message in batch
				undefined, // no batchId given
			],
			"Pending messages have incorrect batch ID",
		);
	});

	it("Will send messages only when allowed, but will store them in the pending state", () => {
		const outbox = getOutbox({ context: getMockContext() });
		const messages = [
			// First batch (canSendOps = true)
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			// Second batch (canSendOps = false)
			createMessage(ContainerMessageType.FluidDataStoreOp, "2"),
		];
		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.flush();

		outbox.submit(messages[2]);
		state.canSendOps = false;
		outbox.flush();

		// First two submitted
		assert.equal(state.opsSubmitted, 2);
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[[batchedMessage(messages[0]), batchedMessage(messages[1])]],
		);
		// All three pending
		assert.deepEqual(
			state.pendingOpContents,
			messages.map<Partial<IPendingMessage>>((message, i) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: i === 2 ? -1 : 1, // Third batch got no CSN as it was not submitted
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
			createMessage(ContainerMessageType.FluidDataStoreOp, "4"),
		];

		// Flush 1
		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);
		outbox.flush();

		// Flush 2
		outbox.submit(messages[4]);
		outbox.flush();

		assert.equal(state.opsSubmitted, messages.length);
		assert.equal(state.batchesSubmitted.length, 0);
		assert.deepEqual(state.individualOpsSubmitted.length, messages.length);
		assert.equal(state.deltaManagerFlushCalls, 3);

		// Note the expected CSN here is fixed to the batch's starting CSN
		const expectedMessageOrderWithCsn = [
			// Flush 1 (ID Allocation)
			[messages[2], 1],
			// Flush 1 (Main)
			[messages[0], 2],
			[messages[1], 2],
			[messages[3], 2],
			// Flush 2 (Main)
			[messages[4], 5],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Compress only if compression is enabled", () => {
		const outbox = getOutbox({
			context: getMockContext(),
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

		// Note the expected CSN here is fixed to the batch's starting CSN
		const expectedMessageOrderWithCsn = [
			// Flush 1 (ID Allocation)
			[messages[2], 1],
			// Flush 1 (Main)
			[messages[0], 2],
			[messages[1], 2],
			[messages[3], 2],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Compress only if the batch is larger than the configured limit", () => {
		const outbox = getOutbox({
			context: getMockContext(),
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

		// Note the expected CSN here is fixed to the batch's starting CSN
		const expectedMessageOrderWithCsn = [
			// Flush 1 (ID Allocation)
			[messages[2], 1],
			// Flush 1 (Main)
			[messages[0], 2],
			[messages[1], 2],
			[messages[3], 2],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Throws at flush, when compression is enabled and the compressed batch is still larger than the threshold", () => {
		const outbox = getOutbox({
			context: getMockContext(),
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
			context: getMockContext(),
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

		// Note the expected CSN here is fixed to the batch's starting CSN
		const expectedMessageOrderWithCsn = [
			// Flush 1 (ID Allocation)
			[messages[2], 1],
			// Flush 1 (Main)
			[messages[0], 2],
			[messages[1], 2],
			[messages[3], 2],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Does not chunk when compression is enabled, compressed batch is smaller than the threshold and chunking is enabled", () => {
		const outbox = getOutbox({
			context: getMockContext(),
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
		const outbox = getOutbox({ context: getMockContext() });
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
			rawMessagesInFlushOrder.map((message, i) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: i + 1, // Each message should have been in its own batch. CSN starts at 1.
			})),
		);

		mockLogger.assertMatch([
			{
				eventName: "Outbox:ReferenceSequenceNumberMismatch",
			},
		]);
	});

	for (const ops of [
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
	]) {
		it("Flushes all batches when an out of order message is detected in either flows", () => {
			const outbox = getOutbox({ context: getMockContext() });
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
	}

	it("Does not flush the batch when an out of order message is detected, if configured", () => {
		const outbox = getOutbox({
			context: getMockContext(),
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
		const outbox = getOutbox({ context: getMockContext() });

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
		const outbox = getOutbox({ context: getMockContext() });

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

		// Note the expected CSN here is fixed to the batch's starting CSN
		const expectedMessageOrderWithCsn = [
			// Flush 1 (Blob Attach)
			[messages[0], 1],
			[messages[2], 1],
			[messages[4], 1],
			// Flush 1 (Main)
			[messages[1], 4],
			[messages[3], 4],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				content: message.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
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
				context: getMockContext(),
				opGroupingConfig: {
					groupedBatchingEnabled: false,
					opCountThreshold: 2,
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
				context: getMockContext(),
				opGroupingConfig: {
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
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
				context: getMockContext(),
				opGroupingConfig: {
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
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
				context: getMockContext(),
				opGroupingConfig: {
					groupedBatchingEnabled: false,
					opCountThreshold: 2,
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
				context: getMockContext(),
				opGroupingConfig: {
					groupedBatchingEnabled: true,
					opCountThreshold: 2,
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
