/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	IBatchMessage,
	IContainerContext,
	IDeltaManager,
} from "@fluidframework/container-definitions";
import {
	IDocumentMessage,
	ISequencedDocumentMessage,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { PendingStateManager } from "../../pendingStateManager";
import { BatchMessage, IBatch, OpCompressor, OpSplitter, Outbox } from "../../opLifecycle";
import {
	CompressionAlgorithms,
	ContainerMessageType,
	ContainerRuntimeMessage,
	ICompressionRuntimeOptions,
} from "../../containerRuntime";

describe("Outbox", () => {
	const maxBatchSizeInBytes = 1024;
	interface State {
		deltaManagerFlushCalls: number;
		canSendOps: boolean;
		batchesSubmitted: IBatchMessage[][];
		batchesCompressed: IBatch[];
		batchesSplit: IBatch[];
		individualOpsSubmitted: any[];
		pendingOpContents: any[];
		opsSubmitted: number;
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
	};

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
		submitBatchFn: (batch: IBatchMessage[]): number => {
			state.batchesSubmitted.push(batch);
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

	const getMockSplitter = (enabled: boolean): Partial<OpSplitter> => ({
		isBatchChunkingEnabled: enabled,
		splitCompressedBatch: (batch: IBatch): IBatch => {
			state.batchesSplit.push(batch);
			return batch;
		},
	});

	const getMockPendingStateManager = (): Partial<PendingStateManager> => ({
		onSubmitMessage: (
			type: ContainerMessageType,
			_clientSequenceNumber: number,
			referenceSequenceNumber: number,
			content: any,
			_localOpMetadata: unknown,
			opMetadata: Record<string, unknown> | undefined,
		): void => {
			state.pendingOpContents.push({ type, content, referenceSequenceNumber, opMetadata });
		},
	});

	const createMessage = (type: ContainerMessageType, contents: string): BatchMessage => {
		const deserializedContent: ContainerRuntimeMessage = { type, contents };
		return {
			contents: JSON.stringify(deserializedContent),
			deserializedContent,
			metadata: { test: true },
			localOpMetadata: {},
			referenceSequenceNumber: Infinity,
		};
	};

	const batchedMessage = (message: BatchMessage, batchMarker: boolean | undefined = undefined) =>
		batchMarker === undefined
			? { contents: message.contents, metadata: message.metadata, compression: undefined }
			: {
					contents: message.contents,
					metadata: { ...message.metadata, batch: batchMarker },
					compression: undefined,
			  };

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
	});

	const DefaultCompressionOptions = {
		minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
		compressionAlgorithm: CompressionAlgorithms.lz4,
	};

	const getOutbox = (
		context: IContainerContext,
		maxBatchSize: number = maxBatchSizeInBytes,
		compressionOptions: ICompressionRuntimeOptions = DefaultCompressionOptions,
		enableChunking: boolean = false,
	) =>
		new Outbox({
			shouldSend: () => state.canSendOps,
			pendingStateManager: getMockPendingStateManager() as PendingStateManager,
			containerContext: context,
			compressor: getMockCompressor() as OpCompressor,
			splitter: getMockSplitter(enableChunking) as OpSplitter,
			config: {
				maxBatchSizeInBytes: maxBatchSize,
				compressionOptions,
			},
			logger: new MockLogger(),
		});

	beforeEach(() => {
		state.deltaManagerFlushCalls = 0;
		state.canSendOps = true;
		state.batchesSubmitted.splice(0);
		state.batchesCompressed.splice(0);
		state.batchesSplit.splice(0);
		state.individualOpsSubmitted.splice(0);
		state.pendingOpContents.splice(0);
		state.opsSubmitted = 0;
	});

	it("Sending batches", () => {
		const outbox = getOutbox(getMockContext() as IContainerContext);
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.Attach, "2"),
			createMessage(ContainerMessageType.Attach, "3"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "4"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "5"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitAttach(messages[2]);
		outbox.submitAttach(messages[3]);

		outbox.flush();

		outbox.submit(messages[4]);
		outbox.flush();

		outbox.submit(messages[5]);

		assert.equal(state.opsSubmitted, messages.length - 1);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.deepEqual(state.batchesSubmitted, [
			[batchedMessage(messages[2], true), batchedMessage(messages[3], false)],
			[batchedMessage(messages[0], true), batchedMessage(messages[1], false)],
			[batchedMessage(messages[4])], // The last message was not batched
		]);
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
				type: message.deserializedContent.type,
				content: message.deserializedContent.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Will send messages only when allowed, but will store them in the pending state", () => {
		const outbox = getOutbox(getMockContext() as IContainerContext);
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
		assert.deepEqual(state.batchesSubmitted, [[batchedMessage(messages[0])]]);
		assert.deepEqual(
			state.pendingOpContents,
			messages.map((message) => ({
				type: message.deserializedContent.type,
				content: message.deserializedContent.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Uses legacy path for legacy contexts", () => {
		const outbox = getOutbox(getMockLegacyContext() as IContainerContext);
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.Attach, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitAttach(messages[2]);
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
				type: message.deserializedContent.type,
				content: message.deserializedContent.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Compress only if compression is enabled", () => {
		const outbox = getOutbox(getMockContext() as IContainerContext, maxBatchSizeInBytes, {
			minimumBatchSizeInBytes: 1,
			compressionAlgorithm: CompressionAlgorithms.lz4,
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.Attach, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitAttach(messages[2]);
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
		assert.deepEqual(state.batchesSubmitted, [
			[batchedMessage(messages[2])],
			[
				batchedMessage(messages[0], true),
				batchedMessage(messages[1]),
				batchedMessage(messages[3], false),
			],
		]);

		const rawMessagesInFlushOrder = [messages[2], messages[0], messages[1], messages[3]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				type: message.deserializedContent.type,
				content: message.deserializedContent.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Compress only if the batch is larger than the configured limit", () => {
		const outbox = getOutbox(getMockContext() as IContainerContext, /* maxBatchSize */ 1, {
			minimumBatchSizeInBytes: 1024,
			compressionAlgorithm: CompressionAlgorithms.lz4,
		});

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.Attach, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitAttach(messages[2]);
		outbox.submit(messages[3]);

		outbox.flush();

		assert.equal(state.opsSubmitted, messages.length);
		assert.equal(state.batchesSubmitted.length, 2);
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.deltaManagerFlushCalls, 0);
		assert.deepEqual(state.batchesCompressed, []);
		assert.deepEqual(state.batchesSubmitted, [
			[batchedMessage(messages[2])],
			[
				batchedMessage(messages[0], true),
				batchedMessage(messages[1]),
				batchedMessage(messages[3], false),
			],
		]);

		const rawMessagesInFlushOrder = [messages[2], messages[0], messages[1], messages[3]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				type: message.deserializedContent.type,
				content: message.deserializedContent.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Compress and send (only) attachment ops if compression is enabled and their size exceed the compression threshold", () => {
		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.Attach, "2"),
			createMessage(ContainerMessageType.Attach, "3"),
			createMessage(ContainerMessageType.Attach, "4"),
			createMessage(ContainerMessageType.Attach, "5"),
			createMessage(ContainerMessageType.Attach, "6"),
			createMessage(ContainerMessageType.Attach, "7"),
		];

		const attachMessages = messages.filter(
			(x) => x.deserializedContent.type === ContainerMessageType.Attach,
		);
		assert.ok(attachMessages.length > 0 && attachMessages[0].contents !== undefined);
		const outbox = getOutbox(getMockContext() as IContainerContext, maxBatchSizeInBytes, {
			minimumBatchSizeInBytes: attachMessages[0].contents.length * 3,
			compressionAlgorithm: CompressionAlgorithms.lz4,
		});

		for (const message of messages) {
			if (message.deserializedContent.type === ContainerMessageType.Attach) {
				outbox.submitAttach(message);
			} else {
				outbox.submit(message);
			}
		}

		// Although there was no explicit flush, the attach messages will get flushed
		// as their size have exceeded the compression threshold.
		assert.equal(state.opsSubmitted, attachMessages.length);
		assert.equal(state.batchesSubmitted.length, 2); // 6 messages in 2 batches
		assert.equal(state.individualOpsSubmitted.length, 0);
		assert.equal(state.deltaManagerFlushCalls, 0);
		assert.deepEqual(state.batchesCompressed, [
			toBatch(attachMessages.slice(0, 3)),
			toBatch(attachMessages.slice(3)),
		]);
		assert.deepEqual(state.batchesSubmitted, [
			toBatch(attachMessages.slice(0, 3)).content.map((x) => batchedMessage(x)),
			toBatch(attachMessages.slice(3)).content.map((x) => batchedMessage(x)),
		]);

		assert.deepEqual(
			state.pendingOpContents,
			attachMessages.map((message) => ({
				type: message.deserializedContent.type,
				content: message.deserializedContent.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Throws at flush, when compression is enabled and the compressed batch is still larger than the threshold", () => {
		const outbox = getOutbox(getMockContext() as IContainerContext, /* maxBatchSize */ 1, {
			minimumBatchSizeInBytes: 1,
			compressionAlgorithm: CompressionAlgorithms.lz4,
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
		const outbox = getOutbox(
			getMockContext() as IContainerContext,
			/* maxBatchSize */ 1,
			{
				minimumBatchSizeInBytes: 1,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
			/* enableChunking */ true,
		);

		const messages = [
			createMessage(ContainerMessageType.FluidDataStoreOp, "0"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "1"),
			createMessage(ContainerMessageType.Attach, "2"),
			createMessage(ContainerMessageType.FluidDataStoreOp, "3"),
		];

		outbox.submit(messages[0]);
		outbox.submit(messages[1]);
		outbox.submitAttach(messages[2]);
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
		assert.deepEqual(state.batchesSubmitted, [
			[batchedMessage(messages[2])],
			[
				batchedMessage(messages[0], true),
				batchedMessage(messages[1]),
				batchedMessage(messages[3], false),
			],
		]);

		const rawMessagesInFlushOrder = [messages[2], messages[0], messages[1], messages[3]];
		assert.deepEqual(
			state.pendingOpContents,
			rawMessagesInFlushOrder.map((message) => ({
				type: message.deserializedContent.type,
				content: message.deserializedContent.contents,
				referenceSequenceNumber: message.referenceSequenceNumber,
				opMetadata: message.metadata,
			})),
		);
	});

	it("Throws at submit, when compression is enabled and the attached compressed batch is still larger than the threshold", () => {
		const outbox = getOutbox(getMockContext() as IContainerContext, /* maxBatchSize */ 1, {
			minimumBatchSizeInBytes: 1,
			compressionAlgorithm: CompressionAlgorithms.lz4,
		});

		const messages = [createMessage(ContainerMessageType.Attach, "0")];

		assert.throws(() => outbox.submitAttach(messages[0]));
		// The batch is compressed
		assert.deepEqual(state.batchesCompressed, [toBatch(messages)]);
		// The batch is not persisted
		assert.deepEqual(state.pendingOpContents, []);
	});
});
