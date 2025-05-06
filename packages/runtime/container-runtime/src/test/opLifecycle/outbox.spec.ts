/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	IDeltaManager,
	IBatchMessage,
	IContainerContext,
} from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import {
	IDocumentMessage,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import Sinon from "sinon";

import type { ICompressionRuntimeOptions } from "../../compressionDefinitions.js";
import { CompressionAlgorithms } from "../../compressionDefinitions.js";
import { makeLegacySendBatchFn } from "../../containerRuntime.js";
import {
	ContainerMessageType,
	type LocalContainerRuntimeMessage,
} from "../../messageTypes.js";
import { asBatchMetadata, asEmptyBatchLocalOpMetadata } from "../../metadata.js";
import {
	OutboundBatchMessage,
	BatchSequenceNumbers,
	OpCompressor,
	OpGroupingManager,
	type OpGroupingManagerConfig,
	OpSplitter,
	type OutboundSingletonBatch,
	Outbox,
	type LocalBatchMessage,
	type OutboundBatch,
	localBatchToOutboundBatch,
	serializeOp,
	type LocalEmptyBatchPlaceholder,
} from "../../opLifecycle/index.js";
import {
	PendingMessageResubmitData,
	PendingStateManager,
	type IPendingMessage,
} from "../../pendingStateManager.js";

function typeFromBatchedOp(message: LocalBatchMessage): string {
	assert(message.runtimeOp !== undefined, "PRECONDITION: runtimeOp is undefined");
	return message.runtimeOp.type;
}

// Make a mock op with distinguishable contents
function op(data: string): LocalContainerRuntimeMessage {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return {
		type: ContainerMessageType.FluidDataStoreOp,
		contents: data as unknown,
	} as LocalContainerRuntimeMessage;
}

describe("Outbox", () => {
	const maxBatchSizeInBytes = 1024;
	interface State {
		deltaManagerFlushCalls: number;
		canSendOps: boolean;
		batchesSubmitted: { messages: IBatchMessage[]; referenceSequenceNumber?: number }[];
		batchesCompressed: OutboundSingletonBatch[];
		batchesSplit: OutboundSingletonBatch[];
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
			submitBatchFn: (messages: IBatchMessage[], referenceSequenceNumber?: number): number => {
				state.batchesSubmitted.push({ messages, referenceSequenceNumber });
				state.opsSubmitted += messages.length;
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
		compressBatch: (batch: OutboundSingletonBatch): OutboundSingletonBatch => {
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
		splitSingletonBatchMessage: (batch: OutboundSingletonBatch): OutboundSingletonBatch => {
			state.batchesSplit.push(batch);
			return batch;
		},
	});

	const getMockPendingStateManager = (): Partial<PendingStateManager> => ({
		// Similar implementation as the real PSM - queue each message 1-by-1
		onFlushBatch: (
			batch: LocalBatchMessage[],
			clientSequenceNumber: number | undefined,
		): void => {
			for (const {
				runtimeOp,
				referenceSequenceNumber,
				metadata: opMetadata,
				localOpMetadata,
			} of batch)
				state.pendingOpContents.push({
					runtimeOp,
					referenceSequenceNumber,
					opMetadata,
					localOpMetadata,
					batchStartCsn: clientSequenceNumber ?? -1,
				});
		},
		onFlushEmptyBatch: (
			{
				metadata: opMetadata,
				localOpMetadata,
				referenceSequenceNumber,
			}: LocalEmptyBatchPlaceholder,
			clientSequenceNumber: number | undefined,
		) =>
			state.pendingOpContents.push({
				referenceSequenceNumber,
				opMetadata,
				localOpMetadata,
				batchStartCsn: clientSequenceNumber,
			}),
	});

	const createMessage = (
		type: ContainerMessageType,
		fakeContents: string,
	): LocalBatchMessage => ({
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		runtimeOp: { type, contents: fakeContents as unknown } as LocalContainerRuntimeMessage,
		metadata: undefined,
		localOpMetadata: {},
		referenceSequenceNumber: Number.POSITIVE_INFINITY,
	});

	const toSubmittedMessage = (
		message: LocalBatchMessage | OutboundBatchMessage,
		batchMarker: boolean | undefined = undefined,
	): IBatchMessage => ({
		contents: "runtimeOp" in message ? serializeOp(message.runtimeOp) : message.contents,
		metadata:
			batchMarker === undefined
				? message.metadata
				: { ...message.metadata, batch: batchMarker },
		compression: undefined,
		referenceSequenceNumber: message.referenceSequenceNumber,
	});

	// Also converts to an OutboundBatchMessage
	const addBatchMetadata = (messages: OutboundBatchMessage[]): void => {
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
	};
	const toOutboundBatch = (messages: LocalBatchMessage[]): OutboundBatch => {
		const outbound = localBatchToOutboundBatch({
			messages,
			referenceSequenceNumber:
				messages.length === 0 ? undefined : messages[0].referenceSequenceNumber,
			hasReentrantOps: false,
		});

		addBatchMetadata(outbound.messages);
		return outbound;
	};

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
		chunkSizeInBytes?: number;
		opGroupingConfig?: OpGroupingManagerConfig;
		immediateMode?: boolean;
		flushPartialBatches?: boolean;
		generateIdAllocationOpIfNeeded?: () => LocalBatchMessage | undefined;
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
				flushPartialBatches: params.flushPartialBatches ?? false,
			},
			logger: mockLogger,
			groupingManager: new OpGroupingManager(
				params.opGroupingConfig ?? {
					groupedBatchingEnabled: false,
				},
				mockLogger,
			),
			getCurrentSequenceNumbers: () => currentSeqNumbers,
			reSubmit: (message: PendingMessageResubmitData) => {
				state.opsResubmitted++;
			},
			opReentrancy: () => state.isReentrant,
			generateIdAllocationOpIfNeeded:
				params.generateIdAllocationOpIfNeeded ?? (() => undefined),
		});
	};

	const opGroupingManager = new OpGroupingManager(
		{
			groupedBatchingEnabled: true,
		},
		mockLogger,
	);

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

	it("localBatchToOutboundBatch", () => {
		const localMessages: LocalBatchMessage[] = [
			{ runtimeOp: op("hello"), referenceSequenceNumber: 4 },
			{ runtimeOp: op("world"), referenceSequenceNumber: 4 },
			{ runtimeOp: op("!"), referenceSequenceNumber: 4 },
		];
		const localBatch = {
			messages: localMessages,
			referenceSequenceNumber: localMessages[0].referenceSequenceNumber,
			hasReentrantOps: false,
		};
		const outboundBatch = localBatchToOutboundBatch(localBatch);

		// Check that contentSizeInBytes and messages' contents are set propertly
		assert.equal(
			outboundBatch.contentSizeInBytes,
			JSON.stringify(op("")).length * 3 + "helloworld!".length,
			"contentSizeInBytes is incorrect",
		);
		assert.equal(outboundBatch.messages.length, 3);
		assert.deepEqual(
			localMessages.map((m) => m.runtimeOp),
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-non-null-assertion
			outboundBatch.messages.map((m) => JSON.parse(m.contents!)),
			"Serialized contents do not match",
		);
	});

	it("Sending batches", () => {
		// Create a Sinon stub for generateIdAllocationOp
		const generateIdAllocationOpStub = Sinon.stub();
		const outbox = getOutbox({
			context: getMockContext(),
			generateIdAllocationOpIfNeeded: generateIdAllocationOpStub, // Pass the stub
		});
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"), // This will be generated now
			// createMessage(ContainerMessageType.IdAllocation, "3"), // This one won't be generated, only one per flush
			createMessage(ContainerMessageType.FluidDataStoreOp, "4"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "5"),
		];

		// Flush 1
		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		// Configure the stub to return the ID alloc op on the first call during flush
		generateIdAllocationOpStub.onCall(0).returns(messages[2]);
		outbox.flush(); // Stub is called here

		// Flush 2
		outbox.submit(messages[4]);
		// Configure the stub to return undefined for the second call (no ID alloc)
		generateIdAllocationOpStub.onCall(1).returns(undefined); //* Is this necessary?
		outbox.flush(); // Stub is called here again

		// Not Flushed
		outbox.submit(messages[5]);

		// Expected ops submitted: 1 (ID Alloc) + 2 (Flush 1 main) + 1 (Flush 2 main) = 4
		assert.equal(state.opsSubmitted, 4, "Ops submitted count is incorrect");
		assert.equal(state.individualOpsSubmitted.length, 0);
		// ID Alloc op [2] was prepended to the main batch [0, 1]
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[
				[
					toSubmittedMessage(messages[2], true), // ID Alloc op generated
					toSubmittedMessage(messages[0]),
					toSubmittedMessage(messages[1], false),
				],
				[toSubmittedMessage(messages[4])], // Flush 2, no ID alloc
			],
			"Submitted batches are incorrect",
		);
		assert.equal(state.deltaManagerFlushCalls, 0);

		// Note the expected CSN here is fixed to the batch's starting CSN
		// Flush 1: ID Alloc [2] gets CSN 1, Main ops [0, 1] get CSN 1
		// Flush 2: Main op [4] gets CSN 4 (1 + 3 ops from previous flush)
		const expectedMessageOrderWithCsn = [
			// Flush 1 (ID Allocation generated + Main)
			[messages[2], 1],
			[messages[0], 1],
			[messages[1], 1],
			// Flush 2 (Main)
			[messages[4], 4],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				runtimeOp: message.runtimeOp,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
			"Pending messages are incorrect",
		);
	});

	it("Flush empty (GroupedBatching enabled)", () => {
		const outbox = getOutbox({
			context: getMockContext(),
			opGroupingConfig: {
				groupedBatchingEnabled: true,
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
		outbox.flush({ batchId, staged: false });
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

	it("Batch ID added when applicable (ungrouped batch)", () => {
		// Create a Sinon stub for generateIdAllocationOp
		const generateIdAllocationOpStub = Sinon.stub<[], LocalBatchMessage | undefined>();
		const outbox = getOutbox({
			context: getMockContext(),
			opGroupingConfig: {
				groupedBatchingEnabled: false,
			},
			generateIdAllocationOpIfNeeded: generateIdAllocationOpStub, // Pass the stub
		});
		const idAllocMessage = createMessage(ContainerMessageType.IdAllocation, "0");
		// Flush 1 - resubmit multi-message batch including ID Allocation
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "1"));
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "2"));
		// Configure stub for first flush
		generateIdAllocationOpStub.onCall(0).returns(idAllocMessage);
		outbox.flush({ batchId: "batchId-A", staged: false });

		// Flush 2 - resubmit single-message batch
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "3"));
		// Configure stub for second flush (no ID alloc)
		generateIdAllocationOpStub.onCall(1).returns(undefined);
		outbox.flush({ batchId: "batchId-B", staged: false });

		// Flush 3 - resubmit blob attach batch
		outbox.submitBlobAttach(createMessage(ContainerMessageType.BlobAttach, "4"));
		outbox.submitBlobAttach(createMessage(ContainerMessageType.BlobAttach, "5"));
		currentSeqNumbers.referenceSequenceNumber = 0;
		// Configure stub for third flush (no ID alloc)
		generateIdAllocationOpStub.onCall(2).returns(undefined);
		outbox.flush({ batchId: "batchId-C", staged: false });

		// Flush 4 - no batch ID given
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "6"));
		// Configure stub for fourth flush (no ID alloc)
		generateIdAllocationOpStub.onCall(3).returns(undefined);
		outbox.flush(); // Ignored - No batchID given (not resubmit)

		// Not Flushed (will not appear in batchesSubmitted or pendingOpContents)
		outbox.submit(createMessage(ContainerMessageType.FluidDataStoreOp, "7"));

		// Expected batches:
		// Flush 1: ID Alloc [0] + Main [1, 2] -> batchId-A applied to first op [0]
		// Flush 2: Main [3] -> batchId-B applied to first op [3]
		// Flush 3: Blob Attach [4, 5] -> batchId-C applied to first op [4]
		// Flush 4: Main [6] -> no batchId
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages.map((m) => m.metadata?.batchId)),
			[
				["batchId-A", undefined, undefined], // Flush 1 - ID Alloc + Main
				["batchId-B"], // Flush 2 - Main
				["batchId-C", undefined], // Flush 3 - Blob Attach
				[undefined], // Flush 4 - Main (no batch ID given)
			],
			"Submitted batches have incorrect batch ID",
		);

		// Expected pending ops:
		// Flush 1: [0] (batchId-A), [1], [2]
		// Flush 2: [3] (batchId-B)
		// Flush 3: [4] (batchId-C), [5]
		// Flush 4: [6] (undefined)
		assert.deepEqual(
			state.pendingOpContents.map(({ opMetadata }) => asBatchMetadata(opMetadata)?.batchId),
			[
				"batchId-A", // ID Allocation generated
				undefined, // second message in batch
				undefined, // third message in batch
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
			[[toSubmittedMessage(messages[0]), toSubmittedMessage(messages[1])]],
		);
		// All three pending
		assert.deepEqual(
			state.pendingOpContents,
			messages.map<Partial<IPendingMessage>>((message, i) => ({
				runtimeOp: message.runtimeOp,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: i === 2 ? -1 : 1, // Third batch got no CSN as it was not submitted
			})),
		);
	});

	it("Uses legacy path for legacy contexts", () => {
		// Create a Sinon stub for generateIdAllocationOp
		const generateIdAllocationOpStub = Sinon.stub<[], LocalBatchMessage | undefined>();
		const outbox = getOutbox({
			context: getMockLegacyContext() as IContainerContext,
			generateIdAllocationOpIfNeeded: generateIdAllocationOpStub, // Pass the stub
		});
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"), // This will be generated
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "4"),
		];

		// Flush 1
		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submit(messages[3]);
		// Configure stub for first flush
		generateIdAllocationOpStub.onCall(0).returns(messages[2]);
		outbox.flush();

		// Flush 2
		outbox.submit(messages[4]);
		// Configure stub for second flush (no ID alloc)
		generateIdAllocationOpStub.onCall(1).returns(undefined);
		outbox.flush();

		// Legacy path submits individually.
		assert.equal(state.opsSubmitted, messages.length);
		assert.equal(state.batchesSubmitted.length, 0);
		assert.deepEqual(state.individualOpsSubmitted.length, messages.length);
		// Flush calls: 1 for ID Alloc + main (Flush 1), 1 for Flush 2 main = 3
		assert.equal(state.deltaManagerFlushCalls, 2);

		// Note the expected CSN here is fixed to the batch's starting CSN
		// Flush 1: ID Alloc [2] + Main ops [0, 1, 3] get CSN 1.
		// Flush 2: Main op [4] gets CSN 5
		const expectedMessageOrderWithCsn = [
			// Flush 1 (ID Allocation generated)
			[messages[2], 1],
			// Flush 1 (Main)
			[messages[0], 1],
			[messages[1], 1],
			[messages[3], 1],
			// Flush 2 (Main)
			[messages[4], 5],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				runtimeOp: message.runtimeOp,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Compress if compression and grouping are enabled", () => {
		// Create a Sinon stub for generateIdAllocationOp
		const generateIdAllocationOpStub = Sinon.stub<[], LocalBatchMessage | undefined>();
		const outbox = getOutbox({
			context: getMockContext(),
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			opGroupingConfig: {
				groupedBatchingEnabled: true,
			},
			generateIdAllocationOpIfNeeded: generateIdAllocationOpStub, // Pass the stub
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"), // This will be generated
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submit(messages[3]);
		// Configure stub for the flush
		generateIdAllocationOpStub.onCall(0).returns(messages[2]);
		outbox.flush();

		// ID Alloc op [2] is generated and prepended to the main batch [0, 1, 3]
		const combinedBatch = toOutboundBatch([
			messages[2],
			messages[0],
			messages[1],
			messages[3],
		]);
		const groupedMessages = opGroupingManager.groupBatch(combinedBatch);

		// Submits 1 op: the grouped and compressed batch containing ID alloc + main ops
		assert.equal(state.opsSubmitted, 1);
		assert.equal(state.batchesSubmitted.length, 1);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.deltaManagerFlushCalls, 0);
		// The combined batch (ID alloc + main) is compressed
		assert.deepEqual(
			state.batchesCompressed,
			[groupedMessages],
			"Compressed batches don't match expected",
		);
		// The single compressed batch is submitted
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[[toSubmittedMessage(groupedMessages.messages[0])]],
			"Submitted batches don't match expected",
		);

		// Expected CSN: All ops [2, 0, 1, 3] get CSN 1 as they are in the same submitted batch
		const expectedMessageOrderWithCsn = [
			[messages[2], 1],
			[messages[0], 1],
			[messages[1], 1],
			[messages[3], 1],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				runtimeOp: message.runtimeOp,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
			"Pending messages don't match expected order/properties",
		);
	});

	it("Does not compress if the batch is smaller than the configured limit", () => {
		// Create a Sinon stub for generateIdAllocationOp
		const generateIdAllocationOpStub = Sinon.stub<[], LocalBatchMessage | undefined>();
		const outbox = getOutbox({
			context: getMockContext(),
			maxBatchSize: 1024,
			opGroupingConfig: {
				groupedBatchingEnabled: true, // Required for compression
			},
			compressionOptions: {
				minimumBatchSizeInBytes: 512,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			generateIdAllocationOpIfNeeded: generateIdAllocationOpStub, // Pass the stub
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"), // This will be generated
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submit(messages[3]);
		// Configure stub for the flush
		generateIdAllocationOpStub.onCall(0).returns(messages[2]);
		outbox.flush();

		// ID Alloc op [2] is generated and prepended to the main batch [0, 1, 3]
		const combinedBatch = toOutboundBatch([
			messages[2],
			messages[0],
			messages[1],
			messages[3],
		]);
		const groupedMessages = opGroupingManager.groupBatch(combinedBatch);

		// Submits 1 op: the grouped batch (ID alloc + main ops), not compressed
		assert.equal(state.opsSubmitted, 1, "Expected 1 op to be submitted for the grouped batch");
		assert.equal(state.batchesSubmitted.length, 1);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.deltaManagerFlushCalls, 0);
		// Batch is not compressed as it's below the threshold
		assert.deepEqual(state.batchesCompressed, []);
		// The single grouped (but not compressed) batch is submitted
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[[toSubmittedMessage(groupedMessages.messages[0])]],
			"Submitted batches don't match expected",
		);

		// Expected CSN: All ops [2, 0, 1, 3] get CSN 1
		const expectedMessageOrderWithCsn = [
			[messages[2], 1],
			[messages[0], 1],
			[messages[1], 1],
			[messages[3], 1],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				runtimeOp: message.runtimeOp,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Throws at flush, when compression and grouping are enabled and the compressed batch is still larger than the threshold", () => {
		const outbox = getOutbox({
			context: getMockContext(),
			maxBatchSize: 1,
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			opGroupingConfig: {
				groupedBatchingEnabled: true,
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

		assert.throws(
			() => outbox.flush(),
			(e: Error) =>
				"dataProcessingCodepath" in e &&
				e.dataProcessingCodepath === "CompressionInsufficient",
			"Expected 'CompressionInsufficient' error",
		);
		// The batch is compressed
		assert.deepEqual(state.batchesCompressed, [
			opGroupingManager.groupBatch(toOutboundBatch(messages)),
		]);
		// The batch is not persisted
		assert.deepEqual(state.pendingOpContents, []);
	});

	it("Chunks when compression is enabled, compressed batch is larger than the threshold and chunking is enabled", () => {
		// Store the ID allocation op to be returned by the mock
		let idAllocOp: LocalBatchMessage | undefined;
		const outbox = getOutbox({
			context: getMockContext(),
			maxBatchSize: 1024,
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			enableChunking: true,
			chunkSizeInBytes: 2,
			opGroupingConfig: {
				groupedBatchingEnabled: true,
			},
			// Provide the mock generateIdAllocationOp
			generateIdAllocationOpIfNeeded: () => {
				const op1 = idAllocOp;
				idAllocOp = undefined; // Consume the op
				return op1;
			},
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"), // This will be generated
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		// No longer call submitIdAllocation directly
		// outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);
		idAllocOp = messages[2]; // Set the op to be generated by the mock

		outbox.flush();

		// ID Alloc op [2] is generated and prepended to the main batch [0, 1, 3]
		const combinedBatch = toOutboundBatch([
			messages[2],
			messages[0],
			messages[1],
			messages[3],
		]);
		const groupedMessages = opGroupingManager.groupBatch(combinedBatch);

		// The combined batch (ID alloc + main) is compressed
		assert.deepEqual(state.batchesCompressed, [groupedMessages]);
		// The compressed batch is split
		assert.deepEqual(state.batchesSplit, [groupedMessages]);
		// The single split batch is submitted
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[[toSubmittedMessage(groupedMessages.messages[0])]],
		);

		// Expected CSN: All ops [2, 0, 1, 3] get CSN 1
		const expectedMessageOrderWithCsn = [
			[messages[2], 1],
			[messages[0], 1],
			[messages[1], 1],
			[messages[3], 1],
		] as const;
		assert.deepEqual(
			state.pendingOpContents,
			expectedMessageOrderWithCsn.map<Partial<IPendingMessage>>(([message, csn]) => ({
				runtimeOp: message.runtimeOp,
				referenceSequenceNumber: message.referenceSequenceNumber,
				localOpMetadata: message.localOpMetadata,
				opMetadata: message.metadata,
				batchStartCsn: csn,
			})),
		);
	});

	it("Does not chunk when compression and grouping are enabled, compressed batch is smaller than the threshold and chunking is enabled", () => {
		// Store the ID allocation op to be returned by the mock
		let idAllocOp: LocalBatchMessage | undefined;
		const outbox = getOutbox({
			context: getMockContext(),
			maxBatchSize: 1024,
			compressionOptions: {
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			enableChunking: true,
			chunkSizeInBytes: 10000,
			opGroupingConfig: {
				groupedBatchingEnabled: true,
			},
			// Provide the mock generateIdAllocationOp
			generateIdAllocationOpIfNeeded: () => {
				const op1 = idAllocOp;
				idAllocOp = undefined; // Consume the op
				return op1;
			},
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.IdAllocation, "2"), // This will be generated
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		// No longer call submitIdAllocation directly
		// outbox.submitIdAllocation(messages[2]);
		outbox.submit(messages[3]);
		idAllocOp = messages[2]; // Set the op to be generated by the mock

		outbox.flush();

		// ID Alloc op [2] is generated and prepended to the main batch [0, 1, 3]
		const combinedBatch = toOutboundBatch([
			messages[2],
			messages[0],
			messages[1],
			messages[3],
		]);
		const groupedMessages = opGroupingManager.groupBatch(combinedBatch);

		// The combined batch (ID alloc + main) is compressed
		assert.deepEqual(state.batchesCompressed, [groupedMessages]);
		// The compressed batch is not split as it's below the chunk size
		assert.deepEqual(state.batchesSplit, []);
		// The single compressed batch is submitted
		assert.deepEqual(
			state.batchesSubmitted.map((x) => x.messages),
			[[toSubmittedMessage(groupedMessages.messages[0])]],
		);
	});

	it("Throws when an out of order message is detected", () => {
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

		assert.throws(
			() => outbox.submit(messages[1]),
			"Since we incremented referenceSequenceNumber to 1, this should throw",
		);
	});

	it("Splits the batch when an out of order message is detected (if partial flushing is enabled)", () => {
		const outbox = getOutbox({
			context: getMockContext(),
			flushPartialBatches: true,
		});
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
			[[toSubmittedMessage(messages[0])], [toSubmittedMessage(messages[1])]],
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
				runtimeOp: message.runtimeOp,
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

	for (const messages of [
		// Test case 1: ID Alloc -> ID Alloc (same RSN) -> Main (higher RSN)
		[
			{
				...createMessage(ContainerMessageType.IdAllocation, "id0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.IdAllocation, "id1"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "main0"),
				referenceSequenceNumber: 1,
			},
		],
		// Test case 2: Main -> Main (same RSN) -> ID Alloc (higher RSN)
		[
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "main0"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.FluidDataStoreOp, "main1"),
				referenceSequenceNumber: 0,
			},
			{
				...createMessage(ContainerMessageType.IdAllocation, "id0"),
				referenceSequenceNumber: 1,
			},
		],
	] as LocalBatchMessage[][]) {
		//* Planning to remove this feature, now that we have good telemetry signal
		it.skip(`Flushes previous ops when an out of order message is detected (if partial flushing is enabled) - Case ${
			typeFromBatchedOp(messages[0]) === ContainerMessageType.IdAllocation ? 1 : 2
		}`, () => {
			// Store the ID allocation op to be returned by the mock
			let idAllocOp: LocalBatchMessage | undefined;
			const outbox = getOutbox({
				context: getMockContext(),
				flushPartialBatches: true,
				// Provide the mock generateIdAllocationOp
				generateIdAllocationOpIfNeeded: () => {
					const op1 = idAllocOp;
					idAllocOp = undefined; // Consume the op
					return op1;
				},
			});

			// Submit messages one by one, updating RSN before the out-of-order one
			currentSeqNumbers.referenceSequenceNumber = messages[0].referenceSequenceNumber;
			outbox.submit(messages[0]); // RSN = 0

			currentSeqNumbers.referenceSequenceNumber = messages[1].referenceSequenceNumber;
			outbox.submit(messages[1]); // RSN = 0

			// This is the out-of-order message
			currentSeqNumbers.referenceSequenceNumber = messages[2].referenceSequenceNumber; // RSN = 1
			if (typeFromBatchedOp(messages[2]) === ContainerMessageType.IdAllocation) {
				// If the out-of-order op is ID Alloc, it needs to be set for generation
				idAllocOp = messages[2];
				// We don't submit it directly, flush will trigger generation
				outbox.flush(); // Flush should happen here due to RSN mismatch
			} else {
				// If the out-of-order op is Main, submit it directly
				outbox.submit(messages[2]); // RSN = 1, triggers flush of previous ops
				outbox.flush(); // Flush the last op
			}

			// Expected: Ops [0, 1] with RSN 0 are flushed first.
			// Then op [2] with RSN 1 is flushed (either generated or submitted).
			// If op[2] was ID Alloc, it's generated and prepended to an empty batch.
			// If op[2] was Main, it's submitted in its own batch.

			const expectedBatches: IBatchMessage[][] = [];
			const expectedPending: Partial<IPendingMessage>[] = [];
			let csn = 1;

			// Batch 1: Ops [0, 1]
			expectedBatches.push([
				toSubmittedMessage(messages[0], true),
				toSubmittedMessage(messages[1], false),
			]);
			expectedPending.push(
				{
					runtimeOp: messages[0].runtimeOp,
					referenceSequenceNumber: messages[0].referenceSequenceNumber,
					localOpMetadata: messages[0].localOpMetadata,
					opMetadata: messages[0].metadata,
					// batchStartCsn: csn,
				},
				{
					runtimeOp: messages[1].runtimeOp,
					referenceSequenceNumber: messages[1].referenceSequenceNumber,
					localOpMetadata: messages[1].localOpMetadata,
					opMetadata: messages[1].metadata,
					// batchStartCsn: csn,
				},
			);
			csn += 2; // Increment CSN by the number of ops in the batch

			// Batch 2: Op [2]
			expectedBatches.push([toSubmittedMessage(messages[2])]);
			expectedPending.push({
				runtimeOp: messages[2].runtimeOp,
				referenceSequenceNumber: messages[2].referenceSequenceNumber,
				localOpMetadata: messages[2].localOpMetadata,
				opMetadata: messages[2].metadata,
				// batchStartCsn: csn,
			});
			csn += 1;

			assert.equal(state.opsSubmitted, messages.length, "Ops submitted count mismatch");
			assert.equal(state.individualOpsSubmitted.length, 0);
			assert.equal(
				state.batchesSubmitted.length,
				2,
				"Expected two batches due to RSN mismatch",
			);
			assert.deepEqual(
				state.batchesSubmitted.map((x) => x.messages),
				expectedBatches,
				"Submitted batches content mismatch",
			);
			assert.deepEqual(state.pendingOpContents, expectedPending, "Pending messages mismatch");

			mockLogger.assertMatch([
				{
					eventName: "Outbox:ReferenceSequenceNumberMismatch",
				},
			]);
		});
	}

	it("Does not throw when an out of order message is detected (if partial flushing is enabled)", () => {
		const outbox = getOutbox({
			context: getMockContext(),
			flushPartialBatches: true,
		});
		const messages: LocalBatchMessage[] = [
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
		];

		assert.doesNotThrow(() => {
			for (const message of messages) {
				currentSeqNumbers.referenceSequenceNumber = message.referenceSequenceNumber;
				outbox.submit(message);
			}
		}, "Shouldn't throw if partial flushing is enabled");
	});

	it("Log at most 3 reference sequence number mismatch events", () => {
		state.isReentrant = true; // This avoids the error being thrown - but it will still log
		const outbox = getOutbox({
			maxBatchSize: Number.POSITIVE_INFINITY,
			context: getMockContext(),
		});

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
			Array.from({ length: 3 }).fill({
				eventName: "Outbox:ReferenceSequenceNumberMismatch",
			}) as Omit<ITelemetryBaseEvent, "category">[],
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
					toSubmittedMessage(messages[0], true),
					toSubmittedMessage(messages[2]),
					toSubmittedMessage(messages[4], false),
				],
				[toSubmittedMessage(messages[1], true), toSubmittedMessage(messages[3], false)],
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
				runtimeOp: message.runtimeOp,
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

		it("batch has a single reentrant op - don't rebase", () => {
			const outbox = getOutbox({
				context: getMockContext(),
				opGroupingConfig: {
					groupedBatchingEnabled: true,
				},
			});

			const messages = [createMessage(ContainerMessageType.FluidDataStoreOp, "0")];

			state.isReentrant = true;
			outbox.submit(messages[0]);
			state.isReentrant = false;

			outbox.flush();

			validateCounts(1, 1, 0);
		});

		it("should group the batch", () => {
			const outbox = getOutbox({
				context: getMockContext(),
				opGroupingConfig: {
					groupedBatchingEnabled: true,
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
